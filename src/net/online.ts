// Supabase Realtime 연결
// - Presence: 누가 방에 있고 어디 앉아 있는지 (자주 안 바뀌는 상태)
// - Broadcast: 이동, 이모트, 배포 버튼처럼 순간적인 이벤트
// - Postgres(commits 테이블): 커밋 방명록
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { PLACE, ROOM_CAP, MAX_INSTANCE } from '../config';
import type { Commit, Net, NetEvent, NetHandlers, PeerState } from './types';

export class OnlineNet implements Net {
  readonly mode = 'online' as const;
  instance: number;
  private sb: SupabaseClient;
  private ch: RealtimeChannel | null = null;
  private self!: PeerState;
  private h!: NetHandlers;
  private trackTimer = 0;
  private checkedCap = false;

  constructor(url: string, key: string, instance: number) {
    this.instance = instance;
    this.sb = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      // 백그라운드 탭에서도 하트비트가 끊기지 않게 Web Worker에서 돌림
      realtime: { worker: true, params: { eventsPerSecond: 10 } },
    });
  }

  async connect(self: PeerState, h: NetHandlers) {
    this.self = self;
    this.h = h;
    await this.join();
  }

  private join(): Promise<void> {
    return new Promise((resolve) => {
      this.checkedCap = false;
      this.h.onStatus?.('connecting');
      const ch = this.sb.channel(`mogakco:${PLACE.id}:${this.instance}`, {
        config: { presence: { key: this.self.id }, broadcast: { self: false } },
      });
      this.ch = ch;

      ch.on('presence', { event: 'sync' }, () => {
        const state = ch.presenceState<PeerState>();
        const peers: PeerState[] = [];
        for (const [key, metas] of Object.entries(state)) {
          if (key === this.self.id || !metas.length) continue;
          // 같은 사람이 탭을 여러 개 열었으면 마지막 것만
          const m = metas[metas.length - 1] as unknown as PeerState;
          peers.push(m);
        }
        if (!this.checkedCap) {
          this.checkedCap = true;
          if (this.overCapacity(peers)) return;
        }
        this.h.onPeers(peers);
      });

      ch.on('broadcast', { event: 'ev' }, ({ payload }) => {
        this.h.onEvent(payload as NetEvent);
      });

      ch.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await ch.track(this.self);
          this.h.onStatus?.('online');
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          this.h.onStatus?.('offline');
          resolve();
        } else if (status === 'CLOSED') {
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
    void old?.unsubscribe().then(() => {
      if (old) void this.sb.removeChannel(old);
      this.instance += 1;
      this.h.onRoomChange?.(this.instance);
      void this.join();
    });
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

  async loadCommits(): Promise<Commit[]> {
    const { data, error } = await this.sb
      .from('commits')
      .select('hash,name,msg,lang,created_at')
      .eq('room', PLACE.id)
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
      .insert({ room: PLACE.id, hash: c.hash, name: c.name, msg: c.msg, lang: c.lang });
    if (error) throw new Error(error.message);
    this.send({ type: 'commit', commit: c });
  }
}
