// 실시간 연결(온라인/데모)이 공통으로 지키는 약속
import type { ActionId, NoiseId, PlaceId, RoomInfo } from '../config';
import type { Outfit } from '../look';

export interface PeerState {
  id: string;
  name: string;
  color: string;
  lang: string;
  hair: string;
  skin: string;
  glasses: boolean;
  /** 모자·머리 모양·등/목 장식·바지/신발 색 */
  outfit: Outfit;
  status: string;
  /** 앉아 있는 자리 id. 서 있으면 null */
  seat: string | null;
  /** 자리를 잡은 시각. 같은 자리를 동시에 잡으면 먼저 잡은 사람이 이김 */
  seatAt: number;
  x: number;
  z: number;
  coffee: number;
  joinedAt: number;
  /**
   * 오늘 누적 시간의 기준 시각(ms). 지금 시각에서 빼면 오늘 모각코한 시간이에요 (studyClock.ts studyTodayAt).
   * 누적 시간을 매초 보내지 않으려고 기준 시각만 보내요. 잠들었다 깨거나 자정이 지나면 다시 보내요
   */
  studySince: number;
  bot?: boolean;
}

export interface Commit {
  hash: string;
  name: string;
  msg: string;
  lang: string;
  at: number;
}

export type NetEvent =
  | { type: 'move'; id: string; x: number; z: number; seat: string | null }
  | { type: 'emote'; id: string; emote: string; to?: string }
  | { type: 'deploy'; id: string; name: string }
  | { type: 'commit'; commit: Commit }
  /** 신고로 숨겨진 커밋이 있으니 방명록을 다시 읽으라는 알림 (내용은 믿지 않고 DB에서 다시 읽어요) */
  | { type: 'commitHidden'; hash: string }
  /** to가 있으면 귓속말. 지금 방에 있는 동안만 가고, 암호화는 안 돼요 */
  | { type: 'chat'; id: string; text: string; to?: string }
  | { type: 'act'; id: string; act: ActionId }
  | { type: 'typing'; id: string }
  | { type: 'coffee'; id: string };

export type JoinResult = 'ok' | 'wrong' | 'error';

/** 오늘(KST) 한 방에서 쌓인 모각코 합계. 누가 했는지는 없어요 */
export interface RoomToday {
  minutes: number;
  /** 오늘 이 방에 다녀간 브라우저 수 (같은 사람이 기기를 바꾸면 두 번 세요) */
  visits: number;
}

/** 방에 있던 시간 보고 (5분마다, 그리고 오늘 처음 들어왔을 때) */
export interface RoomTimeReport {
  /** 0~5분 */
  minutes: number;
  /** 오늘 이 방에 처음 들어왔으면 true */
  visit: boolean;
}

export interface NetHandlers {
  /** 지금 방에 있는 사람 전체(나 제외). 들어오고 나갈 때마다 호출 */
  onPeers(peers: PeerState[]): void;
  onEvent(e: NetEvent): void;
  /** 방명록을 DB에서 다시 읽었을 때 (신고로 숨겨진 커밋이 빠진 목록) */
  onCommits?(list: Commit[]): void;
  onRoomChange?(instance: number): void;
  onStatus?(s: 'connecting' | 'online' | 'offline'): void;
}

export interface NewRoom {
  name: string;
  tags: string[];
  isPublic: boolean;
  place: PlaceId;
  noise: NoiseId;
  creator: string;
  /** 정하면 비밀번호 방이 돼요 */
  password?: string;
}

export interface Net {
  readonly mode: 'online' | 'demo';
  /** 비밀번호 방을 만들 수 있는지 (실시간 서버에 연결된 모드에서만) */
  readonly canLockRooms: boolean;
  readonly instance: number;
  /** 지금 들어가 있는 방 */
  readonly room: string;

  // ── 방 목록 (입장 전에도 씀) ─────────────────
  /** 공개 방 목록 (기본 방 + 사람들이 만든 공개 방) */
  listRooms(): Promise<RoomInfo[]>;
  /** 링크로 들어온 방 찾기. 비공개 방도 찾아짐 */
  getRoom(slug: string): Promise<RoomInfo | null>;
  createRoom(r: NewRoom): Promise<RoomInfo>;
  /** 공개 방마다 지금 몇 명 있는지 (방 slug → 인원) */
  watchCounts(cb: (counts: Record<string, number>) => void): void;

  // ── 방 안 ─────────────────────────────────
  connect(self: PeerState, h: NetHandlers, room: RoomInfo, instance?: number): Promise<void>;
  /** 다른 방으로 옮기기 (같은 연결에서 채널만 바꿈) */
  switchRoom(room: RoomInfo): Promise<void>;
  /** 내 상태(자리, 상태 메시지 등)를 방 사람들에게 알림 */
  updateSelf(patch: Partial<PeerState>): void;
  send(e: NetEvent): void;
  loadCommits(room: string): Promise<Commit[]>;
  postCommit(c: Commit): Promise<void>;
  /** 커밋 신고. 신고가 쌓여 모두에게서 숨겨졌으면 true */
  reportCommit(hash: string, reporter: string): Promise<boolean>;

  // ── 비밀번호 방 ────────────────────────────────
  /** 이 방에 들어갈 수 있는지: 비밀번호가 없는 방이거나, 이 브라우저에서 이미 비밀번호를 맞힌 방 */
  hasRoomAccess(room: RoomInfo): Promise<boolean>;
  /** 비밀번호를 서버에서 대조해요. 맞으면 'ok'로 이 브라우저에 열쇠를 기억해 둬요 */
  joinRoom(slug: string, password: string): Promise<JoinResult>;

  // ── 같이 하는 시간 (방별 기록) ─────────────────────
  /** 실시간 서버에 기록이 남는지. 데모 모드에서는 false라서 화면에 "연결되면 보여요"라고 적어요 */
  readonly keepsRoomStats: boolean;
  /** 방에 있던 시간을 더해요. 실패해도 조용히 넘어가요 (보여주기용 기록이라서) */
  addRoomTime(room: string, report: RoomTimeReport): Promise<void>;
  /** 오늘 이 방의 합계. 못 읽으면 null */
  loadRoomToday(room: string): Promise<RoomToday | null>;
  /** 오늘 방 목록에 보이는 방들의 합계 (방 slug → 합계) */
  loadRoomsToday(): Promise<Record<string, RoomToday>>;
}
