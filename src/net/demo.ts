// Supabase 키가 없을 때: 봇들이 단골손님처럼 드나드는 데모 모드
import {
  ACTIONS,
  BOT_CHATS,
  BOT_COMMITS,
  BUILTIN_ROOMS,
  DEFAULT_NAMES,
  DEFAULT_NOISE,
  EMOTES,
  HAIR_COLORS,
  HOODIE_COLORS,
  LANGS,
  SKIN_TONES,
  STATUSES,
  builtinRoom,
  isNoiseId,
  isPlaceId,
  newRoomSlug,
  placeMeta,
  type RoomInfo,
} from '../config';
import { randomOutfit } from '../look';
import { SEATS, SPAWN, SPOTS } from '../world/layout';
import { nearestWalkable } from '../world/pathfinding';
import { getDemoCommits, getDemoRooms, randomId, setDemoCommits, setDemoRooms } from '../store';
import type { BusyHours, Commit, JoinResult, Net, NetHandlers, NewRoom, PeerState, RoomToday } from './types';

type SavedCommit = Commit & { room?: string };

/** 데모용 가짜 인원: 방 이름으로 정해지는 숫자 (새로고침해도 비슷하게) */
function fakeCount(slug: string) {
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return slug === 'pangyo' ? 7 : 2 + (h % 6);
}

const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const randomHash = () =>
  Array.from({ length: 7 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');

export class DemoNet implements Net {
  readonly mode = 'demo' as const;
  /** 데모 모드엔 서버가 없어서 비밀번호 방을 만들 수 없어요 */
  readonly canLockRooms = false;
  /** 서버가 없어서 방별 기록을 남기지 않아요. 화면에는 "실시간 서버에 연결되면 보여요"라고 나와요 */
  readonly keepsRoomStats = false;
  readonly instance = 1;
  room = '';
  private bots: PeerState[] = [];
  private self!: PeerState;
  private h!: NetHandlers;
  private commits: Commit[] = [];
  private usedNames = new Set<string>();
  private deployDone = false;
  private looping = false;
  private countCbs: ((c: Record<string, number>) => void)[] = [];

  // ── 방 목록 (이 브라우저에만 저장) ────────────────
  private savedRooms(): RoomInfo[] {
    // 예전에 저장한 방에는 place·noise가 없을 수 있어서 카페와 장소 소리로 채움
    return getDemoRooms<RoomInfo>().map((r) => ({
      ...r,
      place: isPlaceId(r.place) ? r.place : 'cafe',
      noise: isNoiseId(r.noise) ? r.noise : DEFAULT_NOISE,
    }));
  }

  async listRooms(): Promise<RoomInfo[]> {
    return [...BUILTIN_ROOMS, ...this.savedRooms().filter((r) => r.isPublic)];
  }

  async getRoom(slug: string): Promise<RoomInfo | null> {
    return builtinRoom(slug) ?? this.savedRooms().find((r) => r.slug === slug) ?? null;
  }

  async createRoom(r: NewRoom): Promise<RoomInfo> {
    const room: RoomInfo = { slug: newRoomSlug(), name: r.name, tags: r.tags, isPublic: r.isPublic, place: r.place, noise: r.noise, creator: r.creator, createdAt: Date.now() };
    setDemoRooms([room, ...this.savedRooms()]);
    return room;
  }

  watchCounts(cb: (counts: Record<string, number>) => void) {
    this.countCbs.push(cb);
    this.pushCounts();
    if (this.countCbs.length === 1) window.setInterval(() => this.pushCounts(), 5000);
  }

  private pushCounts() {
    const counts: Record<string, number> = {};
    for (const r of [...BUILTIN_ROOMS, ...this.savedRooms()]) if (r.isPublic) counts[r.slug] = r.builtin ? fakeCount(r.slug) : 0;
    if (this.room && this.self) counts[this.room] = this.bots.length + 1;
    for (const f of this.countCbs) f(counts);
  }

  // ── 방 안 ─────────────────────────────────────
  async connect(self: PeerState, h: NetHandlers, room: RoomInfo) {
    this.self = self;
    this.h = h;
    this.usedNames.add(self.name);
    this.fill(room);
    h.onStatus?.('online');
    if (!this.looping) {
      this.looping = true;
      this.loop();
    }
  }

  async switchRoom(room: RoomInfo) {
    this.bots = [];
    this.usedNames = new Set([this.self.name]);
    this.fill(room);
  }

  /** 이 장소에 봇이 몇 명까지 있을 수 있는지 (나 포함 정원, 자리 수) */
  private maxBots() {
    return Math.max(1, Math.min(10, this.cap - 1, SEATS.length - 1));
  }
  private cap = 20;

  /** 방에 원래 앉아 있던 단골들 채우기 */
  private fill(room: RoomInfo) {
    this.room = room.slug;
    this.cap = placeMeta(room.place).cap;
    const n = Math.min(this.maxBots(), room.builtin ? fakeCount(room.slug) : 2);
    const free = SEATS.slice().sort(() => Math.random() - 0.5);
    for (let i = 0; i < n; i++) {
      const s = free[i];
      this.bots.push(this.makeBot({ seat: s.id, x: s.x, z: s.z, joinedAt: Date.now() - rand(60e3, 3600e3) }));
    }
    this.h.onPeers(this.bots.slice());
    this.pushCounts();
  }

  private makeBot(over: Partial<PeerState>): PeerState {
    let name = pick(DEFAULT_NAMES);
    for (let t = 0; t < 10 && this.usedNames.has(name); t++) name = pick(DEFAULT_NAMES);
    this.usedNames.add(name);
    const seated = !!over.seat;
    return {
      id: 'bot-' + randomId().slice(0, 8),
      name,
      color: pick(HOODIE_COLORS),
      lang: pick(LANGS).id,
      hair: pick(HAIR_COLORS),
      skin: pick(SKIN_TONES),
      glasses: Math.random() < 0.5,
      outfit: randomOutfit(),
      status: seated ? pick(STATUSES.slice(0, 9)).id : 'coding',
      seat: null,
      seatAt: Date.now(),
      x: SPAWN.x,
      z: SPAWN.z,
      coffee: Math.floor(rand(0, 4)),
      joinedAt: Date.now(),
      // 봇마다 오늘 0~3시간 했다고 쳐요. 방에 들어온 시각보다는 늘 앞서게 (오늘 누적이 머문 시간보다 짧으면 이상해요)
      studySince: (over.joinedAt ?? Date.now()) - Math.floor(rand(0, 180)) * 60e3,
      bot: true,
      ...over,
    };
  }

  private freeSeats() {
    const taken = new Set([...this.bots.map((b) => b.seat), this.self.seat]);
    return SEATS.filter((s) => !taken.has(s.id));
  }

  private loop() {
    const tick = () => {
      this.step();
      window.setTimeout(tick, rand(2500, 6000));
    };
    window.setTimeout(tick, 3000);
    // 한참 있다 보면 누군가 배포 버튼을 누름
    window.setTimeout(() => this.botDeploy(), rand(240e3, 420e3));
  }

  private emit(peersChanged: boolean) {
    if (peersChanged) this.h.onPeers(this.bots.map((b) => ({ ...b })));
  }

  private step() {
    if (!this.bots.length) return;
    const r = Math.random();
    const b = pick(this.bots);

    if (r < 0.06 && this.bots.length > Math.min(4, this.maxBots() - 1)) {
      // 퇴근
      this.bots = this.bots.filter((x) => x !== b);
      this.usedNames.delete(b.name);
      this.emit(true);
      return;
    }
    if (r < 0.12 && this.bots.length < this.maxBots()) {
      // 새로 들어옴 → 빈자리로 걸어감
      const seat = pick(this.freeSeats());
      const nb = this.makeBot({});
      this.bots.push(nb);
      this.emit(true);
      if (seat) {
        window.setTimeout(() => {
          nb.seat = seat.id;
          nb.seatAt = Date.now();
          nb.x = seat.x;
          nb.z = seat.z;
          this.h.onEvent({ type: 'move', id: nb.id, x: seat.x, z: seat.z, seat: seat.id });
          this.emit(true);
        }, 1200);
      }
      return;
    }
    if (r < 0.2) {
      // 자리 옮기기
      const seat = pick(this.freeSeats());
      if (!seat) return;
      b.seat = seat.id;
      b.seatAt = Date.now();
      b.x = seat.x;
      b.z = seat.z;
      this.h.onEvent({ type: 'move', id: b.id, x: seat.x, z: seat.z, seat: seat.id });
      this.emit(true);
      return;
    }
    if (r < 0.27) {
      // 커피 한 잔 (장소마다 컵라면, 피자, 음료)
      b.seat = null;
      const [ux, uz] = nearestWalkable(SPOTS.use.x + rand(-0.4, 0.4), SPOTS.use.z + rand(-0.4, 0.4));
      b.x = ux;
      b.z = uz;
      this.h.onEvent({ type: 'move', id: b.id, x: b.x, z: b.z, seat: null });
      window.setTimeout(() => {
        b.coffee += 1;
        this.h.onEvent({ type: 'coffee', id: b.id });
      }, 4500);
      window.setTimeout(() => {
        const seat = pick(this.freeSeats());
        if (!seat || !this.bots.includes(b)) return;
        b.seat = seat.id;
        b.seatAt = Date.now();
        b.x = seat.x;
        b.z = seat.z;
        this.h.onEvent({ type: 'move', id: b.id, x: seat.x, z: seat.z, seat: seat.id });
        this.emit(true);
      }, 9000);
      this.emit(true);
      return;
    }
    if (r < 0.31) {
      // 오리한테 상담
      b.seat = null;
      const [x, z] = nearestWalkable(SPOTS.pet.x + rand(-0.3, 0.3), SPOTS.pet.z + rand(-0.3, 0.3));
      b.x = x;
      b.z = z;
      b.status = 'duck';
      this.h.onEvent({ type: 'move', id: b.id, x, z, seat: null });
      this.emit(true);
      return;
    }
    if (r < 0.45) {
      b.status = pick(STATUSES).id;
      this.emit(true);
      return;
    }
    if (r < 0.62) {
      this.h.onEvent({ type: 'emote', id: b.id, emote: pick(EMOTES).id });
      return;
    }
    if (r < 0.7) {
      const c: Commit = { hash: randomHash(), name: b.name, msg: pick(BOT_COMMITS), lang: b.lang, at: Date.now() };
      this.commits.unshift(c);
      this.h.onEvent({ type: 'commit', commit: c });
      return;
    }
    if (r < 0.88) {
      this.h.onEvent({ type: 'chat', id: b.id, text: pick(BOT_CHATS) });
      return;
    }
    if (r < 0.94) {
      this.h.onEvent({ type: 'act', id: b.id, act: pick(ACTIONS).id });
      return;
    }
    this.h.onEvent({ type: 'typing', id: b.id });
  }

  private botDeploy() {
    if (this.deployDone || !this.bots.length) return;
    this.deployDone = true;
    const b = pick(this.bots);
    b.seat = null;
    b.x = SPOTS.deploy.x;
    b.z = SPOTS.deploy.z;
    this.h.onEvent({ type: 'move', id: b.id, x: b.x, z: b.z, seat: null });
    this.emit(true);
    window.setTimeout(() => this.h.onEvent({ type: 'deploy', id: b.id, name: b.name }), 6000);
  }

  updateSelf(patch: Partial<PeerState>) {
    Object.assign(this.self, patch);
    // 봇이 내 자리에 앉아 있으면 비켜줌
    if (patch.seat) {
      const squatter = this.bots.find((b) => b.seat === patch.seat);
      if (squatter) {
        const seat = pick(this.freeSeats());
        squatter.seat = seat?.id ?? null;
        squatter.x = seat?.x ?? SPAWN.x;
        squatter.z = seat?.z ?? SPAWN.z;
        this.h.onEvent({ type: 'move', id: squatter.id, x: squatter.x, z: squatter.z, seat: squatter.seat });
        this.emit(true);
      }
    }
  }

  send() {
    /* 데모 모드에선 보낼 곳이 없음 */
  }

  async loadCommits(room: string): Promise<Commit[]> {
    const saved = getDemoCommits<SavedCommit>().filter((c) => (c.room ?? 'pangyo') === room);
    const seed: Commit[] = Array.from({ length: builtinRoom(room) ? 6 : 0 }, (_, i) => ({
      hash: randomHash(),
      name: pick(DEFAULT_NAMES),
      msg: pick(BOT_COMMITS),
      lang: pick(LANGS).id,
      at: Date.now() - (i + 1) * rand(5, 40) * 60e3,
    }));
    this.commits = [...saved, ...seed].sort((a, b) => b.at - a.at).slice(0, 30);
    return this.commits.slice();
  }

  /** 데모 모드는 신고를 모을 서버가 없어서, 신고한 사람 화면에서만 가려요 (main.ts) */
  async reportCommit(): Promise<boolean> {
    return false;
  }

  async postCommit(c: Commit) {
    const mine = getDemoCommits<SavedCommit>();
    mine.unshift({ ...c, room: this.room });
    setDemoCommits(mine);
    this.commits.unshift(c);
  }

  async hasRoomAccess(): Promise<boolean> {
    return true;
  }
  async joinRoom(): Promise<JoinResult> {
    return 'error';
  }

  async addRoomTime(): Promise<void> {}
  async loadRoomToday(): Promise<RoomToday | null> {
    return null;
  }
  async loadRoomsToday(): Promise<Record<string, RoomToday>> {
    return {};
  }
  async loadBusyHours(): Promise<BusyHours | null> {
    return null;
  }
}
