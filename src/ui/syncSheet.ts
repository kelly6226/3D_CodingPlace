// '다른 기기에서 이어하기' 시트의 내용
// ui.ts가 시트 틀(머리글, 스크롤)을 맡고, 여기서는 안의 내용만 그려요.
// 사용자는 코드를 외우지 않아요. 내 링크를 카톡 '나와의 채팅' 같은 곳에 보내 두고, 다른 기기에서 그 링크를 열어요.
// 20글자 코드는 링크를 못 열 때를 위해 접어 둬요.
import { formatSyncCode } from '../sync/code';
import type { SyncPreview, SyncState } from '../sync/deviceSync';
import { h } from './dom';

/** 링크로 들어왔을 때: 그 링크의 기록을 미리 보여주고 버튼 하나로 이어해요 */
export type SyncArrival = { code: string } & ({ kind: 'loading' } | { kind: 'ready'; preview: SyncPreview } | { kind: 'error'; reason: string });

/** 시트에 보여줄 것 */
export interface SyncView {
  /** 링크로 들어왔으면 그 링크의 기록. 있으면 다른 내용 대신 이것만 보여줘요 */
  arrival: SyncArrival | null;
  state: SyncState;
  /** 코드 입력 칸에 적혀 있던 글자 (다시 그려도 이어 가요) */
  draft: string;
  /** 서버에 묻는 중이면 버튼을 막아요 */
  busy: boolean;
  /** 방금 실패한 이유 */
  error: string;
  /** 코드를 가리지 않고 보여줄지 (화면 공유 중에 보이지 않게 처음엔 가려요) */
  revealed: boolean;
  /** 이 브라우저에 공유 창이 있는지 (없으면 링크 복사로 대신해요) */
  canShare: boolean;
  /** 카카오톡 안의 브라우저인지 (여기서 연결하면 카톡 안에만 남아요) */
  inKakao: boolean;
}

export interface SyncActions {
  create(): void;
  join(code: string): void;
  draft(text: string): void;
  reveal(): void;
  /** 공유 창으로 내 링크 보내기 (없으면 복사) */
  share(): void;
  copyCode(): void;
  copyLink(): void;
  /** 카카오톡 안의 브라우저에서 기본 브라우저로 다시 열기 */
  openExternal(): void;
  unlink(): void;
  erase(): void;
  /** 링크로 들어온 화면에서 '나중에' */
  dismissArrival(): void;
}

/** 끝 네 글자만 보여줘요: ••••-••••-••••-••••-WXYZ */
function maskedCode(code: string): string {
  const groups = formatSyncCode(code).split('-');
  return [...groups.slice(0, -1).map((g) => '•'.repeat(g.length)), groups[groups.length - 1]].join('-');
}

/** 시트 머리글 */
export function syncSheetTitle(v: Pick<SyncView, 'arrival'>): string {
  return v.arrival ? '이 기기에서 이어할까요?' : '다른 기기에서 이어하기';
}

export function renderSyncSheet(v: SyncView, a: SyncActions): HTMLElement[] {
  const kakao = v.inKakao ? [renderKakaoNote(a)] : [];
  const error = v.error ? [h('p', { class: 'sync-error', role: 'alert' }, v.error)] : [];
  if (v.arrival) return [...kakao, ...renderArrival(v.arrival, v, a), ...error];
  const body = v.state.kind === 'linked' ? renderLinked(v.state.code, v.state.shared, v, a) : renderUnlinked(v, a);
  return [...kakao, ...body, ...error];
}

/** "12시간 30분" / "45분" / "1분 미만" */
function durationText(ms: number): string {
  const min = Math.floor(ms / 60e3);
  if (min < 1) return '1분 미만';
  const hours = Math.floor(min / 60);
  if (hours === 0) return `${min}분`;
  return min % 60 === 0 ? `${hours}시간` : `${hours}시간 ${min % 60}분`;
}

/** 링크로 들어온 화면: 어떤 기록인지 보여주고, 할 일은 '이어하기' 하나만 */
function renderArrival(arrival: SyncArrival, v: SyncView, a: SyncActions): HTMLElement[] {
  const later = h('button', { type: 'button', class: 'ghost wide', onclick: () => a.dismissArrival() }, '나중에');
  if (arrival.kind === 'error') {
    return [h('p', { class: 'sync-error', role: 'alert' }, arrival.reason), later];
  }
  const card =
    arrival.kind === 'loading'
      ? h('div', { class: 'sync-arrival', 'aria-busy': 'true' }, h('p', { class: 'sync-lead' }, '기록을 불러오는 중이에요…'))
      : h(
          'div',
          { class: 'sync-arrival' },
          h('i', { class: 'sync-arrival-dot', style: `background:${arrival.preview.color}`, 'aria-hidden': 'true' }),
          h(
            'div',
            {},
            h('b', { class: 'sync-arrival-name' }, arrival.preview.name),
            h(
              'p',
              { class: 'sync-lead' },
              arrival.preview.days > 0 ? `잔디 ${arrival.preview.days}칸 · 모두 ${durationText(arrival.preview.totalMs)}` : '아직 쌓인 시간은 없어요',
            ),
          ),
        );
  return [
    card,
    h(
      'button',
      {
        type: 'button',
        // 카톡 안이면 '기본 브라우저로 열기'가 먼저라서 이 버튼은 한 단계 낮춰요
        class: `${v.inKakao ? 'ghost' : 'primary'} wide sync-arrival-go`,
        disabled: v.busy || arrival.kind !== 'ready',
        onclick: () => a.join(arrival.code),
      },
      v.busy ? '이어하는 중…' : '이 기기에서 이어하기',
    ),
    h('small', { class: 'sheet-note' }, '이 기기의 닉네임과 캐릭터는 위 것으로 바뀌고, 이 기기에 쌓인 시간은 그 기록에 더해져요.'),
    later,
  ];
}

/** 카카오톡 안의 브라우저는 저장 공간이 따로라서, 기본 브라우저에서 연결하게 안내해요 */
function renderKakaoNote(a: SyncActions): HTMLElement {
  return h(
    'div',
    { class: 'sync-callout' },
    h('span', {}, '지금 카카오톡 안에서 열려 있어요. 여기서 이어하면 카톡 안에서만 기억돼서, 사파리·크롬에서 다시 들어오면 처음부터예요.'),
    h('button', { type: 'button', class: 'primary', onclick: () => a.openExternal() }, '기본 브라우저로 열기'),
  );
}

function renderUnlinked(v: SyncView, a: SyncActions): HTMLElement[] {
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
    h(
      'p',
      { class: 'sync-lead' },
      '회사에서 하던 걸 집에서, 노트북에서 하던 걸 폰에서 이어 써요. 캐릭터, 잔디, 매일 오는 시간이 따라가요. 이메일이나 비밀번호는 받지 않아요.',
    ),
    h(
      'section',
      { class: 'tg-section' },
      h('h3', { class: 'sheet-sub' }, '여기서 처음 켜기'),
      h('button', { type: 'button', class: 'primary wide', disabled: v.busy, onclick: () => a.create() }, '이어하기 켜기'),
      h('small', { class: 'sheet-note' }, '켜면 내 링크가 생겨요. 그 링크를 카톡 나와의 채팅 같은 곳에 보내 두고, 다른 기기에서 열면 돼요.'),
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
      h('label', { for: 'sync-code', class: 'sheet-sub' }, '다른 기기에서 이미 켰다면'),
      h('p', { class: 'sync-lead' }, '나에게 보내 둔 링크를 이 기기에서 열면 끝이에요. 링크를 열 수 없으면 코드를 넣어 주세요.'),
      h('div', { class: 'sync-row' }, input, h('button', { type: 'submit', class: 'primary', disabled: v.busy }, '이어하기')),
      h('small', { class: 'sheet-note' }, '이어하면 이 기기의 닉네임과 캐릭터가 그쪽 것으로 바뀌고, 이 기기에 쌓인 시간은 그 기록에 더해져요. 페이지를 새로 불러와요.'),
    ),
  ];
}

function renderLinked(code: string, shared: boolean, v: SyncView, a: SyncActions): HTMLElement[] {
  const sendLabel = v.canShare ? '내 링크 나에게 보내기' : '내 링크 복사';
  const send = shared
    ? h(
        'section',
        { class: 'tg-section' },
        h('p', { class: 'sync-lead' }, '이어하기가 켜져 있어요. 다른 기기에서는 나에게 보내 둔 링크를 열면 돼요.'),
        h(
          'div',
          { class: 'sync-row' },
          h('button', { type: 'button', class: 'ghost', onclick: () => a.share() }, v.canShare ? '다시 보내기' : '링크 다시 복사'),
          v.canShare ? h('button', { type: 'button', class: 'ghost', onclick: () => a.copyLink() }, '링크 복사') : null,
        ),
      )
    : h(
        'section',
        { class: 'sync-callout' },
        h('b', {}, '이제 내 링크를 나에게 보내 두세요'),
        h('span', {}, '카톡 나와의 채팅이나 메모에 두면, 회사든 집이든 그 링크를 열어서 바로 이어할 수 있어요. 안 보내 두면 다른 기기에서 이어갈 방법이 없어요.'),
        h('button', { type: 'button', class: 'primary', onclick: () => a.share() }, sendLabel),
      );
  return [
    send,
    h(
      'details',
      { class: 'tg-section sync-code-details' },
      h('summary', { class: 'sheet-sub' }, '링크를 못 열 때: 코드로 이어하기'),
      h(
        'div',
        { class: 'sync-code-box' },
        h('code', { class: 'sync-code' }, v.revealed ? formatSyncCode(code) : maskedCode(code)),
        v.revealed ? null : h('button', { type: 'button', class: 'ghost-sm', onclick: () => a.reveal() }, '보기'),
        h('button', { type: 'button', class: 'ghost-sm', onclick: () => a.copyCode() }, '복사'),
      ),
      h('small', { class: 'sheet-note' }, '다른 기기의 👤 내 프로필 → 다른 기기에서 이어하기에 이 코드를 넣어도 돼요.'),
    ),
    h(
      'small',
      { class: 'sheet-note' },
      h('b', {}, '링크와 코드를 아는 사람은 누구나 내 기록을 이어 쓸 수 있어요.'),
      ' 단톡방이나 남에게는 보내지 마세요. 함께 쓰는 컴퓨터라면 다 쓰고 아래에서 연결을 끊어 주세요.',
    ),
    h(
      'section',
      { class: 'tg-section' },
      h('h3', { class: 'sheet-sub' }, '그만 쓰려면'),
      h('button', { type: 'button', class: 'ghost wide', disabled: v.busy, onclick: () => a.unlink() }, '이 기기에서 연결 끊기'),
      h('button', { type: 'button', class: 'ghost wide sync-erase', disabled: v.busy, onclick: () => a.erase() }, '서버에 남은 기록 지우기'),
      h('small', { class: 'sheet-note' }, '연결을 끊어도 이 기기의 기록은 남아요. 서버 기록을 지우면 다른 기기들도 다음에 열 때 연결이 끊겨요.'),
    ),
  ];
}
