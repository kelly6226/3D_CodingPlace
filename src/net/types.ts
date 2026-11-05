// 실시간 연결(온라인/데모)이 공통으로 지키는 약속

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

export interface Net {
  readonly mode: 'online' | 'demo';
  readonly instance: number;
  connect(self: PeerState, h: NetHandlers): Promise<void>;
  /** 내 상태(자리, 상태 메시지 등)를 방 사람들에게 알림 */
  updateSelf(patch: Partial<PeerState>): void;
  send(e: NetEvent): void;
  loadCommits(): Promise<Commit[]>;
  postCommit(c: Commit): Promise<void>;
}
