// 1:1 채팅 화면. 채팅 패널의 "1:1" 탭 안에 들어가요.
// 대화마다 로그와 입력 칸을 따로 들고 있어서, 새 말이 와도 줄만 덧붙이고 입력 중인 글은 그대로예요.
// 흐름(요청·수락·전송)은 dm/controller.ts가 맡고, 여기는 그리기만 해요.
import { DM_LOG_MAX, DM_MAX_LENGTH } from '../config';
import type { DmConv, DmLine, DmView } from '../dm/controller';
import { badgeText, h } from './dom';

export interface DmPanelHandlers {
  onAccept(key: string): void;
  onDecline(key: string, block: boolean): void;
  onBlock(key: string): void;
  onClose(key: string): void;
  /** 보낼 수 없으면 이유를 돌려줘요 */
  onSend(key: string, text: string): Promise<string | null>;
  onUnblockAll(): void;
}

interface Entry {
  conv: DmConv;
  log: HTMLOListElement;
  input: HTMLInputElement;
  err: HTMLElement;
  form: HTMLFormElement;
  unread: number;
}

/** 대화가 열린 뒤 입력 칸에 포커스를 주기까지 기다리는 시간 (칸이 그려진 다음이어야 해서) */
const DM_FOCUS_DELAY_MS = 60;

const STATE_LABEL = {
  requesting: '요청 중',
  incoming: '요청 받음',
  ended: '끝남',
} as const;

/** 대화 칩 앞의 점: 대화 중(on) / 상대 기다림(wait) / 답해야 할 요청(ask) / 끝남·요청 중(off) */
function dotOf(c: DmConv): 'on' | 'wait' | 'ask' | 'off' {
  if (c.state === 'open') return c.online ? 'on' : 'wait';
  if (c.state === 'incoming') return 'ask';
  return 'off';
}

function statusOf(c: DmConv): string {
  if (c.state !== 'open') return STATE_LABEL[c.state];
  return c.online ? '대화 중' : '상대를 기다리는 중';
}

export class DmPanel implements DmView {
  readonly el: HTMLElement;
  /** 확인하지 않은 요청과 새 글의 수가 바뀔 때 (탭·💬 버튼의 점 표시용) */
  onAttention: (count: number) => void = () => {};
  /** 대화를 열라고 할 때: 채팅 패널을 열고 1:1 탭으로 바꾸는 건 ui.ts가 해요 */
  onOpenRequest: () => void = () => {};

  private entries = new Map<string, Entry>();
  private selected: string | null = null;
  private visible = false;
  private blockedCount = 0;
  private chips = h('div', { class: 'dm-chips', role: 'tablist', 'aria-label': '1:1 대화 목록' });
  private stage = h('div', { class: 'dm-stage' });
  private foot = h('div', { class: 'dm-foot' });

  constructor(private handlers: DmPanelHandlers) {
    this.el = h('div', { class: 'dm' }, this.chips, this.stage, this.foot);
    this.render();
  }

  /** 1:1 탭이 지금 눈앞에 보이는지. 보이는 동안 온 글은 읽은 걸로 쳐요 */
  setVisible(visible: boolean) {
    this.visible = visible;
    this.markRead();
    this.render();
    this.notify();
  }

  // ── DmView ───────────────────────────────────
  show(conv: DmConv) {
    const prev = this.entries.get(conv.key);
    const entry = prev ?? this.createEntry(conv);
    entry.conv = conv;
    if (!prev) this.entries.set(conv.key, entry);
    if (!this.selected || !this.entries.has(this.selected)) this.selected = conv.key;
    this.render();
    this.notify();
  }

  addLine(key: string, line: DmLine) {
    const e = this.entries.get(key);
    if (!e) return;
    this.appendRow(e, h('li', { class: line.mine ? 'mine' : undefined }, h('span', { class: 'msg' }, line.text)));
    if (!line.mine && !this.isShowing(key)) {
      e.unread += 1;
      this.render();
      this.notify();
    }
  }

  addNotice(key: string, text: string) {
    const e = this.entries.get(key);
    if (e) this.appendRow(e, h('li', { class: 'notice' }, text));
  }

  remove(key: string) {
    this.entries.delete(key);
    if (this.selected === key) this.selected = this.entries.keys().next().value ?? null;
    this.markRead();
    this.render();
    this.notify();
  }

  open(key: string) {
    if (!this.entries.has(key)) return;
    this.selected = key;
    this.onOpenRequest();
    this.markRead();
    this.render();
    this.notify();
    this.focusInput();
  }

  setBlockedCount(n: number) {
    this.blockedCount = n;
    this.renderFoot();
  }

  // ── 그리기 ───────────────────────────────────
  private createEntry(conv: DmConv): Entry {
    const input = h('input', { class: 'dm-input', maxlength: DM_MAX_LENGTH, placeholder: '1:1로 한마디 (Enter로 보내기)', autocomplete: 'off', enterkeyhint: 'send' });
    const err = h('p', { class: 'err', hidden: true });
    const entry: Entry = {
      conv,
      log: h('ol', { class: 'dm-log' }),
      input,
      err,
      form: h('form', {
        class: 'chat-form',
        onsubmit: (ev: Event) => {
          ev.preventDefault();
          this.submit(entry);
        },
      }),
      unread: 0,
    };
    entry.form.append(input, h('button', { class: 'primary', type: 'submit' }, '보내기'));
    return entry;
  }

  private async submit(e: Entry) {
    const text = e.input.value.trim();
    if (!text) return;
    const problem = await this.handlers.onSend(e.conv.key, text);
    e.err.hidden = !problem;
    e.err.textContent = problem ?? '';
    if (!problem) e.input.value = '';
    e.input.focus({ preventScroll: true });
  }

  private appendRow(e: Entry, row: HTMLLIElement) {
    e.log.append(row);
    while (e.log.children.length > DM_LOG_MAX) e.log.firstElementChild?.remove();
    e.log.scrollTop = e.log.scrollHeight;
  }

  private render() {
    // 다시 그려도 입력 중이던 칸에서 계속 칠 수 있게 포커스를 기억해요
    const typing = [...this.entries.values()].find((e) => e.input === document.activeElement);
    this.chips.replaceChildren(...[...this.entries.values()].map((e) => this.chip(e)));
    this.chips.hidden = this.entries.size === 0;
    const cur = this.selected ? this.entries.get(this.selected) : undefined;
    this.stage.replaceChildren(...(cur ? this.pane(cur) : [this.empty()]));
    if (typing && typing === cur) typing.input.focus({ preventScroll: true });
    this.renderFoot();
  }

  private chip(e: Entry): HTMLElement {
    const c = e.conv;
    return h(
      'button',
      {
        type: 'button',
        role: 'tab',
        class: 'dm-chip' + (c.key === this.selected ? ' on' : ''),
        'aria-selected': c.key === this.selected ? 'true' : 'false',
        onclick: () => {
          this.selected = c.key;
          this.markRead();
          this.render();
          this.notify();
          this.focusInput();
        },
      },
      h('i', { class: `dm-dot ${dotOf(c)}` }),
      h('span', { class: 'dm-chip-name' }, c.name),
      e.unread ? h('b', { class: 'dm-unread' }, badgeText(e.unread)) : null,
    );
  }

  private empty(): HTMLElement {
    return h(
      'div',
      { class: 'dm-empty' },
      h('p', {}, '방에 있는 사람의 아바타를 눌러서 ', h('b', {}, '💬 1:1 채팅'), '을 요청해 보세요.'),
      h('p', { class: 'muted' }, '상대가 수락하면 둘만 볼 수 있는 대화가 열려요. 내용은 암호화되어 서버에 저장되지 않아요.'),
    );
  }

  /** 대화 하나의 화면: 머리글 + (상태에 따라) 요청 카드나 대화창 */
  private pane(e: Entry): Node[] {
    const c = e.conv;
    const head = h(
      'div',
      { class: 'dm-head' },
      h('b', {}, c.name),
      h('span', { class: 'dm-status' }, statusOf(c)),
      c.code ? h('span', { class: 'dm-code', title: '상대 화면에도 같은 숫자가 보이면 둘만의 대화예요. 다르면 누가 끼어든 거예요' }, `🔑 ${c.code}`) : null,
      c.state === 'open' || c.state === 'ended'
        ? h(
            'span',
            { class: 'dm-head-actions' },
            h('button', { type: 'button', class: 'ghost-sm', onclick: () => this.handlers.onClose(c.key) }, c.state === 'ended' ? '닫기' : '나가기'),
            h('button', { type: 'button', class: 'ghost-sm', onclick: () => this.handlers.onBlock(c.key) }, '차단'),
          )
        : null,
    );

    if (c.state === 'incoming') {
      return [
        head,
        h(
          'div',
          { class: 'dm-card' },
          h('p', {}, h('b', {}, c.name), '님이 1:1 채팅을 요청했어요.'),
          h('p', { class: 'muted' }, '수락하면 둘만 볼 수 있는 대화가 열려요. 상대가 누구인지는 이름으로만 알 수 있어요. 대화가 열리면 보이는 🔑 숫자를 서로 비교해 보세요.'),
          h(
            'div',
            { class: 'dm-card-actions' },
            h('button', { type: 'button', class: 'primary', onclick: () => this.handlers.onAccept(c.key) }, '수락'),
            h('button', { type: 'button', class: 'ghost', onclick: () => this.handlers.onDecline(c.key, false) }, '거절'),
            h('button', { type: 'button', class: 'ghost', onclick: () => this.handlers.onDecline(c.key, true) }, '차단'),
          ),
        ),
      ];
    }
    if (c.state === 'requesting') {
      return [
        head,
        h(
          'div',
          { class: 'dm-card' },
          h('p', {}, h('b', {}, c.name), '님에게 요청을 보냈어요.'),
          h('p', { class: 'muted' }, '상대가 수락하면 바로 대화할 수 있어요. 1분 안에 답이 없으면 접혀요.'),
          h('button', { type: 'button', class: 'ghost', onclick: () => this.handlers.onClose(c.key) }, '요청 취소'),
        ),
      ];
    }
    const body: Node[] = [head, e.log];
    if (c.state === 'ended') body.push(h('p', { class: 'dm-ended' }, c.note || '대화가 끝났어요.'));
    else body.push(e.err, e.form);
    return body;
  }

  private renderFoot() {
    const rows = [h('p', {}, '대화 내용은 둘만 볼 수 있고 저장되지 않아요. 창을 닫으면 사라져요.')];
    if (this.blockedCount) {
      rows.push(h('p', {}, `차단한 사람 ${this.blockedCount}명 · `, h('button', { type: 'button', class: 'link-btn', onclick: () => this.handlers.onUnblockAll() }, '모두 풀기')));
    }
    this.foot.replaceChildren(...rows);
  }

  // ── 읽음 표시 ────────────────────────────────
  private isShowing(key: string) {
    return this.visible && this.selected === key;
  }

  private markRead() {
    const e = this.selected ? this.entries.get(this.selected) : undefined;
    if (e && this.visible) e.unread = 0;
  }

  /** 답해야 할 요청 수 + 안 읽은 글 수 */
  private notify() {
    let n = 0;
    for (const e of this.entries.values()) n += e.unread + (e.conv.state === 'incoming' ? 1 : 0);
    this.onAttention(n);
  }

  private focusInput() {
    const e = this.selected ? this.entries.get(this.selected) : undefined;
    if (e?.conv.state === 'open') window.setTimeout(() => e.input.focus({ preventScroll: true }), DM_FOCUS_DELAY_MS);
  }
}
