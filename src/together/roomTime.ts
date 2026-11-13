// 방에 있던 시간을 모아 두었다가 5분마다 서버에 더해요 (schema.sql 6번 add_room_time).
// 누가 했는지는 보내지 않아요. 방 이름, 몇 분, 오늘 처음 들어왔는지만 보내요.
import type { RoomTimeReport } from '../net/types';
import { markRoomVisit } from '../store';

/** 한 번에 보내는 최대 시간(분). 서버도 5분까지만 받아요 */
export const ROOM_TIME_FLUSH_MINUTES = 5;
const FLUSH_MS = ROOM_TIME_FLUSH_MINUTES * 60e3;

export type SendRoomTime = (room: string, report: RoomTimeReport) => Promise<void>;

export class RoomTimeReporter {
  private room = '';
  private pendingMs = 0;
  private visitPending = false;

  constructor(private send: SendRoomTime) {}

  /** 방에 들어왔을 때 (옮길 때도). 이전 방에 쌓인 시간은 먼저 보내고, 오늘 처음 온 방이면 바로 알려요 */
  enter(room: string) {
    void this.flush();
    this.room = room;
    this.pendingMs = 0;
    this.visitPending = markRoomVisit(room);
    if (this.visitPending) void this.flush();
  }

  /** 실제로 흐른 시간(ms). 5분이 모이면 보내요 */
  add(ms: number) {
    if (!this.room) return;
    this.pendingMs += ms;
    if (this.pendingMs >= FLUSH_MS) void this.flush();
  }

  /** 지금까지 모인 시간을 1분 단위로 보내요 (탭을 숨길 때도 불러요). 1분이 안 되는 나머지는 남겨요 */
  async flush() {
    const minutes = Math.min(ROOM_TIME_FLUSH_MINUTES, Math.floor(this.pendingMs / 60e3));
    if (!this.room || (minutes === 0 && !this.visitPending)) return;
    const report: RoomTimeReport = { minutes, visit: this.visitPending };
    this.pendingMs -= minutes * 60e3;
    this.visitPending = false;
    // 실패하면 그 몫은 버려요. 보여주기용 기록이라, 다시 보내다 호출 한도에 걸리는 쪽이 더 나빠요
    await this.send(this.room, report).catch((e) => console.warn('[room time]', e));
  }
}
