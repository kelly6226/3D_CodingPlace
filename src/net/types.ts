// 실시간 연결(온라인/데모)이 공통으로 지키는 약속
import type { ActionId, PlaceId, RoomInfo } from '../config';
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
  | { type: 'chat'; id: string; text: string }
  | { type: 'act'; id: string; act: ActionId }
  | { type: 'typing'; id: string }
  | { type: 'coffee'; id: string }
  | DmEvent;

/**
 * 1:1 채팅을 시작하는 약속. 방 채널(모두가 받는 곳)로 오가지만 대화 내용은 안 실려요.
 *   req: 나랑 1:1로 얘기해요 (내 공개 키와 이름)  →  ok: 좋아요 (내 공개 키)  /  no: 안 할래요
 * 서로의 공개 키로 둘만 아는 비밀값을 만들고, 거기서 나온 채널 이름·암호 키로 대화해요 (dm/crypto.ts).
 * 이 이벤트의 id는 방 안의 아바타 id라서 믿을 수 없어요. 그래서 두 화면에 같은 확인 코드가 뜨는지 비교할 수 있게 했어요.
 */
export type DmStage = 'req' | 'ok' | 'no';
export interface DmEvent {
  type: 'dm';
  /** 보낸 사람의 아바타 id */
  id: string;
  /** 받는 사람의 아바타 id */
  to: string;
  stage: DmStage;
  /** 보낸 사람의 공개 키 (base64url). req·ok에만 있어요 */
  key?: string;
  name?: string;
}

/** 암호화된 1:1 채팅 한 줄 (둘 다 base64url). 서버와 같은 방 사람들은 이것만 봐요 */
export interface DmCipher {
  iv: string;
  ct: string;
}

export interface DmHandlers {
  onMessage(topic: string, c: DmCipher): void;
  /** 상대가 이 대화에 들어와 있는지가 바뀔 때 */
  onPresence(topic: string, online: boolean): void;
  /** 연결이 끊겨서 이 대화를 더 못 쓸 때 */
  onClosed(topic: string): void;
}

export type JoinResult = 'ok' | 'wrong' | 'error';

export interface NetHandlers {
  /** 지금 방에 있는 사람 전체(나 제외). 들어오고 나갈 때마다 호출 */
  onPeers(peers: PeerState[]): void;
  onEvent(e: NetEvent): void;
  onRoomChange?(instance: number): void;
  onStatus?(s: 'connecting' | 'online' | 'offline'): void;
}

export interface NewRoom {
  name: string;
  tags: string[];
  isPublic: boolean;
  place: PlaceId;
  creator: string;
  /** 정하면 비밀번호 방이 돼요 */
  password?: string;
}

export interface Net {
  readonly mode: 'online' | 'demo';
  /** 비밀번호 방과 1:1 채팅을 쓸 수 있는지 (실시간 서버에 연결된 모드에서만) */
  readonly canPrivate: boolean;
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

  // ── 비밀번호 방 ────────────────────────────────
  /** 이 방에 들어갈 수 있는지: 비밀번호가 없는 방이거나, 이 브라우저에서 이미 비밀번호를 맞힌 방 */
  hasRoomAccess(room: RoomInfo): Promise<boolean>;
  /** 비밀번호를 서버에서 대조해요. 맞으면 'ok'로 이 브라우저에 열쇠를 기억해 둬요 */
  joinRoom(slug: string, password: string): Promise<JoinResult>;

  // ── 1:1 채팅 ───────────────────────────────────
  /** 이 이름의 채널을 열어요(이름은 둘만 알아요). 열었으면 true */
  dmOpen(topic: string, h: DmHandlers): Promise<boolean>;
  /** 보냈으면 true (채널이 안 열려 있으면 false) */
  dmSend(topic: string, c: DmCipher): boolean;
  dmClose(topic: string): void;
}
