// Supabase 연결
// - 방 채널 (mogakco:<방>:<호점>)
//   Presence: 누가 방에 있고 어디 앉아 있는지 / Broadcast: 이동, 이모트, 배포 버튼
// - 로비 채널 (mogakco:lobby): 공개 방마다 몇 명 있는지 세는 용도
// - Postgres: rooms(사람들이 만든 방), commits(커밋 방명록)
//
// 보안: 채널은 공개라서 받은 값은 전부 validate.ts로 검사하고, 보낸 사람별로 속도를 제한해요.
// 커밋 알림은 Broadcast 내용을 믿지 않고 DB에서 다시 읽어서 진짜 저장된 것만 보여줘요.
//
// 로그인(선택): Supabase Auth의 GitHub 로그인. PKCE 방식이라 GitHub에서 돌아올 때 주소에 붙은
// 일회용 code를 supabase-js가 토큰으로 바꾸고 주소에서 지워요. 토큰은 이 브라우저에만 저장돼요.
import { createClient, type RealtimeChannel, type SupabaseClient, type User } from '@supabase/supabase-js';
import { BUILTIN_ROOMS, MAX_INSTANCE, ROOM_SLUG_RE, builtinRoom, isPlaceId, newRoomSlug, placeMeta, type RoomInfo } from '../config';
import type { AuthUser, Commit, Net, NetEvent, NetHandlers, NewRoom, PeerState } from './types';
import { RateLimiter, cleanCommit, cleanEvent, cleanPeer, text } from './validate';

interface RoomRow {
  slug: string;
  name: string;
  tags: string[] | null;
  is_public: boolean;
  place: string | null;
  creator: string | null;
  created_at: string;
}

const ROOM_COLUMNS = 'slug,name,tags,is_public,place,creator,created_at';
/** 한 방에서 받아들이는 최대 인원 (가짜 Presence를 잔뜩 띄우는 공격 대비) */
const MAX_PEERS = 60;

const AVATAR_RE = /^https:\/\/avatars\.githubusercontent\.com\/[A-Za-z0-9/_.?=&%-]+$/;

/** Supabase 사용자 → 화면에 쓸 최소 정보 (GitHub 아이디, 프로필 사진). 이메일은 버려요 */
function toAuthUser(u: User | null | undefined): AuthUser | null {
  if (!u) return null;
  const m = (u.user_metadata ?? {}) as Record<string, unknown>;
  const login = text(m.user_name ?? m.preferred_username ?? m.name, 39);
  const avatar = typeof m.avatar_url === 'string' && AVATAR_RE.test(m.avatar_url) ? m.avatar_url : null;
  return { id: u.id, login: login || 'github-user', avatar };
}

const toRoom = (r: RoomRow): RoomInfo | null => {
  if (!r || typeof r.slug !== 'string' || !ROOM_SLUG_RE.test(r.slug)) return null;
  return {
    slug: r.slug,
    name: text(r.name, 24) || r.slug,
    tags: Array.isArray(r.tags) ? r.tags.filter((t) => typeof t === 'string').slice(0, 3) : [],
    isPublic: r.is_public === true,
    place: isPlaceId(r.place) ? r.place : 'cafe',
    creator: text(r.creator, 20) || undefined,
    createdAt: new Date(r.created_at).getTime() || undefined,
  };
};

export class OnlineNet implements Net {
  readonly mode = 'online' as const;
  readonly canLogin = true;
  instance = 1;
  room = '';
  private roomPublic = true;
  private cap = 20;
  private sb: SupabaseClient;
  private ch: RealtimeChannel | null = null;
  private lobby: RealtimeChannel | null = null;
  private lobbyReady: Promise<void> | null = null;
  private countCbs: ((c: Record<string, number>) => void)[] = [];
  private self!: PeerState;
  private h!: NetHandlers;
  private trackTimer = 0;
  private checkedCap = false;
  /** 지금 방에 Presence로 들어와 있는 사람들. 여기 없는 id가 보낸 이벤트는 버려요 */
  private present = new Set<string>();
  private limiter = new RateLimiter();
  private pendingCommits = new Set<string>();
  private commitTimer = 0;

  constructor(
    url: string,
    key: string,
    private clientId: string,
  ) {
    this.sb = createClient(url, key, {
      // 로그인 상태를 이 브라우저에 기억하고, 토큰이 만료되기 전에 알아서 새로 받아요
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
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
      // 비공개 방은 select 권한이 없어서 insert 결과를 돌려받지 않음
      const { error } = await this.sb
        .from('rooms')
        .insert({ slug, name: r.name, tags: r.tags, is_public: r.isPublic, place: r.place, creator: r.creator });
      if (!error) return { slug, name: r.name, tags: r.tags, isPublic: r.isPublic, place: r.place, creator: r.creator, createdAt: Date.now() };
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
        for (const metas of Object.values(lobby.presenceState<{ room: string }>())) {
          const m = metas[metas.length - 1] as unknown as { room?: unknown };
          if (typeof m?.room === 'string' && ROOM_SLUG_RE.test(m.room)) counts[m.room] = (counts[m.room] ?? 0) + 1;
        }
        for (const f of this.countCbs) f(counts);
      });
      lobby.subscribe((status) => {
        if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') resolve();
      });
    });
    return this.lobbyReady;
  }

  /** 로비에 "나 지금 이 방에 있어요" 알리기. 비공개 방은 알리지 않음 */
  private async announce() {
    await this.ensureLobby();
    if (!this.lobby) return;
    if (this.roomPublic) await this.lobby.track({ room: this.room });
    else await this.lobby.untrack();
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
    this.cap = placeMeta(room.place).cap;
    this.present.clear();
    this.limiter.clear();
    this.pendingCommits.clear();
  }

  private join(): Promise<void> {
    return new Promise((resolve) => {
      this.checkedCap = false;
      this.h.onStatus?.('connecting');
      const ch = this.sb.channel(`mogakco:${this.room}:${this.instance}`, {
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
          await ch.track(this.self);
          this.h.onStatus?.('online');
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          this.h.onStatus?.('offline');
          resolve();
        } else if (status === 'CLOSED' && this.ch === ch) {
          this.h.onStatus?.('offline');
        }
      });
    });
  }

  /** Broadcast 하나 받기: 검사 → 방에 있는 사람인지 → 속도 제한 */
  private receive(payload: unknown, ch: RealtimeChannel) {
    const e = cleanEvent(payload);
    if (!e) return;
    if (e.type === 'commit') {
      if (!this.limiter.allow('*', 'commit') && this.pendingCommits.size > 0) return;
      if (this.pendingCommits.size < 10) this.pendingCommits.add(e.commit.hash);
      if (!this.commitTimer) this.commitTimer = window.setTimeout(() => void this.flushCommits(ch), 800);
      return;
    }
    if (!this.present.has(e.id) || e.id === this.self.id) return;
    if (!this.limiter.allow(e.id, e.type)) return;
    this.h.onEvent(e);
  }

  /** 알림 받은 커밋을 DB에서 다시 읽어서, 실제로 저장된 것만 화면에 */
  private async flushCommits(ch: RealtimeChannel) {
    this.commitTimer = 0;
    const want = new Set(this.pendingCommits);
    this.pendingCommits.clear();
    const list = await this.loadCommits(this.room);
    if (this.ch !== ch) return;
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

  updateSelf(patch: Partial<PeerState>) {
    Object.assign(this.self, patch);
    // Presence 메시지는 무료 플랜 초당 한도가 낮아서 묶어서 보냄
    clearTimeout(this.trackTimer);
    this.trackTimer = window.setTimeout(() => {
      void this.ch?.track(this.self);
    }, 400);
  }

  send(e: NetEvent) {
    void this.ch?.send({ type: 'broadcast', event: 'ev', payload: e });
  }

  async loadCommits(room: string): Promise<Commit[]> {
    if (!ROOM_SLUG_RE.test(room)) return [];
    const { data, error } = await this.sb
      .from('commits')
      .select('hash,name,msg,lang,created_at')
      .eq('room', room)
      .order('created_at', { ascending: false })
      .limit(30);
    if (error || !data) {
      console.warn('[commits] 불러오기 실패', error?.message);
      return [];
    }
    return data
      .map((r) => cleanCommit({ hash: r.hash, name: r.name, msg: r.msg, lang: r.lang ?? '', at: new Date(r.created_at as string).getTime() }))
      .filter((c): c is Commit => !!c);
  }

  async postCommit(c: Commit) {
    const { error } = await this.sb
      .from('commits')
      .insert({ room: this.room, hash: c.hash, name: c.name, msg: c.msg, lang: c.lang });
    if (error) throw new Error(error.message);
    this.send({ type: 'commit', commit: c });
  }

  // ── 로그인 ───────────────────────────────────
  async currentUser(): Promise<AuthUser | null> {
    // getSession은 GitHub에서 돌아온 직후의 code 교환이 끝날 때까지 기다려줘요
    const { data } = await this.sb.auth.getSession();
    return toAuthUser(data.session?.user);
  }

  onAuthChange(cb: (u: AuthUser | null) => void) {
    this.sb.auth.onAuthStateChange((_event, session) => {
      // 콜백 안에서 다른 Supabase 호출을 기다리면 멈출 수 있어서 바깥으로 미룸 (supabase-js 권장)
      window.setTimeout(() => cb(toAuthUser(session?.user)), 0);
    });
  }

  async signIn() {
    // 로그인이 끝나면 지금 보고 있던 방 주소로 돌아옴 (Supabase의 Redirect URLs에 등록된 주소만 허용)
    const { error } = await this.sb.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: location.origin + location.pathname },
    });
    if (error) throw new Error(error.message);
  }

  async signOut() {
    // 이 브라우저에서만 로그아웃
    const { error } = await this.sb.auth.signOut({ scope: 'local' });
    if (error) throw new Error(error.message);
  }
}
