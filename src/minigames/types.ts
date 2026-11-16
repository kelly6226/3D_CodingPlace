// 미니게임 한 판이 지켜야 하는 모양

/** 게임 화면의 논리 크기. 실제 캔버스는 이 비율(3:4)을 지키며 늘리고 줄여요 */
export const STAGE_W = 360;
export const STAGE_H = 480;

export type Direction = 'up' | 'down' | 'left' | 'right';

/** 게임 한 판. 그리기와 입력은 round.ts가 불러 줘요 */
export interface GameRound {
  /** 지난 프레임 뒤 흐른 시간(초) */
  update(dt: number): void;
  draw(g: CanvasRenderingContext2D): void;
  /** 화면을 눌렀을 때 (게임 화면 좌표) */
  tap(x: number, y: number): void;
  /** 스페이스 (방향을 받지 않는 게임은 위 화살표도) */
  press(): void;
  /** 방향키·쓸어넘기기로 방향을 바꾸는 게임만 */
  steer?(dir: Direction): void;
  /** 끝났으면 점수, 아직 하는 중이면 null */
  result(): number | null;
}
