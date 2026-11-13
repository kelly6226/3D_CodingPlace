// Supabase 연결
// - 방 채널 (mogakco:<방>:<호점>)
//   Presence: 누가 방에 있고 어디 앉아 있는지 / Broadcast: 이동, 이모트, 배포 버튼
// - 로비 채널 (mogakco:lobby): 공개 방마다 몇 명 있는지 세는 용도
// - Postgres: rooms(사람들이 만든 방), commits(커밋 방명록)
//
// 보안: 채널은 공개라서 받은 값은 전부 validate.ts로 검사하고, 보낸 사람별로 속도를 제한해요.
// 커밋 알림은 Broadcast 내용을 믿지 않고 DB에서 다시 읽어서 진짜 저장된 것만 보여줘요.
//
// 비밀번호 방(가벼운 잠금): 비밀번호에서 나온 값(net/roomKey.ts)을 채널 이름 끝에 붙여서, 비밀번호를 아는 사람끼리만 같은 채널에 모여요.
//   서버(room_key_ok)에는 확인값만 맡겨요. 로그인은 없어요.
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import {
  BUILTIN_ROOMS,
  DEFAULT_NOISE,
  MAX_INSTANCE,
  PRESENCE_MIN_GAP_MS,
  REJOIN_DELAY_MS,
  ROOM_SLUG_RE,
  builtinRoom,
  isNoiseId,
  isPlaceId,
  newRoomSlug,
  placeMeta,
  type RoomInfo,
} from '../config';
import * as store from '../store';
import type { Commit, JoinResult, Net, NetEvent, NetHandlers, NewRoom, PeerState, RoomTimeReport, RoomToday } from './types';
import { maskIfBad } from './badwords';
import { deriveRoomKey } from './roomKey';
import { COMMIT_REFRESH_GAP_MS, RateLimiter, cleanCommit, cleanEvent, cleanPeer, cleanRoomToday, cleanRoomsToday, text } from './validate';

interface RoomRow {
  slug: string;
  name: string;
  tags: string[] | null;
  is_public: boolean;
  place: string | null;
  noise: string | null;
  creator: string | null;
  created_at: string;
  has_password: boolean | null;
}

const ROOM_COLUMNS = 'slug,name,tags,is_public,place,noise,creator,created_at,has_password';
/** 한 방에서 받아들이는 최대 인원 (가짜 Presence를 잔뜩 띄우는 공격 대비) */
const MAX_PEERS = 60;
/** 내 상태가 바뀐 뒤 Presence로 보내기 전에 모아두는 시간 */
const PRESENCE_BATCH_MS = 400;
/** 로비 track이 실패했을 때 다시 해보는 최대 횟수 */
const LOBBY_TRACK_RETRIES = 3;

/** 로비에 "나 여기 있어요"를 다시 알리는 간격. 서버가 조용히 내 기록을 잃어도 이 안에 복구돼요 */
const LOBBY_HEARTBEAT_MS = 60_000;
/** 커밋 알림을 받은 뒤 DB를 읽기까지 모아두는 시간 (같이 온 알림을 한 번에 읽으려고) */
const COMMIT_FLUSH_DELAY_MS = 800;
/** 한 번 읽을 때 확인할 커밋 해시 수 (가짜 알림으로 메모리가 늘지 않게) */
const MAX_PENDING_COMMITS = 10;

/** track이 'ok'가 아니면 콘솔에 남겨요 (한도 초과 등을 나중에 알아볼 수 있게) */
const warnIfTrackFailed = (result: string) => {
  if (result !== 'ok') console.warn('[presence] track 실패', result);
};

const toRoom = (r: RoomRow): RoomInfo | null => {
  if (!r || typeof r.slug !== 'string' || !ROOM_SLUG_RE.test(r.slug)) return null;
  return {
    slug: r.slug,
    name: maskIfBad(text(r.name, 24)) || r.slug,
    tags: Array.isArray(r.tags) ? r.tags.filter((t) => typeof t === 'string').slice(0, 3) : [],
    isPublic: r.is_public === true,
    hasPassword: r.has_password === true,
    place: isPlaceId(r.place) ? r.place : 'cafe',
    noise: isNoiseId(r.noise) ? r.noise : DEFAULT_NOISE,
    creator: maskIfBad(text(r.creator, 20)) || undefined,
    createdAt: new Date(r.created_at).getTime() || undefined,
  };
};

export class OnlineNet implements Net {
  readonly mode = 'online' as const;
  readonly canLockRooms = true;
  readonly keepsRoomStats = true;
  instance = 1;
  room = '';
  private roomPublic = true;
  /** 지금 방이 비밀번호 방인지 */
  private roomLocked = false;
  private cap = 20;
  private sb: SupabaseClient;
  private ch: RealtimeChannel | null = null;
  private lobby: RealtimeChannel | null = null;
  private lobbyReady: Promise<void> | null = null;
  private lobbyRejoinTimer = 0;
  private lobbyRefreshTimer = 0;
  private lobbyHeartbeatOn = false;
  private countCbs: ((c: Record<string, number>) => void)[] = [];
  private self!: PeerState;
  private h!: NetHandlers;
  private trackTimer = 0;
  /** 마지막으로 Presence track을 보낸 시각 (로비 포함). PRESENCE_MIN_GAP_MS를 지키는 데 써요 */
  private lastTrackAt = 0;
  private checkedCap = false;
  /** 지금 방에 Presence로 들어와 있는 사람들. 여기 없는 id가 보낸 이벤트는 버려요 */
  private present = new Set<string>();
  private limiter = new RateLimiter();
  private pendingCommits = new Set<string>();
  /** 숨겨진 커밋 알림을 받아서 다음에 읽을 때 목록 전체를 바꿔야 하는지 */
  private reloadAllCommits = false;
  private commitTimer = 0;
  private lastCommitFlushAt = 0;

  constructor(
    url: string,
    key: string,
    private clientId: string,
  ) {
    this.sb = createClient(url, key, {
      // 로그인이 없어서 브라우저에 세션을 저장하지도, 주소의 code를 토큰으로 바꾸려 하지도 않아요
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      // 백그라운드 탭에서도 하트비트가 끊기지 않게 Web Worker에서 돌림
      realtime: { worker: true, params: { eventsPerSecond: 10 } },
    });
  }

  // ── 방 목록 ───────────────────────────────────
  async listRooms(): Promise<RoomInfo[]> {
    const { data, error } = await this.sb
      .from('rooms')
      .select(ROOM_COLUMNS)
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .limit(60);
    if (error) console.warn('[rooms] 불러오기 실패', error.message);
    const made = ((data as RoomRow[] | null) ?? []).map(toRoom).filter((r): r is RoomInfo => !!r);
    return [...BUILTIN_ROOMS, ...made.filter((r) => !builtinRoom(r.slug))];
  }

  async getRoom(slug: string): Promise<RoomInfo | null> {
    if (!ROOM_SLUG_RE.test(slug)) return null;
    const b = builtinRoom(slug);
    if (b) return b;
    // 비공개 방은 목록 조회로는 안 보여서 slug로 찾는 함수를 따로 씀
    const { data, error } = await this.sb.rpc('get_room', { p_slug: slug });
    if (error) {
      console.warn('[rooms] 방 찾기 실패', error.message);
      return null;
    }
    const row = (Array.isArray(data) ? data[0] : data) as RoomRow | undefined;
    return row ? toRoom(row) : null;
  }

  async createRoom(r: NewRoom): Promise<RoomInfo> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const slug = newRoomSlug();
      // 비밀번호 방: 방 주소를 소금으로 열쇠를 만들어 확인값만 맡겨요 (원문은 안 보내요)
      const key = r.password ? await deriveRoomKey(slug, r.password) : null;
      // 비공개 방은 select 권한이 없어서 insert 결과를 돌려받지 않음
      const { error } = await this.sb
        .from('rooms')
        .insert({ slug, name: r.name, tags: r.tags, is_public: r.isPublic, place: r.place, noise: r.noise, creator: r.creator, ...(key && { pw_check: key.check }) });
      if (!error) {
        // 만든 사람은 비밀번호를 다시 묻지 않아요
        if (key) store.setRoomKey(slug, key);
        return { slug, name: r.name, tags: r.tags, isPublic: r.isPublic, hasPassword: !!key, place: r.place, noise: r.noise, creator: r.creator, createdAt: Date.now() };
      }
      if (error.code !== '23505') throw new Error(error.message); // 23505 = slug 겹침 → 다시
    }
    throw new Error('방 주소를 만들지 못했어요');
  }

  watchCounts(cb: (counts: Record<string, number>) => void) {
    this.countCbs.push(cb);
    void this.ensureLobby();
  }

  private ensureLobby(): Promise<void> {
    if (this.lobbyReady) return this.lobbyReady;
    this.lobbyReady = new Promise((resolve) => {
      const lobby = this.sb.channel('mogakco:lobby', {
        config: { presence: { key: this.clientId, enabled: true } },
      });
      this.lobby = lobby;
      lobby.on('presence', { event: 'sync' }, () => {
        const counts: Record<string, number> = {};
        const state = lobby.presenceState<{ room: string }>();
        for (const metas of Object.values(state)) {
          const m = metas[metas.length - 1] as unknown as { room?: unknown };
          if (typeof m?.room === 'string' && ROOM_SLUG_RE.test(m.room)) counts[m.room] = (counts[m.room] ?? 0) + 1;
        }
        // 개발 서버에서만: 인원수가 안 맞을 때 로비에 누가 몇 개 기록으로 들어와 있는지 콘솔에서 볼 수 있게
        if (import.meta.env.DEV) console.debug('[lobby] sync', { clients: Object.keys(state).length, counts, metasPerClient: Object.values(state).map((v) => v.length) });
        for (const f of this.countCbs) f(counts);
      });
      let subscribedBefore = false;
      lobby.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // 연결이 끊겼다 다시 붙으면 서버는 내가 어느 방에 있는지 잊어서, 다시 알려야 인원수에서 안 빠져요
          if (subscribedBefore) void this.trackLobby();
          subscribedBefore = true;
        }
        if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') resolve();
        // 서버가 채널을 닫거나 에러가 나면 라이브러리는 다시 붙지 않아서(방 채널과 같아요) 직접 다시 들어가요
        if (status !== 'SUBSCRIBED') this.rejoinLobbyLater(lobby);
      });
    });
    return this.lobbyReady;
  }

  /** 로비에 "나 지금 이 방에 있어요" 알리기. 비공개 방은 알리지 않음 */
  private async announce() {
    await this.ensureLobby();
    this.startLobbyHeartbeat();
    await this.trackLobby();
  }

  /** 로비에 내 방을 알려요. 한도 초과 등으로 실패하면 한도가 풀릴 때쯤 다시 해봐요 */
  private async trackLobby(retriesLeft = LOBBY_TRACK_RETRIES) {
    const lobby = this.lobby;
    if (!lobby || !this.room) return;
    if (!this.roomPublic) {
      await lobby.untrack();
      return;
    }
    const result = await this.trackAndRecordTime(lobby, { room: this.room });
    warnIfTrackFailed(result);
    if (result !== 'ok' && retriesLeft > 0) {
      window.setTimeout(() => {
        if (this.lobby === lobby) void this.trackLobby(retriesLeft - 1);
      }, PRESENCE_MIN_GAP_MS);
    }
  }

  /**
   * 채널이 안 닫혔는데 서버가 내 기록만 잃은 경우(탭이 오래 백그라운드에 있었을 때 등)를 위해,
   * 1분마다와 화면이 다시 보일 때 내 방을 로비에 다시 알려요. 한도(PRESENCE_MIN_GAP_MS)는 지켜요.
   */
  private startLobbyHeartbeat() {
    if (this.lobbyHeartbeatOn) return;
    this.lobbyHeartbeatOn = true;
    window.setInterval(() => this.refreshLobby(), LOBBY_HEARTBEAT_MS);
    document.addEventListener('visibilitychange', () => this.refreshLobby());
  }

  private refreshLobby() {
    if (document.visibilityState !== 'visible' || !this.room || !this.roomPublic || this.lobbyRefreshTimer) return;
    const wait = Math.max(0, this.lastTrackAt + PRESENCE_MIN_GAP_MS - Date.now());
    this.lobbyRefreshTimer = window.setTimeout(() => {
      this.lobbyRefreshTimer = 0;
      if (this.lobby?.state === 'joined') void this.trackLobby(0);
    }, wait);
  }

  /** 로비 채널이 닫히면 잠시 뒤 새로 만들어서 다시 들어가요 */
  private rejoinLobbyLater(closed: RealtimeChannel) {
    if (this.lobby !== closed || this.lobbyRejoinTimer) return;
    console.warn('[lobby] 채널이 끊겨서 다시 연결해요');
    this.lobbyRejoinTimer = window.setTimeout(async () => {
      this.lobbyRejoinTimer = 0;
      if (this.lobby !== closed) return; // 그 사이 이미 바뀌었으면 그만
      if (closed.state === 'joined') return; // 라이브러리가 그 사이 스스로 다시 붙었으면 그대로 둠
      this.lobby = null; // removeChannel이 부르는 CLOSED 콜백이 또 재접속하지 않게
      this.lobbyReady = null;
      await this.sb.removeChannel(closed);
      await this.announce();
    }, REJOIN_DELAY_MS);
  }

  // ── 방 안 ─────────────────────────────────────
  async connect(self: PeerState, h: NetHandlers, room: RoomInfo, instance = 1) {
    this.self = self;
    this.h = h;
    this.setRoom(room);
    this.instance = Math.max(1, Math.min(MAX_INSTANCE, instance));
    void this.announce();
    await this.join();
  }

  async switchRoom(room: RoomInfo) {
    const old = this.ch;
    this.ch = null;
    if (old) await this.sb.removeChannel(old);
    this.setRoom(room);
    this.instance = 1;
    void this.announce();
    await this.join();
  }

  private setRoom(room: RoomInfo) {
    this.room = room.slug;
    this.roomPublic = room.isPublic;
    this.roomLocked = room.hasPassword === true;
    this.cap = placeMeta(room.place).cap;
    // 보내려고 기다리던 track은 새 채널이 연결될 때 최신 상태로 나가요
    clearTimeout(this.trackTimer);
    this.trackTimer = 0;
    this.present.clear();
    this.limiter.clear();
    clearTimeout(this.commitTimer);
    this.commitTimer = 0;
    this.pendingCommits.clear();
    this.reloadAllCommits = false;
  }

  /** 방 채널 이름. 비밀번호 방은 끝에 열쇠 값이 붙어서, 비밀번호를 모르면 어느 채널인지 알 수 없어요. 열쇠가 없으면 null */
  private roomTopic(): string | null {
    const base = `mogakco:${this.room}:${this.instance}`;
    if (!this.roomLocked) return base;
    const key = store.getRoomKey(this.room);
    return key ? `${base}:${key.topic}` : null;
  }

  private async join(): Promise<void> {
    const topic = this.roomTopic();
    if (!topic) {
      // 비밀번호를 맞히기 전에는 들어올 수 없어요 (화면이 먼저 물어보니까 보통은 여기 안 와요)
      this.h.onStatus?.('offline');
      return;
    }
    return new Promise((resolve) => {
      this.checkedCap = false;
      this.h.onStatus?.('connecting');
      const ch = this.sb.channel(topic, {
        config: { presence: { key: this.self.id }, broadcast: { self: false } },
      });
      this.ch = ch;

      ch.on('presence', { event: 'sync' }, () => {
        if (this.ch !== ch) return;
        const state = ch.presenceState<Record<string, unknown>>();
        const peers: PeerState[] = [];
        for (const [key, metas] of Object.entries(state)) {
          if (key === this.self.id || !metas.length) continue;
          // 같은 사람이 탭을 여러 개 열었으면 마지막 것만. 검사를 통과한 것만 받아요
          const p = cleanPeer(metas[metas.length - 1], key);
          if (p) peers.push(p);
          if (peers.length >= MAX_PEERS) break;
        }
        this.present = new Set(peers.map((p) => p.id));
        if (!this.checkedCap) {
          this.checkedCap = true;
          if (this.overCapacity(peers)) return;
        }
        this.h.onPeers(peers);
      });

      ch.on('broadcast', { event: 'ev' }, ({ payload }) => {
        if (this.ch === ch) this.receive(payload, ch);
      });

      ch.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          warnIfTrackFailed(await this.trackAndRecordTime(ch, this.self));
          this.h.onStatus?.('online');
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          this.h.onStatus?.('offline');
          resolve();
        } else if (status === 'CLOSED' && this.ch === ch) {
          this.h.onStatus?.('offline');
          this.rejoinLater(ch);
        }
      });
    });
  }

  /** Broadcast 하나 받기: 검사 → 방에 있는 사람인지 → 속도 제한 */
  private receive(payload: unknown, ch: RealtimeChannel) {
    const e = cleanEvent(payload);
    if (!e) return;
    if (e.type === 'commit') {
      this.queueCommit(e.commit.hash, ch);
      return;
    }
    if (e.type === 'commitHidden') {
      this.reloadAllCommits = true;
      this.queueCommit(null, ch);
      return;
    }
    if (!this.present.has(e.id) || e.id === this.self.id) return;
    if (!this.limiter.allow(e.id, e.type)) return;
    this.h.onEvent(e);
  }

  /**
   * 커밋 알림은 버리지 않고 모아 두되, DB를 읽는 건 COMMIT_REFRESH_GAP_MS에 한 번만.
   * (알림을 간격으로 버리면 진짜 커밋도 놓치고, 안 버리면 가짜 알림이 DB 읽기로 번져요)
   */
  private queueCommit(hash: string | null, ch: RealtimeChannel) {
    if (hash && this.pendingCommits.size < MAX_PENDING_COMMITS) this.pendingCommits.add(hash);
    if (this.commitTimer) return;
    const wait = Math.max(COMMIT_FLUSH_DELAY_MS, this.lastCommitFlushAt + COMMIT_REFRESH_GAP_MS - Date.now());
    this.commitTimer = window.setTimeout(() => void this.flushCommits(ch), wait);
  }

  /** 알림 받은 커밋을 DB에서 다시 읽어서, 실제로 저장된 것만 화면에 */
  private async flushCommits(ch: RealtimeChannel) {
    this.commitTimer = 0;
    this.lastCommitFlushAt = Date.now();
    const want = new Set(this.pendingCommits);
    this.pendingCommits.clear();
    const reloadAll = this.reloadAllCommits;
    this.reloadAllCommits = false;
    const list = await this.loadCommits(this.room);
    if (this.ch !== ch) return;
    if (reloadAll) this.h.onCommits?.(list);
    for (const c of list.filter((x) => want.has(x.hash)).reverse()) this.h.onEvent({ type: 'commit', commit: c });
  }

  /** 정원이 넘쳤고 내가 늦게 들어온 쪽이면 다음 호점으로 이동 */
  private overCapacity(peers: PeerState[]): boolean {
    if (peers.length < this.cap || this.instance >= MAX_INSTANCE) return false;
    const earlier = peers.filter((p) => p.joinedAt < this.self.joinedAt).length;
    if (earlier < this.cap) return false;
    const old = this.ch;
    this.ch = null;
    void (async () => {
      if (old) await this.sb.removeChannel(old);
      this.instance += 1;
      this.h.onRoomChange?.(this.instance);
      await this.join();
    })();
    return true;
  }

  /**
   * Presence track을 보내면서 보낸 시각을 기록해요.
   * updateSelf가 호출 한도를 지키려면 로비를 포함한 모든 track이 시각을 남겨야 해서 한 함수로 모았어요.
   */
  private trackAndRecordTime(channel: RealtimeChannel, payload: object) {
    this.lastTrackAt = Date.now();
    return channel.track(payload);
  }

  /** 서버가 채널을 닫으면(phx_close) 라이브러리는 다시 붙지 않아서, 잠시 뒤 직접 다시 들어가요 */
  private rejoinLater(closed: RealtimeChannel) {
    window.setTimeout(async () => {
      if (this.ch !== closed) return; // 그 사이 방을 옮겼으면 그만
      this.ch = null; // removeChannel이 부르는 CLOSED 콜백이 또 재접속하지 않게
      await this.sb.removeChannel(closed);
      await this.join();
    }, REJOIN_DELAY_MS);
  }

  updateSelf(patch: Partial<PeerState>) {
    Object.assign(this.self, patch);
    // Presence는 클라이언트당 30초 5번 한도가 있어서(config.ts PRESENCE_MIN_GAP_MS) 모아서 보내요.
    // 이미 예약돼 있으면 그때 가장 최신 this.self가 나가요.
    if (this.trackTimer) return;
    const wait = Math.max(PRESENCE_BATCH_MS, this.lastTrackAt + PRESENCE_MIN_GAP_MS - Date.now());
    this.trackTimer = window.setTimeout(() => {
      this.trackTimer = 0;
      if (this.ch) void this.trackAndRecordTime(this.ch, this.self).then(warnIfTrackFailed);
    }, wait);
  }

  send(e: NetEvent) {
    void this.ch?.send({ type: 'broadcast', event: 'ev', payload: e });
  }

  async loadCommits(room: string): Promise<Commit[]> {
    if (!ROOM_SLUG_RE.test(room)) return [];
    // 비밀번호 방(이 브라우저에 열쇠가 있는 방)은 표를 직접 못 읽어서 확인값을 실어 함수로 읽어요
    const key = store.getRoomKey(room);
    const { data, error } = key
      ? await this.sb.rpc('locked_commits', { p_slug: room, p_check: key.check })
      : await this.sb
          .from('commits')
          .select('hash,name,msg,lang,created_at')
          .eq('room', room)
          .order('created_at', { ascending: false })
          .limit(30);
    if (error || !data) {
      console.warn('[commits] 불러오기 실패', error?.message);
      return [];
    }
    return (data as { hash: string; name: string; msg: string; lang: string | null; created_at: string }[])
      .map((r) => cleanCommit({ hash: r.hash, name: r.name, msg: r.msg, lang: r.lang ?? '', at: new Date(r.created_at).getTime() }))
      .filter((c): c is Commit => !!c);
  }

  async postCommit(c: Commit) {
    const key = store.getRoomKey(this.room);
    const { error } = key
      ? await this.sb.rpc('locked_commit', { p_slug: this.room, p_check: key.check, p_hash: c.hash, p_name: c.name, p_msg: c.msg, p_lang: c.lang })
      : await this.sb.from('commits').insert({ room: this.room, hash: c.hash, name: c.name, msg: c.msg, lang: c.lang });
    if (error) throw new Error(error.message);
    this.send({ type: 'commit', commit: c });
  }

  async reportCommit(hash: string, reporter: string): Promise<boolean> {
    const key = store.getRoomKey(this.room);
    const { data, error } = await this.sb.rpc('report_commit', { p_room: this.room, p_hash: hash, p_reporter: reporter, p_check: key?.check ?? null });
    if (error) throw new Error(error.message);
    const hidden = data === true;
    // 모두에게서 숨겨졌으면 방 사람들에게 다시 읽으라고 알려요
    if (hidden) this.send({ type: 'commitHidden', hash });
    return hidden;
  }

  // ── 비밀번호 방 ───────────────────────────────
  async hasRoomAccess(room: RoomInfo): Promise<boolean> {
    return !room.hasPassword || store.getRoomKey(room.slug) !== null;
  }

  async joinRoom(slug: string, password: string): Promise<JoinResult> {
    if (!ROOM_SLUG_RE.test(slug)) return 'error';
    const key = await deriveRoomKey(slug, password);
    const { data, error } = await this.sb.rpc('room_key_ok', { p_slug: slug, p_check: key.check });
    if (error) {
      console.warn('[rooms] 비밀번호 확인 실패', error.message);
      return 'error';
    }
    if (data !== true) return 'wrong';
    store.setRoomKey(slug, key);
    return 'ok';
  }

  // ── 같이 하는 시간 (방별 기록) ─────────────────────
  async addRoomTime(room: string, { minutes, visit }: RoomTimeReport) {
    if (!ROOM_SLUG_RE.test(room)) return;
    const { error } = await this.sb.rpc('add_room_time', {
      p_room: room,
      p_minutes: Math.max(0, Math.min(5, Math.floor(minutes))),
      p_visit: visit,
      p_check: store.getRoomKey(room)?.check ?? null,
    });
    if (error) console.warn('[room time] 기록 실패', error.message);
  }

  async loadRoomToday(room: string): Promise<RoomToday | null> {
    if (!ROOM_SLUG_RE.test(room)) return null;
    const { data, error } = await this.sb.rpc('room_today', { p_room: room });
    if (error) {
      console.warn('[room time] 오늘 기록 읽기 실패', error.message);
      return null;
    }
    return cleanRoomToday(data);
  }

  async loadRoomsToday(): Promise<Record<string, RoomToday>> {
    const { data, error } = await this.sb.rpc('rooms_today');
    if (error) {
      console.warn('[room time] 방 목록 기록 읽기 실패', error.message);
      return {};
    }
    return cleanRoomsToday(data);
  }
}
