// 야근 러너의 점수: 오후 6시부터 몇 분을 버텼는지. 게임 화면과 오락기 목록이 같이 써요

const START_MIN = 18 * 60;
const DAY_MIN = 24 * 60;
/** 이 시각(다음 날 오전 6시)부터는 '다음 날'을 붙여요 */
const NEXT_DAY_FROM_MIN = DAY_MIN + 6 * 60;

function dayPart(hour: number) {
  if (hour < 6) return '새벽';
  if (hour < 12) return '오전';
  if (hour < 18) return '오후';
  if (hour < 21) return '저녁';
  return '밤';
}

/** 버틴 분을 '밤 11:42', '새벽 2:05' 같은 시각으로 */
export function overtimeClock(minutes: number): string {
  const t = START_MIN + Math.max(0, Math.floor(minutes));
  const hour = Math.floor(t / 60) % 24;
  const minute = t % 60;
  const hour12 = hour % 12 || 12;
  const clock = `${dayPart(hour)} ${hour12}:${String(minute).padStart(2, '0')}`;
  return t >= NEXT_DAY_FROM_MIN ? `다음 날 ${clock}` : clock;
}
