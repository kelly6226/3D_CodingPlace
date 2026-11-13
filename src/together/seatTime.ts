// 자리에 앉아 있던 시간을 모아 5분마다 서버에 더해요 (schema.sql 7번 add_seat_time).
// 자리를 옮기거나 일어나면 그 자리 몫을 먼저 보내요. 누가 앉았는지는 보내지 않아요.
import { ROOM_TIME_FLUSH_MINUTES } from './roomTime';

const FLUSH_MS = ROOM_TIME_FLUSH_MINUTES * 60e3;

export type SendSeatTime = (room: string, seat: string, minutes: number) => Promise<void>;

export class SeatTimeReporter {
  private room = '';
  private seat: string | null = null;
  private pendingMs = 0;
  /** 이번 방문에 내가 기록한 자리 ('방:자리'). 내 흔적을 '누군가'로 보여주지 않으려고요 */
  private mine = new Set<string>();

  constructor(private send: SendSeatTime) {}

  /** 이번 방문에 내가 앉아서 기록한 자리인지 */
  isMine(room: string, seat: string): boolean {
    return this.mine.has(`${room}:${seat}`);
  }

  /**
   * 실제로 흐른 시간(ms)과 지금 앉아 있는 곳. 매초 불러요.
   * 방이나 자리가 바뀌었으면 이전 자리 몫을 먼저 보내고 새로 세요
   */
  add(ms: number, room: string, seat: string | null) {
    if (room !== this.room || seat !== this.seat) {
      void this.flush();
      this.room = room;
      this.seat = seat;
      this.pendingMs = 0;
    }
    if (!seat) return;
    this.pendingMs += ms;
    if (this.pendingMs >= FLUSH_MS) void this.flush();
  }

  /** 모인 시간을 1분 단위로 보내요 (탭을 숨길 때도 불러요) */
  async flush() {
    const minutes = Math.min(ROOM_TIME_FLUSH_MINUTES, Math.floor(this.pendingMs / 60e3));
    if (!this.seat || minutes < 1) return;
    this.pendingMs -= minutes * 60e3;
    this.mine.add(`${this.room}:${this.seat}`);
    await this.send(this.room, this.seat, minutes).catch((e) => console.warn('[seat time]', e));
  }
}
