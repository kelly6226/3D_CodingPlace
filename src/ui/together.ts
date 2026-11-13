// 정각 모각코: 왼쪽 위 시계 버튼(HUD)과 그 버튼으로 여는 시트
// ui.ts가 시트 틀(머리글, 스크롤)을 맡고, 여기서는 안의 내용만 그려요.
// 글은 기능 설명보다 지금 상태와 시각을 바로 알려주는 쪽으로 써요 ("1시 50분부터 쉬어요").
import type { BusyHours, RoomToday, SeatTrace } from '../net/types';
import { dailyIcs, googleCalendarUrl } from '../together/calendar';
import { BREAK_MINUTES, FOCUS_MINUTES, SESSION_DONE_MIN_MS, clockText, type SessionState } from '../together/session';
import { h } from './dom';

/** 서버에서 읽는 기록의 상태. 데모 모드처럼 서버가 기록을 안 남기면 'off' */
export type Loaded<T> = { kind: 'off' } | { kind: 'loading' } | { kind: 'ready'; value: T | null };
export type RoomTodayState = Loaded<RoomToday>;
export type BusyHoursState = Loaded<BusyHours>;

/** 시트에 보여줄 것 */
export interface TogetherView {
  session: SessionState;
  /** 오늘 채운 칸(끝낸 세션) 수 */
  sessionsToday: number;
  roomToday: RoomTodayState;
  busyHours: BusyHoursState;
  /** 지금 시각 (KST 0~23) */
  nowHour: number;
}

const KST_OFFSET_MS = 9 * 3600e3;

// ── 시각 글자 ─────────────────────────────────────

/** 시각을 말로: 새벽 2시 / 오전 9시 / 낮 12시 / 오후 3시 / 저녁 7시 / 밤 10시 / 밤 12시 */
export function hourLabel(hour: number): string {
  if (hour === 0) return '밤 12시';
  if (hour < 6) return `새벽 ${hour}시`;
  if (hour < 12) return `오전 ${hour}시`;
  if (hour === 12) return '낮 12시';
  if (hour < 18) return `오후 ${hour - 12}시`;
  if (hour < 21) return `저녁 ${hour - 12}시`;
  return `밤 ${hour - 12}시`;
}

/** 그 순간의 KST 시각을 말로: "오후 1시 50분", 정각이면 "오후 2시" */
function clockLabel(at: number): string {
  const d = new Date(at + KST_OFFSET_MS);
  const min = d.getUTCMinutes();
  return min ? `${hourLabel(d.getUTCHours())} ${min}분` : hourLabel(d.getUTCHours());
}

const minutesLeft = (s: SessionState, now: number) => Math.max(1, Math.ceil((s.endsAt - now) / 60e3));

// ── HUD 버튼 · 입장 화면 ───────────────────────────

/** HUD 버튼 글자: "집중 23:41" / "휴식 6:12" (앞의 색 점은 ui.ts가 붙여요) */
export function sessionPillText(s: SessionState, now: number): string {
  return `${s.phase === 'focus' ? '집중' : '휴식'} ${clockText(s.endsAt - now)}`;
}

/** 화면 읽기 프로그램용 설명 */
export function sessionPillLabel(s: SessionState, now: number): string {
  const what = s.phase === 'focus' ? '집중 시간' : '쉬는 시간';
  return `정각 모각코 열기. 지금 ${what}, ${minutesLeft(s, now)}분 남았어요`;
}

/** 입장 화면 한 줄: 들어가면 어떤 시간인지 */
export function sessionIntroText(s: SessionState, now: number): string {
  if (s.phase === 'focus') return `지금 다 같이 집중하는 중이에요. ${minutesLeft(s, now)}분 남았어요.`;
  return `지금은 쉬는 시간이에요. ${minutesLeft(s, now)}분 뒤 정각에 같이 시작해요.`;
}

// ── 지금 세션 ─────────────────────────────────────

/** 이 시간이 한 시간 중 얼마나 지났는지 (0~1). 진행 막대용 */
function hourProgress(s: SessionState, now: number): number {
  const hourEnd = s.phase === 'focus' ? s.endsAt + BREAK_MINUTES * 60e3 : s.endsAt;
  return Math.min(1, Math.max(0, 1 - (hourEnd - now) / 3600e3));
}

/** 다음에 무슨 일이 언제 있는지: "오후 1시 50분부터 10분 쉬어요" */
function nextStepText(s: SessionState): string {
  if (s.phase === 'focus') return `${clockLabel(s.endsAt)}부터 ${BREAK_MINUTES}분 쉬어요`;
  return `${clockLabel(s.endsAt)} 정각에 다시 시작해요`;
}

/** 오늘 채운 칸: 잔디 그래프처럼 한 칸 = 정각 모각코 한 번. 집중 중이면 지금 칸을 비워서 보여줘요 */
function renderDoneCells(v: TogetherView): HTMLElement {
  const done = v.sessionsToday;
  const cells = Array.from({ length: done }, () => h('i', { class: 'tg-cell done' }));
  if (v.session.phase === 'focus') cells.push(h('i', { class: 'tg-cell now', title: '지금 채우는 중' }));
  const text =
    done > 0
      ? `오늘 ${done}칸 채웠어요`
      : `정각부터 ${SESSION_DONE_MIN_MS / 60e3}분 넘게 있으면 한 칸이 채워져요`;
  return h('div', { class: 'tg-cells' }, h('span', { class: 'tg-cell-row', 'aria-hidden': 'true' }, ...cells), h('span', {}, text));
}

/** 시트의 '지금' 칸. 큰 시계 하나가 주인공이에요 */
export function renderSessionSection(v: TogetherView, now: number): HTMLElement {
  const s = v.session;
  return h(
    'section',
    { class: `tg-now ${s.phase}`, 'aria-label': '지금 세션' },
    h(
      'div',
      { class: 'tg-now-top' },
      h('span', { class: 'tg-phase' }, s.phase === 'focus' ? `${hourLabel(s.hour)} 집중` : '쉬는 시간'),
      h('b', { class: 'tg-timer', id: 'tg-timer' }, clockText(s.endsAt - now)),
    ),
    h(
      'div',
      { class: 'tg-bar', role: 'img', 'aria-label': `정각부터 ${FOCUS_MINUTES}분 집중하고 ${BREAK_MINUTES}분 쉬어요` },
      h('i', { class: 'tg-bar-fill', id: 'tg-bar-fill', style: `width:${(hourProgress(s, now) * 100).toFixed(1)}%` }),
      h('i', { class: 'tg-bar-break', style: `left:${(FOCUS_MINUTES / 60) * 100}%` }),
    ),
    h('p', { class: 'tg-next' }, nextStepText(s)),
    renderDoneCells(v),
  );
}

/** 시트를 다시 그리지 않고 남은 시간과 진행 막대만 바꿔요 (매초 불러요) */
export function paintSessionSection(root: ParentNode, s: SessionState, now: number) {
  const timer = root.querySelector<HTMLElement>('#tg-timer');
  if (timer) timer.textContent = clockText(s.endsAt - now);
  const fill = root.querySelector<HTMLElement>('#tg-bar-fill');
  if (fill) fill.style.width = `${(hourProgress(s, now) * 100).toFixed(1)}%`;
}

// ── 오늘 이 방 ────────────────────────────────────

/** 분을 읽기 쉽게: 45분 / 3시간 20분 / 41시간 (10시간 넘으면 분은 빼요) */
export function minutesText(min: number): string {
  const m = Math.max(0, Math.floor(min));
  if (m < 60) return `${m}분`;
  const hours = Math.floor(m / 60);
  const rest = m % 60;
  if (hours >= 10 || rest === 0) return `${hours}시간`;
  return `${hours}시간 ${rest}분`;
}

/** 기록이 하나라도 있는지 */
export function hasRoomRecord(t: RoomToday | null | undefined): t is RoomToday {
  return !!t && (t.minutes > 0 || t.visits > 0);
}

/** "오늘 23명이 다녀갔고, 다 같이 41시간 했어요" (입장 화면, 방에 들어왔을 때 토스트) */
export function roomTodaySentence(t: RoomToday): string {
  if (t.minutes < 1) return `오늘 ${t.visits}명이 다녀갔어요`;
  if (t.visits < 1) return `오늘 다 같이 ${minutesText(t.minutes)} 했어요`;
  return `오늘 ${t.visits}명이 다녀갔고, 다 같이 ${minutesText(t.minutes)} 했어요`;
}

/** 시트의 '오늘 이 방' 칸. 숫자 두 개를 한 문장으로 읽게 해요 */
export function renderTodaySection(v: TogetherView): HTMLElement {
  const box = h('section', { class: 'tg-section', 'aria-label': '오늘 이 방' }, h('h3', { class: 'sheet-sub' }, '오늘 이 방'));
  const st = v.roomToday;
  if (st.kind !== 'ready') {
    box.append(h('p', { class: 'tg-quiet' }, '불러오는 중…'));
    return box;
  }
  const today = st.value;
  if (!hasRoomRecord(today)) {
    box.append(h('p', { class: 'tg-quiet' }, '오늘은 아직 기록이 없어요.'));
    return box;
  }
  box.append(
    h(
      'p',
      { class: 'tg-today' },
      h('b', {}, `${today.visits}명`),
      '이 다녀갔고, 다 같이 ',
      h('b', {}, minutesText(today.minutes)),
      ' 했어요.',
    ),
  );
  return box;
}

// ── 사람 많은 시간 ─────────────────────────────────

/** 이보다 평균 인원이 적으면 사실상 아무도 없는 시간으로 봐요 */
const BUSY_EMPTY_PEOPLE = 0.05;
/** 사람이 조금이라도 있던 시각은 막대가 안 보일 만큼 짧아지지 않게 (막대 높이 %) */
const BUSY_BAR_MIN_PCT = 6;
/** 이보다 평균 인원이 적으면 "사람이 제일 많은 시간"이라고 부르지 않아요 */
const BUSY_PEAK_MIN_PEOPLE = 0.5;
/** 이보다 기록한 날이 적으면 "아직 며칠치뿐"이라고 덧붙여요 */
const BUSY_FEW_DAYS = 3;

/** 시각별 평균 인원 (분 합계 ÷ 기록한 날 수 ÷ 60) */
export function averagePeople(b: BusyHours): number[] {
  if (b.days < 1) return b.minutes.map(() => 0);
  return b.minutes.map((m) => m / b.days / 60);
}

/** 가장 붐비는 시각. 기록이 거의 없으면 null */
export function busyPeak(b: BusyHours | null): { hour: number; people: number } | null {
  if (!b) return null;
  const avg = averagePeople(b);
  let hour = 0;
  for (let i = 1; i < 24; i++) if (avg[i] > avg[hour]) hour = i;
  return avg[hour] >= BUSY_PEAK_MIN_PEOPLE ? { hour, people: avg[hour] } : null;
}

/** 막대 높이(%): 가장 붐비는 시각이 100% */
function barHeightPct(people: number, max: number): number {
  if (max <= 0 || people <= 0) return 0;
  return Math.max(BUSY_BAR_MIN_PCT, (people / max) * 100);
}

/** '지금'과 '내 시간'이 이만큼 가까우면 글자가 겹쳐서 줄을 나눠요 */
const MARK_NEAR_HOURS = 3;
/** 이 시각보다 바깥쪽 막대 아래 글자는 가운데 맞춤하면 그래프 밖으로 잘려서, 끝에 붙여요 */
const MARK_EDGE_HOURS = 2;

/** '지금', '내 시간' 글자를 막대 가운데에 둘지, 양 끝 근처면 안쪽 끝에 붙일지 */
function markAlign(hour: number): 'start' | 'end' | 'center' {
  if (hour < MARK_EDGE_HOURS) return 'start';
  if (hour >= 24 - MARK_EDGE_HOURS) return 'end';
  return 'center';
}

/** 평균 인원을 읽기 쉽게: 0.4명 / 3.2명 / 12명 */
function peopleText(n: number): string {
  if (n < BUSY_EMPTY_PEOPLE) return '거의 없음';
  return n < 10 ? `${n.toFixed(1)}명` : `${Math.round(n)}명`;
}

/** 입장 화면 한 줄: "이 방은 보통 밤 10시에 사람이 제일 많아요." */
export function busyIntroText(b: BusyHours | null): string | null {
  const peak = busyPeak(b);
  return peak ? `이 방은 보통 ${hourLabel(peak.hour)}에 사람이 제일 많아요.` : null;
}

/**
 * 시트의 '사람 많은 시간' 칸: 시각별 평균 인원 막대 24개.
 * 막대에 올리거나 누르면 아래 줄이 그 시각 설명으로 바뀌고, 지금 시각과 내 시간은 막대 아래에 글자로 표시해요.
 */
export function renderBusySection(v: TogetherView, myHour: number | null): HTMLElement {
  const box = h('section', { class: 'tg-section', 'aria-label': '사람 많은 시간' }, h('h3', { class: 'sheet-sub' }, '사람 많은 시간'));
  const st = v.busyHours;
  if (st.kind !== 'ready') {
    box.append(h('p', { class: 'tg-quiet' }, '불러오는 중…'));
    return box;
  }
  const busy = st.value;
  const peak = busyPeak(busy);
  if (!busy || !peak) {
    box.append(h('p', { class: 'tg-quiet' }, '며칠 기록이 쌓이면 몇 시에 사람이 많은지 보여요.'));
    return box;
  }
  const avg = averagePeople(busy);
  const max = Math.max(...avg);
  const describe = (hour: number) => `${hourLabel(hour)}, 평균 ${peopleText(avg[hour])}`;
  const peakText = `${hourLabel(peak.hour)}에 제일 많아요. 평균 ${peopleText(peak.people)}`;
  const caption = h('p', { class: 'tg-busy-caption' }, peakText);
  const bars = avg.map((n, hour) =>
    h(
      'button',
      {
        type: 'button',
        class: ['tg-hour', hour === v.nowHour && 'now', hour === myHour && 'mine'].filter(Boolean).join(' '),
        'aria-label': describe(hour),
        onpointerenter: () => (caption.textContent = describe(hour)),
        onfocus: () => (caption.textContent = describe(hour)),
        onclick: () => (caption.textContent = describe(hour)),
      },
      h('i', { style: `height:${barHeightPct(n, max).toFixed(1)}%` }),
    ),
  );
  const chart = h('div', { class: 'tg-busy', role: 'group', 'aria-label': '시각별 평균 인원' }, ...bars);
  chart.addEventListener('pointerleave', () => (caption.textContent = peakText));
  // 지금 시각과 내 시간이 같으면 '지금'만 써요
  const marks = [{ hour: v.nowHour, text: '지금', cls: 'now' }];
  // 두 글자가 가까우면 겹쳐서 '내 시간'은 한 줄 아래로 내려요
  const mineCls = myHour !== null && Math.abs(myHour - v.nowHour) <= MARK_NEAR_HOURS ? 'mine lower' : 'mine';
  if (myHour !== null && myHour !== v.nowHour) marks.push({ hour: myHour, text: '내 시간', cls: mineCls });
  box.append(
    chart,
    h(
      'div',
      { class: 'tg-busy-axis', 'aria-hidden': 'true' },
      ...[0, 6, 12, 18].map((hour) => h('span', { style: `--h:${hour}` }, `${hour}시`)),
      ...marks.map((m) => h('span', { class: `mark ${m.cls} ${markAlign(m.hour)}`, style: `--h:${m.hour}` }, m.text)),
    ),
    caption,
    h('small', { class: 'tg-foot' }, busy.days < BUSY_FEW_DAYS ? `아직 ${busy.days}일치 기록이라 정확하지 않아요.` : '최근 2주 평균이에요.'),
  );
  return box;
}

// ── 내 시간 ──────────────────────────────────────

/** '내 시간' 칸에서 할 수 있는 것 */
export interface MyHourActions {
  /** 시간을 고르거나(0~23) 지워요(null) */
  pick(hour: number | null): void;
  /**
   * 캘린더 일정에 넣을 지금 방 주소. null이면 캘린더 버튼을 빼요
   * (토스 앱 안에서는 파일 내려받기와 토스 밖 링크를 쓸 수 없어요)
   */
  roomLink: string | null;
}

/** 시트의 '내 시간' 칸: 매일 오는 시간을 정하고 캘린더에 넣어요 */
export function renderMyHourSection(v: TogetherView, myHour: number | null, actions: MyHourActions): HTMLElement {
  const select = h(
    'select',
    {
      id: 'my-hour',
      onchange: (e: Event) => {
        const value = (e.currentTarget as HTMLSelectElement).value;
        actions.pick(value === '' ? null : Number(value));
      },
    },
    h('option', { value: '', selected: myHour === null }, '안 정했어요'),
    ...Array.from({ length: 24 }, (_, hour) => h('option', { value: hour, selected: hour === myHour }, hourLabel(hour))),
  );
  const box = h(
    'section',
    { class: 'tg-section', 'aria-label': '내 시간' },
    h('label', { for: 'my-hour', class: 'sheet-sub tg-label' }, '매일 오는 시간'),
    select,
  );
  if (myHour === null) return box;

  const busy = v.busyHours.kind === 'ready' ? v.busyHours.value : null;
  const people = busy && busy.days > 0 ? averagePeople(busy)[myHour] : null;
  if (people !== null && people >= BUSY_EMPTY_PEOPLE) box.append(h('p', { class: 'tg-quiet' }, `이 방은 그 시간에 보통 ${peopleText(people)} 있어요.`));
  const roomLink = actions.roomLink;
  if (roomLink === null) {
    box.append(h('small', { class: 'tg-foot' }, "정해 둔 시간은 위 그래프에 '내 시간'으로 표시돼요."));
    return box;
  }
  const now = Date.now();
  box.append(
    h(
      'div',
      { class: 'tg-cal' },
      h(
        'button',
        { type: 'button', class: 'primary', onclick: () => downloadText(dailyIcs(myHour, roomLink, now), 'online-mogakco.ics', 'text/calendar') },
        '캘린더에 넣기',
      ),
      h('a', { class: 'ghost tg-cal-link', href: googleCalendarUrl(myHour, roomLink, now), target: '_blank', rel: 'noopener noreferrer' }, 'Google 캘린더'),
    ),
    h('small', { class: 'tg-foot' }, `매일 ${hourLabel(myHour)} 반복 일정으로 들어가고, 5분 전에 캘린더 앱이 알려줘요.`),
  );
  return box;
}

/** 글자를 파일로 내려받게 해요 (서버를 거치지 않아요) */
function downloadText(text: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = h('a', { href: url, download: filename, hidden: true });
  document.body.append(a);
  a.click();
  a.remove();
  // 바로 지우면 일부 브라우저가 받기 전에 끊겨서 잠시 뒤에 지워요
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ── 자리에 남은 흔적 ───────────────────────────────

/** "2시간 전" / "35분 전" / "방금" */
function agoText(at: number, now: number): string {
  const min = Math.floor(Math.max(0, now - at) / 60e3);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  return `${Math.floor(min / 60)}시간 전`;
}

/** 흔적(식은 커피잔)을 눌렀을 때: "☕ 2시간 전까지 누가 여기서 1시간 40분 하고 갔어요" */
export function seatTraceLine(t: SeatTrace, now: number): string {
  const when = agoText(t.leftAt, now);
  return `☕ ${when === '방금' ? '방금' : `${when}까지`} 누가 여기서 ${minutesText(t.minutes)} 하고 갔어요`;
}
