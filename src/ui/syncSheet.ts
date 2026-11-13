// '다른 기기에서 이어하기' 시트의 내용
// ui.ts가 시트 틀(머리글, 스크롤)을 맡고, 여기서는 안의 내용만 그려요.
import { formatSyncCode } from '../sync/code';
import type { SyncState } from '../sync/deviceSync';
import { h } from './dom';

/** 시트에 보여줄 것 */
export interface SyncView {
  state: SyncState;
  /** 코드 입력 칸에 적혀 있던 글자 (다시 그려도 이어 가요) */
  draft: string;
  /** 서버에 묻는 중이면 버튼을 막아요 */
  busy: boolean;
  /** 방금 실패한 이유 */
  error: string;
  /** 코드를 가리지 않고 보여줄지 (화면 공유 중에 보이지 않게 처음엔 가려요) */
  revealed: boolean;
}

export interface SyncActions {
  create(): void;
  join(code: string): void;
  draft(text: string): void;
  reveal(): void;
  copyCode(): void;
  copyLink(): void;
  unlink(): void;
  erase(): void;
}

/** 끝 네 글자만 보여줘요: ••••-••••-••••-••••-WXYZ */
function maskedCode(code: string): string {
  const groups = formatSyncCode(code).split('-');
  return [...groups.slice(0, -1).map((g) => '•'.repeat(g.length)), groups[groups.length - 1]].join('-');
}

export function renderSyncSheet(v: SyncView, a: SyncActions): HTMLElement[] {
  const error = v.error ? h('p', { class: 'sync-error', role: 'alert' }, v.error) : null;
  if (v.state.kind === 'linked') return renderLinked(v.state.code, v, a, error);
  return renderUnlinked(v, a, error);
}

function renderUnlinked(v: SyncView, a: SyncActions, error: HTMLElement | null): HTMLElement[] {
  const input = h('input', {
    id: 'sync-code',
    value: v.draft,
    placeholder: 'XXXX-XXXX-XXXX-XXXX-XXXX',
    autocomplete: 'off',
    autocapitalize: 'characters',
    spellcheck: 'false',
    maxlength: 40,
    oninput: (e: Event) => a.draft((e.currentTarget as HTMLInputElement).value),
  });
  return [
    h('p', { class: 'sync-lead' }, '코드 하나로 다른 기기에서도 같은 캐릭터, 잔디, 매일 오는 시간을 이어 써요. 이메일이나 비밀번호는 받지 않아요.'),
    h(
      'section',
      { class: 'tg-section' },
      h('h3', { class: 'sheet-sub' }, '처음이면'),
      h('button', { type: 'button', class: 'primary wide', disabled: v.busy, onclick: () => a.create() }, '이어하기 코드 만들기'),
    ),
    h(
      'form',
      {
        class: 'tg-section sync-join',
        onsubmit: (e: Event) => {
          e.preventDefault();
          a.join(input.value);
        },
      },
      h('label', { for: 'sync-code', class: 'sheet-sub' }, '다른 기기에서 만든 코드가 있으면'),
      h('div', { class: 'sync-row' }, input, h('button', { type: 'submit', class: 'primary', disabled: v.busy }, '이어하기')),
      h('small', { class: 'sheet-note' }, '이어하면 이 기기의 닉네임과 캐릭터가 그 코드의 것으로 바뀌고, 이 기기에 쌓인 시간은 그 기록에 더해져요. 페이지를 새로 불러와요.'),
    ),
    ...(error ? [error] : []),
  ];
}

function renderLinked(code: string, v: SyncView, a: SyncActions, error: HTMLElement | null): HTMLElement[] {
  return [
    h(
      'section',
      { class: 'tg-section' },
      h('h3', { class: 'sheet-sub' }, '내 이어하기 코드'),
      h(
        'div',
        { class: 'sync-code-box' },
        h('code', { class: 'sync-code' }, v.revealed ? formatSyncCode(code) : maskedCode(code)),
        v.revealed ? null : h('button', { type: 'button', class: 'ghost-sm', onclick: () => a.reveal() }, '보기'),
      ),
      h(
        'div',
        { class: 'sync-row' },
        h('button', { type: 'button', class: 'primary', onclick: () => a.copyCode() }, '코드 복사'),
        h('button', { type: 'button', class: 'ghost', onclick: () => a.copyLink() }, '링크 복사'),
      ),
      h(
        'small',
        { class: 'sheet-note' },
        '다른 기기에서 링크를 열거나, 👤 내 프로필 → 다른 기기에서 이어하기에 코드를 넣으면 돼요. ',
        h('b', {}, '이 코드를 아는 사람은 누구나 내 기록을 이어 쓸 수 있어요.'),
        ' 남에게 보여주지 말고, 잃어버리면 찾아드릴 수 없으니 따로 적어 두세요.',
      ),
    ),
    h(
      'section',
      { class: 'tg-section' },
      h('h3', { class: 'sheet-sub' }, '그만 쓰려면'),
      h('button', { type: 'button', class: 'ghost wide', disabled: v.busy, onclick: () => a.unlink() }, '이 기기에서 연결 끊기'),
      h('button', { type: 'button', class: 'ghost wide sync-erase', disabled: v.busy, onclick: () => a.erase() }, '서버에 남은 기록 지우기'),
      h('small', { class: 'sheet-note' }, '연결을 끊어도 이 기기의 기록은 남아요. 서버 기록을 지우면 다른 기기들도 다음에 열 때 연결이 끊겨요.'),
    ),
    ...(error ? [error] : []),
  ];
}
