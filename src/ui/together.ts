// '🎯 같이 하는 시간': 정각 세션 버튼(HUD)과 그 버튼으로 여는 시트
// ui.ts가 시트 틀(머리글, 스크롤)을 맡고, 여기서는 안의 내용만 그려요.
import type { BusyHours, RoomToday } from '../net/types';
import { dailyIcs, googleCalendarUrl } from '../together/calendar';
import { BREAK_MINUTES, FOCUS_MINUTES, clockText, type SessionState } from '../together/session';
import { h } from './dom';

/** 서버에서 읽는 기록의 상태. 데모 모드처럼 서버가 기록을 안 남기면 'off' */
export type Loaded<T> = { kind: 'off' } | { kind: 'loading' } | { kind: 'ready'; value: T | null };
export type RoomTodayState = Loaded<RoomToday>;
export type BusyHoursState = Loaded<BusyHours>;

/** 시트에 보여줄 것 */
export interface TogetherView {
  session: SessionState;
  /** 오늘 내가 끝낸 세션 수 */
  sessionsToday: number;
  /** 지금 이 방에 있는 사람 수 (나 포함) */
  peopleHere: number;
  roomName: string;
  roomToday: RoomTodayState;
  busyHours: BusyHoursState;
  /** 지금 시각 (KST 0~23) */
  nowHour: number;
}

const PHASE = {
  focus: { emoji: '🎯', label: '집중 시간', short: '집중', next: `끝나면 ${BREAK_MINUTES}분 쉬어요` },
  break: { emoji: '☕', label: '쉬는 시간', short: '휴식', next: '정각에 다 같이 다시 시작해요' },
} as const;

/** HUD 버튼 글자: "🎯 집중 23:41" */
export function sessionPillText(s: SessionState, now: number): string {
  const p = PHASE[s.phase];
  return `${p.emoji} ${p.short} ${clockText(s.endsAt - now)}`;
}

/** 화면 읽기 프로그램용 설명: "집중 시간, 23분 남음" */
export function sessionPillLabel(s: SessionState, now: number): string {
  const min = Math.max(1, Math.ceil((s.endsAt - now) / 60e3));
  return `같이 하는 시간 열기. 지금 ${PHASE[s.phase].label}, ${min}분 남음`;
}

/** 입장 화면에 넣는 한 줄: 들어가면 어떤 시간인지 미리 알려줘요 */
export function sessionIntroText(s: SessionState, now: number): string {
  const min = Math.max(1, Math.ceil((s.endsAt - now) / 60e3));
  if (s.phase === 'focus') return `🎯 지금 다 같이 집중하는 중이에요 · ${min}분 남음`;
  return `☕ 지금은 쉬는 시간 · ${min}분 뒤 정각에 다 같이 시작해요`;
}

/** 이 시간이 한 시간 중 얼마나 지났는지 (0~1). 진행 막대용 */
function hourProgress(s: SessionState, now: number): number {
  const hourEnd = s.phase === 'focus' ? s.endsAt + BREAK_MINUTES * 60e3 : s.endsAt;
  return Math.min(1, Math.max(0, 1 - (hourEnd - now) / 3600e3));
}

/** 시트의 '지금 세션' 칸 */
export function renderSessionSection(v: TogetherView, now: number): HTMLElement {
  const p = PHASE[v.session.phase];
  return h(
    'section',
    { class: `tg-now ${v.session.phase}`, 'aria-label': '지금 세션' },
    h(
      'div',
      { class: 'tg-now-top' },
      h('span', { class: 'tg-phase' }, `${p.emoji} ${p.label}`),
      h('b', { class: 'tg-timer', id: 'tg-timer', 'aria-live': 'off' }, clockText(v.session.endsAt - now)),
    ),
    h(
      'div',
      { class: 'tg-bar', role: 'img', 'aria-label': `정각부터 ${FOCUS_MINUTES}분 집중, ${BREAK_MINUTES}분 휴식` },
      h('i', { class: 'tg-bar-fill', id: 'tg-bar-fill', style: `width:${(hourProgress(v.session, now) * 100).toFixed(1)}%` }),
      h('i', { class: 'tg-bar-break', style: `left:${(FOCUS_MINUTES / 60) * 100}%` }),
    ),
    h('p', { class: 'tg-next' }, p.next),
    h(
      'div',
      { class: 'profile-stats' },
      h('span', { class: 'profile-stat' }, `👥 지금 이 방 ${v.peopleHere}명`),
      h('span', { class: 'profile-stat' }, v.sessionsToday > 0 ? `✅ 오늘 끝낸 세션 ${v.sessionsToday}개` : '✅ 오늘 첫 세션을 끝내 봐요'),
    ),
    h('small', { class: 'form-hint' }, `매시 정각에 다 같이 시작해서 ${FOCUS_MINUTES}분 집중하고 ${BREAK_MINUTES}분 쉬어요. 조금 늦게 와도 40분 넘게 있으면 세션 하나로 쳐요.`),
  );
}

/** 시트를 다시 그리지 않고 남은 시간과 진행 막대만 바꿔요 (매초 불러요) */
export function paintSessionSection(root: ParentNode, s: SessionState, now: number) {
  const timer = root.querySelector<HTMLElement>('#tg-timer');
  if (timer) timer.textContent = clockText(s.endsAt - now);
  const fill = root.querySelector<HTMLElement>('#tg-bar-fill');
  if (fill) fill.style.width = `${(hourProgress(s, now) * 100).toFixed(1)}%`;
}

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

/** "오늘 23명이 다녀갔고 41시간 모각코했어요" (입장 화면, 방에 들어왔을 때 토스트) */
export function roomTodaySentence(t: RoomToday): string {
  if (t.minutes < 1) return `오늘 ${t.visits}명이 다녀갔어요`;
  if (t.visits < 1) return `오늘 ${minutesText(t.minutes)} 모각코했어요`;
  return `오늘 ${t.visits}명이 다녀갔고 ${minutesText(t.minutes)} 모각코했어요`;
}

/** 시트의 '오늘 이 방' 칸: 아무도 없을 때도 다들 다녀간 곳이라는 걸 보여줘요 */
export function renderTodaySection(v: TogetherView): HTMLElement {
  const box = h('section', { class: 'tg-section', 'aria-label': '오늘 이 방' }, h('h3', { class: 'sheet-sub' }, `📊 오늘 ${v.roomName}`));
  const st = v.roomToday;
  if (st.kind !== 'ready') {
    box.append(notReady(st.kind, '오늘 이 방에 다녀간 사람과 시간'));
    return box;
  }
  const today = st.value;
  if (!hasRoomRecord(today)) {
    box.append(h('p', { class: 'tg-empty' }, '오늘은 아직 기록이 없어요. 오늘의 첫 기록을 남겨 봐요 🌱'));
    return box;
  }
  box.append(
    h(
      'div',
      { class: 'tg-tiles' },
      h('div', { class: 'tg-tile' }, h('b', {}, `${today.visits}명`), h('small', {}, '다녀간 사람')),
      h('div', { class: 'tg-tile' }, h('b', {}, minutesText(today.minutes)), h('small', {}, '다 같이 모각코한 시간')),
    ),
    h('small', { class: 'form-hint' }, '누가 했는지는 남기지 않고 합계만 세요. 같은 사람이 다른 기기로 오면 두 번 세요. 5분마다 쌓여요.'),
  );
  return box;
}

/** 아직 못 읽었거나(loading) 서버가 기록을 안 남길 때(off) 보여줄 한 줄 */
function notReady(kind: 'off' | 'loading', what: string): HTMLElement {
  return h('p', { class: 'tg-empty' }, kind === 'off' ? `실시간 서버에 연결되면 ${what}이 보여요.` : '불러오는 중…');
}

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

/** 이보다 평균 인원이 적으면 "붐비는 시간"이라고 부르지 않아요 */
const BUSY_PEAK_MIN_PEOPLE = 0.5;
/** 이보다 기록한 날이 적으면 "아직 정확하지 않아요"라고 덧붙여요 */
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

/** 평균 인원을 읽기 쉽게: 0.4명 / 3.2명 / 12명 */
function peopleText(n: number): string {
  if (n < 0.05) return '거의 없음';
  return n < 10 ? `${n.toFixed(1)}명` : `${Math.round(n)}명`;
}

/** 입장 화면 한 줄: "⏰ 이 방은 보통 밤 10시에 가장 붐벼요" */
export function busyIntroText(b: BusyHours | null): string | null {
  const peak = busyPeak(b);
  return peak ? `⏰ 이 방은 보통 ${hourLabel(peak.hour)}에 가장 붐벼요 (평균 ${peopleText(peak.people)})` : null;
}

/**
 * 시트의 '붐비는 시간' 칸: 시각별 평균 인원 막대 24개.
 * 막대에 마우스를 올리거나 누르면 아래 설명 줄이 그 시각으로 바뀌어요 (기본은 가장 붐비는 시각).
 */
export function renderBusySection(v: TogetherView, myHour: number | null): HTMLElement {
  const box = h('section', { class: 'tg-section', 'aria-label': '붐비는 시간' }, h('h3', { class: 'sheet-sub' }, '⏰ 이 방이 붐비는 시간'));
  const st = v.busyHours;
  if (st.kind !== 'ready') {
    box.append(notReady(st.kind, '사람이 많이 오는 시간'));
    return box;
  }
  const busy = st.value;
  const peak = busyPeak(busy);
  if (!busy || !peak) {
    box.append(h('p', { class: 'tg-empty' }, '아직 기록이 쌓이는 중이에요. 며칠 지나면 사람이 많이 오는 시간이 보여요.'));
    return box;
  }
  const avg = averagePeople(busy);
  const max = Math.max(...avg);
  const describe = (hour: number) => {
    const tags = [hour === v.nowHour ? '지금' : '', hour === myHour ? '내 시간' : ''].filter(Boolean).join(' · ');
    return `${hourLabel(hour)}${tags ? ` (${tags})` : ''} · 평균 ${peopleText(avg[hour])}`;
  };
  const caption = h('p', { class: 'tg-busy-caption', 'aria-live': 'polite' }, '');
  const showDefault = () => (caption.textContent = `가장 붐비는 시간은 ${describe(peak.hour)}`);
  showDefault();
  const bars = avg.map((n, hour) =>
    h(
      'button',
      {
        type: 'button',
        class: ['tg-hour', hour === v.nowHour && 'now', hour === myHour && 'mine', hour === peak.hour && 'peak'].filter(Boolean).join(' '),
        'aria-label': describe(hour),
        onpointerenter: () => (caption.textContent = describe(hour)),
        onfocus: () => (caption.textContent = describe(hour)),
        onclick: () => (caption.textContent = describe(hour)),
      },
      h('i', { style: `height:${max > 0 ? Math.max(n > 0 ? 6 : 0, (n / max) * 100).toFixed(1) : 0}%` }),
    ),
  );
  const chart = h('div', { class: 'tg-busy', role: 'group', 'aria-label': '시각별 평균 인원' }, ...bars);
  chart.addEventListener('pointerleave', showDefault);
  box.append(
    chart,
    h('div', { class: 'tg-busy-axis', 'aria-hidden': 'true' }, ...[0, 6, 12, 18].map((hour) => h('span', { style: `--h:${hour}` }, `${hour}시`))),
    caption,
    h(
      'small',
      { class: 'form-hint' },
      busy.days < BUSY_FEW_DAYS
        ? `기록이 ${busy.days}일치라 아직 정확하지 않아요. 최근 14일 평균으로 보여줘요.`
        : `최근 14일 중 기록이 있는 ${busy.days}일의 평균이에요. 진한 막대가 지금 시각이에요.`,
    ),
  );
  return box;
}

/** '내 모각코 시간' 칸에서 할 수 있는 것 */
export interface MyHourActions {
  /** 시간을 고르거나(0~23) 지워요(null) */
  pick(hour: number | null): void;
  /** 캘린더 일정에 넣을 지금 방 주소 */
  roomLink: string;
}

/** 시트의 '내 모각코 시간' 칸: 매일 오는 시간을 정하고 캘린더에 넣어요 */
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
    h('option', { value: '', selected: myHour === null }, '아직 안 정했어요'),
    ...Array.from({ length: 24 }, (_, hour) => h('option', { value: hour, selected: hour === myHour }, `매일 ${hourLabel(hour)}`)),
  );
  const box = h(
    'section',
    { class: 'tg-section', 'aria-label': '내 모각코 시간' },
    h('h3', { class: 'sheet-sub' }, '🙋 내 모각코 시간'),
    h('label', { for: 'my-hour', class: 'tg-lead' }, '매일 오는 시간을 정해 두면 다시 오기 쉬워요. 위 그래프에 전구색 밑줄로 보여요.'),
    select,
  );
  if (myHour === null) return box;

  const busy = v.busyHours.kind === 'ready' ? v.busyHours.value : null;
  const people = busy && busy.days > 0 ? averagePeople(busy)[myHour] : null;
  const now = Date.now();
  if (people !== null && people >= 0.05) box.append(h('p', { class: 'tg-lead' }, `이 방은 ${hourLabel(myHour)}에 보통 ${peopleText(people)} 있어요.`));
  box.append(
    h(
      'div',
      { class: 'tg-cal' },
      h(
        'button',
        { type: 'button', class: 'primary', onclick: () => downloadText(dailyIcs(myHour, actions.roomLink, now), 'online-mogakco.ics', 'text/calendar') },
        '📅 캘린더에 매일 추가',
      ),
      h('a', { class: 'ghost tg-cal-link', href: googleCalendarUrl(myHour, actions.roomLink, now), target: '_blank', rel: 'noopener noreferrer' }, 'Google 캘린더로'),
    ),
    h(
      'small',
      { class: 'form-hint' },
      '"캘린더에 매일 추가"는 아이폰·맥·아웃룩 캘린더 파일(.ics)을 받아요. 일정 5분 전에 캘린더 앱이 알려줘요. 이 사이트가 직접 알림을 보내지는 않아요.',
    ),
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
