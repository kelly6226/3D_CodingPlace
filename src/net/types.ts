// 실시간 연결(온라인/데모)이 공통으로 지키는 약속
import type { PlaceId, RoomInfo } from '../config';

export interface PeerState {
  id: string;
  name: string;
  color: string;
  lang: string;
  hair: string;
  skin: string;
  glasses: boolean;
  status: string;
  /** 앉아 있는 자리 id. 서 있으면 null */
  seat: string | null;
  /** 자리를 잡은 시각. 같은 자리를 동시에 잡으면 먼저 잡은 사람이 이김 */
  seatAt: number;
  x: number;
  z: number;
  /** 스프린트 집중이 끝나는 시각(ms). 집중 중이 아니면 null */
  focusUntil: number | null;
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
  | { type: 'typing'; id: string }
  | { type: 'coffee'; id: string };

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
}

export interface Net {
  readonly mode: 'online' | 'demo';
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
}
