// 처음 온 사람에게 기능 옆에 하나씩 붙이는 안내 메모 (카페 직원이 써서 붙여 둔 메모지 느낌)
//
// 별도 튜토리얼 화면 대신 그 자리에서 짧게 보여줘요. 건너뛸 수 있고, 한 번 보면 다시 안 떠요(⚙️에서 다시 보기).
// 근거: NN/g 모바일 튜토리얼 연구(카드식 튜토리얼은 성공률을 못 올림), Apple HIG Onboarding(맥락별 팁, 건너뛰기)
import { h } from './dom';

/** 화면 좌표 (3D 속 내 캐릭터처럼 DOM 요소가 아닌 곳을 가리킬 때) */
export interface ScreenPoint {
  x: number;
  y: number;
}

export interface TipStep {
  emoji: string;
  title: string;
  body: string;
  /** 가리킬 곳. 요소면 그 요소에 빛을 둘러요 */
  target: () => HTMLElement | ScreenPoint | null;
}

/** 메모와 가리키는 곳 사이 거리 */
const GAP = 14;
/** 화면 가장자리와 메모 사이 최소 거리 */
const EDGE = 12;
/** 꼬리가 메모 모서리에 붙지 않게 */
const TAIL_INSET = 22;
/** 3D 캐릭터처럼 움직이는 곳을 따라가는 간격 */
const FOLLOW_MS = 250;

export class Tips {
  private el: HTMLElement | null = null;
  private lit: HTMLElement | null = null;
  private timer = 0;
  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.finish();
  };
  private onResize = () => this.place();
  private steps: TipStep[] = [];
  private index = 0;
  private done: () => void = () => {};

  /** 안내를 처음부터 보여줘요. 끝까지 보거나 건너뛰면 onDone */
  start(steps: TipStep[], onDone: () => void) {
    this.stop();
    this.steps = steps;
    this.index = 0;
    this.done = onDone;
    addEventListener('keydown', this.onKey);
    addEventListener('resize', this.onResize);
    this.timer = window.setInterval(() => this.place(), FOLLOW_MS);
    this.show();
  }

  /** 아무것도 부르지 않고 닫아요 (방을 옮길 때 등) */
  stop() {
    window.clearInterval(this.timer);
    removeEventListener('keydown', this.onKey);
    removeEventListener('resize', this.onResize);
    this.lit?.classList.remove('tip-lit');
    this.lit = null;
    this.el?.remove();
    this.el = null;
  }

  private finish() {
    this.stop();
    this.done();
  }

  private show() {
    const step = this.steps[this.index];
    const last = this.index === this.steps.length - 1;
    const titleId = `tip-title-${this.index}`;
    const next = h(
      'button',
      { type: 'button', class: 'tip-next', onclick: () => (last ? this.finish() : this.go(this.index + 1)) },
      last ? '시작할게요' : '다음',
    );
    this.el?.remove();
    this.el = h(
      'div',
      { class: 'tip', role: 'dialog', 'aria-labelledby': titleId, 'aria-describedby': `${titleId}-body` },
      h('span', { class: 'tip-tape', 'aria-hidden': 'true' }),
      h('p', { class: 'tip-title', id: titleId }, h('span', { 'aria-hidden': 'true' }, step.emoji), ' ', step.title),
      h('p', { class: 'tip-body', id: `${titleId}-body` }, step.body),
      h(
        'div',
        { class: 'tip-foot' },
        h(
          'span',
          { class: 'tip-dots', 'aria-label': `${this.steps.length}개 중 ${this.index + 1}번째` },
          ...this.steps.map((_, i) => h('i', { class: i === this.index ? 'on' : undefined })),
        ),
        last ? null : h('button', { type: 'button', class: 'tip-skip', onclick: () => this.finish() }, '건너뛰기'),
        next,
      ),
      h('span', { class: 'tip-tail', 'aria-hidden': 'true' }),
    );
    document.body.append(this.el);
    this.place();
    next.focus({ preventScroll: true });
  }

  private go(i: number) {
    this.index = i;
    this.show();
  }

  /** 가리키는 곳 위나 아래(화면 위쪽이면 아래)에 메모를 붙이고, 꼬리를 그쪽으로 돌려요 */
  private place() {
    const el = this.el;
    if (!el) return;
    const t = this.steps[this.index].target();
    let anchor: { x: number; top: number; bottom: number } | null = null;
    if (t instanceof HTMLElement) {
      if (this.lit !== t) {
        this.lit?.classList.remove('tip-lit');
        t.classList.add('tip-lit');
        this.lit = t;
      }
      const r = t.getBoundingClientRect();
      anchor = { x: r.left + r.width / 2, top: r.top, bottom: r.bottom };
    } else if (t) {
      anchor = { x: t.x, top: t.y, bottom: t.y };
    }
    if (!anchor) {
      // 가리킬 곳이 없으면 화면 가운데에
      el.dataset.side = 'none';
      el.style.left = `${Math.max(EDGE, (innerWidth - el.offsetWidth) / 2)}px`;
      el.style.top = `${Math.max(EDGE, (innerHeight - el.offsetHeight) / 2)}px`;
      return;
    }
    const below = anchor.bottom < innerHeight * 0.45;
    const w = el.offsetWidth;
    const left = Math.min(innerWidth - w - EDGE, Math.max(EDGE, anchor.x - w / 2));
    const top = below ? anchor.bottom + GAP : anchor.top - GAP - el.offsetHeight;
    el.dataset.side = below ? 'below' : 'above';
    el.style.left = `${left}px`;
    el.style.top = `${Math.max(EDGE, Math.min(innerHeight - el.offsetHeight - EDGE, top))}px`;
    el.style.setProperty('--tail-x', `${Math.min(w - TAIL_INSET, Math.max(TAIL_INSET, anchor.x - left))}px`);
  }
}
