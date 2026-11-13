// '🎯 같이 하는 시간': 정각 세션 버튼(HUD)과 그 버튼으로 여는 시트
// ui.ts가 시트 틀(머리글, 스크롤)을 맡고, 여기서는 안의 내용만 그려요.
import { BREAK_MINUTES, FOCUS_MINUTES, clockText, type SessionState } from '../together/session';
import { h } from './dom';

/** 시트에 보여줄 것 */
export interface TogetherView {
  session: SessionState;
  /** 오늘 내가 끝낸 세션 수 */
  sessionsToday: number;
  /** 지금 이 방에 있는 사람 수 (나 포함) */
  peopleHere: number;
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
