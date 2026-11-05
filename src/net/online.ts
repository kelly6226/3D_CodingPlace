// Supabase 연결
// - 방 채널 (mogakco:<방>:<호점>)
//   Presence: 누가 방에 있고 어디 앉아 있는지 / Broadcast: 이동, 이모트, 배포 버튼
// - 로비 채널 (mogakco:lobby): 공개 방마다 몇 명 있는지 세는 용도
// - Postgres: rooms(사람들이 만든 방), commits(커밋 방명록)
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { BUILTIN_ROOMS, MAX_INSTANCE, ROOM_CAP, builtinRoom, newRoomSlug, type RoomInfo } from '../config';
import type { Commit, Net, NetEvent, NetHandlers, NewRoom, PeerState } from './types';

interface RoomRow {
  slug: string;
  name: string;
  tags: string[] | null;
  is_public: boolean;
  creator: string | null;
  created_at: string;
}

const toRoom = (r: RoomRow): RoomInfo => ({
  slug: r.slug,
  name: r.name,
  tags: r.tags ?? [],
  isPublic: r.is_public,
  creator: r.creator ?? undefined,
  createdAt: new Date(r.created_at).getTime(),
});

export class OnlineNet implements Net {
  readonly mode = 'online' as const;
  instance = 1;
  room = '';
  private roomPublic = true;
  private sb: SupabaseClient;
  private ch: RealtimeChannel | null = null;
  private lobby: RealtimeChannel | null = null;
  private lobbyReady: Promise<void> | null = null;
  private countCbs: ((c: Record<string, number>) => void)[] = [];
  private self!: PeerState;
  private h!: NetHandlers;
  private trackTimer = 0;
  private checkedCap = false;

  constructor(
    url: string,
    key: string,
    private clientId: string,
  ) {
    this.sb = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      // 백그라운드 탭에서도 하트비트가 끊기지 않게 Web Worker에서 돌림
      realtime: { worker: true, params: { eventsPerSecond: 10 } },
    });
  }

  // ── 방 목록 ───────────────────────────────────
  async listRooms(): Promise<RoomInfo[]> {
    const { data, error } = await this.sb
      .from('rooms')
      .select('slug,name,tags,is_public,creator,created_at')
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .limit(60);
    if (error) console.warn('[rooms] 불러오기 실패', error.message);
    const made = (data as RoomRow[] | null)?.map(toRoom) ?? [];
    return [...BUILTIN_ROOMS, ...made.filter((r) => !builtinRoom(r.slug))];
  }

  async getRoom(slug: string): Promise<RoomInfo | null> {
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
        .insert({ slug, name: r.name, tags: r.tags, is_public: r.isPublic, creator: r.creator });
      if (!error) return { slug, name: r.name, tags: r.tags, isPublic: r.isPublic, creator: r.creator, createdAt: Date.now() };
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
          const m = metas[metas.length - 1] as unknown as { room?: string };
          if (m?.room) counts[m.room] = (counts[m.room] ?? 0) + 1;
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
    this.room = room.slug;
    this.roomPublic = room.isPublic;
    this.instance = Math.max(1, Math.min(MAX_INSTANCE, instance));
    void this.announce();
    await this.join();
  }

  async switchRoom(room: RoomInfo) {
    const old = this.ch;
    this.ch = null;
    if (old) await this.sb.removeChannel(old);
    this.room = room.slug;
    this.roomPublic = room.isPublic;
    this.instance = 1;
    void this.announce();
    await this.join();
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
        const state = ch.presenceState<PeerState>();
        const peers: PeerState[] = [];
        for (const [key, metas] of Object.entries(state)) {
          if (key === this.self.id || !metas.length) continue;
          // 같은 사람이 탭을 여러 개 열었으면 마지막 것만
          peers.push(metas[metas.length - 1] as unknown as PeerState);
        }
        if (!this.checkedCap) {
          this.checkedCap = true;
          if (this.overCapacity(peers)) return;
        }
        this.h.onPeers(peers);
      });

      ch.on('broadcast', { event: 'ev' }, ({ payload }) => {
        if (this.ch === ch) this.h.onEvent(payload as NetEvent);
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

  /** 정원이 넘쳤고 내가 늦게 들어온 쪽이면 다음 호점으로 이동 */
  private overCapacity(peers: PeerState[]): boolean {
    if (peers.length < ROOM_CAP || this.instance >= MAX_INSTANCE) return false;
    const earlier = peers.filter((p) => p.joinedAt < this.self.joinedAt).length;
    if (earlier < ROOM_CAP) return false;
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
    return data.map((r) => ({
      hash: r.hash as string,
      name: r.name as string,
      msg: r.msg as string,
      lang: (r.lang as string) ?? '',
      at: new Date(r.created_at as string).getTime(),
    }));
  }

  async postCommit(c: Commit) {
    const { error } = await this.sb
      .from('commits')
      .insert({ room: this.room, hash: c.hash, name: c.name, msg: c.msg, lang: c.lang });
    if (error) throw new Error(error.message);
    this.send({ type: 'commit', commit: c });
  }
}
