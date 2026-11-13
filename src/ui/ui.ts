// 화면 위 UI (HUD, 하단 액션바, 시트, 토스트)
import {
  ACTIONS,
  BUILTIN_ROOMS,
  CHAT_MAX_LENGTH,
  COMMIT_TYPES,
  DEFAULT_NOISE,
  EMOTES,
  FEEDBACK_URL,
  LANGS,
  NOISE_GROUPS,
  NOISES,
  PLACES,
  PRIVATE_ROOMS_ENABLED,
  ROOM_PASSWORD_MIN_LENGTH,
  ROOM_TAGS,
  SITE,
  STATUSES,
  isLockedRoom,
  langById,
  placeMeta,
  statusById,
  tagLabel,
  type ActionId,
  type NoiseId,
  type PlaceId,
  type RoomInfo,
  type ViewCommand,
  type ViewState,
} from '../config';
import type { Look } from '../look';
import type { Commit, NewRoom, PeerState, RoomToday } from '../net/types';
import { BLOCKED_WORDS_REASON, hasBadWord } from '../net/badwords';
import { studyTodayAt } from '../studyClock';
import { BREAK_MINUTES, FOCUS_MINUTES, type SessionState } from '../together/session';
import { $, h } from './dom';
import {
  busyIntroText,
  hasRoomRecord,
  hourLabel,
  minutesText,
  paintSessionSection,
  renderBusySection,
  renderMyHourSection,
  renderSessionSection,
  renderTodaySection,
  roomTodaySentence,
  sessionIntroText,
  sessionPillLabel,
  sessionPillText,
  type BusyHoursState,
  type RoomTodayState,
} from './together';
import { enableDragScroll } from './dragScroll';
import { loadPrivacyPolicy } from './privacy';
import { Wardrobe, type LookPreviewHandle } from './wardrobe';
import { renderSyncSheet } from './syncSheet';
import type { SyncOutcome, SyncState } from '../sync/deviceSync';
import {
  getMyHour,
  getPeerMeetCount,
  getSessionsToday,
  getStudyHistory,
  hasSeenTogether,
  kstDate,
  markTogetherSeen,
  setMyHour,
  type Profile,
} from '../store';

/** 채팅 목록에 쌓아두는 줄 수. 넘으면 오래된 것부터 지워요 (저장은 안 해요) */
const CHAT_LOG_MAX = 30;
/** 패널이 나타난 직후에 입력 칸에 포커스를 주기까지 기다리는 시간 */
const CHAT_FOCUS_DELAY_MS = 30;
/** 대화상자가 나타난 직후에 입력 칸에 포커스를 주기까지 기다리는 시간 */
const MODAL_FOCUS_DELAY_MS = 30;

export interface ChatLine {
  name: string;
  lang: string;
  text: string;
  mine: boolean;
  /** 귓속말이면 상대방 이름 (내가 보냈으면 받는 사람, 받았으면 보낸 사람) */
  whisperWith?: string;
}

export type SheetKind = 'rooms' | 'status' | 'emote' | 'commit' | 'people' | 'profile' | 'wardrobe' | 'noise' | 'privacy' | 'together' | 'sync';

/** 방 만들기 화면에서 고른 것 (만든 사람 이름은 main.ts가 채워요) */
export type RoomDraft = Omit<NewRoom, 'creator'>;

/** 배경 소리 시트에 보여줄 것: 지금 듣는 소리와 이 방의 기본값 */
export interface NoiseState {
  current: NoiseId;
  roomDefault: NoiseId;
}

export interface UIHandlers {
  onEnter(p: Profile): void;
  onStatus(id: string): void;
  onEmote(id: string): void;
  /** 춤추기, 노트북 던지기 같은 큰 동작 */
  onAct(id: ActionId): void;
  /** 옷장에서 고를 때마다. 저장하고 방 사람들에게 알리는 건 받는 쪽 몫 */
  onLook(look: Look): void;
  /** 옷장 안에 보여줄 3D 미리보기. 만들 수 없으면 null */
  onLookPreview(look: Look): Promise<LookPreviewHandle | null>;
  onCoffee(): void;
  onCommit(type: string, msg: string): Promise<string | null>;
  /** 방 사람들에게 한마디. to가 있으면 그 사람에게만 귓속말. 보낼 수 없으면 이유를 돌려줌 */
  onChat(text: string, to?: string): string | null;
  /** 내 채팅 글을 방명록(커밋)에 남기기. 실패하면 이유를 돌려줌 */
  onChatPin(text: string): Promise<string | null>;
  onSound(on: boolean): void;
  /** 이 방에서 나만 들을 배경 소리 고르기 */
  onNoise(id: NoiseId): void;
  onShare(): void;
  /** 시점 버튼: 내 캐릭터 따라 보기 / 방 전체 보기 */
  onView(cmd: ViewCommand): void;
  onProfileSave(p: Profile): void;
  onWave(id: string): void;
  /** ⚙️의 '처음 안내 다시 보기' */
  onReplayTips(): void;
  /** 커밋 신고 버튼을 눌렀을 때 (확인 창은 main.ts가 띄워요) */
  onReportCommit(c: Commit): void;
  onFocusPeer(id: string): void;
  /** 방 고르기: 입장 전이면 선택만, 입장 후면 그 방으로 이동 */
  onPickRoom(slug: string): void;
  /** 새 방 만들기. password가 비어 있지 않으면 비밀번호 방이에요. 실패하면 이유를 돌려줌 */
  onCreateRoom(draft: RoomDraft): Promise<string | null>;
  /** 입장 버튼을 눌렀을 때, 입장 화면을 닫기 전에 불러요. 비밀번호 방이면 비밀번호를 확인하고, 못 들어가면 false */
  onUnlockRoom(): Promise<boolean>;
  /** 이어하기 코드 만들기 */
  onSyncCreate(): Promise<SyncOutcome>;
  /** 받은 코드로 이어하기. 성공하면 main.ts가 페이지를 새로 불러요 */
  onSyncJoin(code: string): Promise<SyncOutcome>;
  /** 이 기기에서 연결 끊기 (확인 창은 main.ts가 띄워요) */
  onSyncUnlink(): void;
  /** 서버에 남은 기록 지우기 (확인 창은 main.ts가 띄워요) */
  onSyncErase(): void;
  onSyncCopy(what: 'code' | 'link'): void;
}

export class UI {
  private h!: UIHandlers;
  private sheet = '' as SheetKind | '';
  private commits: Commit[] = [];
  private peers: PeerState[] = [];
  private self!: PeerState;
  private toastBox: HTMLElement;
  private soundOn = true;
  /** 이번에 내가 남긴 커밋 (신고할 수 없어서 줄을 펼치지 않아요) */
  private myCommits = new Set<string>();
  /** 방명록에서 펼친 줄(신고 버튼이 보이는 줄)의 해시 */
  private openCommit: string | null = null;
  private noise: NoiseState = { current: 'place', roomDefault: 'place' };
  private rooms: RoomInfo[] = [];
  private counts: Record<string, number> = {};
  private room: RoomInfo | null = null;
  private invited = false;
  private entered = false;
  private tagFilter = '';
  /** 칩을 눌러 목록을 다시 그려도 넘겨 둔 칩 줄 위치가 처음으로 돌아가지 않게 */
  private tagFilterScroll = 0;
  private roomsView: 'list' | 'create' = 'list';
  private chatBtn: HTMLButtonElement;
  private chatPanel!: HTMLElement;
  private chatLog!: HTMLOListElement;
  private chatInput!: HTMLInputElement;
  private chatErr!: HTMLElement;
  private whisperPill!: HTMLElement;
  private whisperName!: HTMLElement;
  private chatSubmit!: HTMLButtonElement;
  /** 지금 귓속말 모드로 고른 상대. 없으면 평소처럼 방 전체에 보여요 */
  private whisperTarget: { id: string; name: string } | null = null;
  /** 비밀번호 방을 만들 수 있는지 (실시간 모드에서만) */
  private lockRoomOk = false;
  private wardrobe = new Wardrobe({ onLook: (look) => this.h.onLook(look), onPreview: (look) => this.h.onLookPreview(look) });
  /** 입장 화면 안의 옷장. 방 안 옷장(위)과 따로 둬서, 입장 화면에서 방 목록을 열어도 미리보기가 안 닫혀요 */
  private introWardrobe: Wardrobe | null = null;
  /** 시점이 처음에서 벗어났거나 내 캐릭터를 따라가는 중이면 true (시점 버튼이 어느 쪽으로 가는지) */
  private viewAway = false;
  /** 지금 정각 세션 (main.ts가 매초 알려줘요) */
  private session: SessionState | null = null;
  /** 지금 방의 오늘 기록 */
  private roomToday: RoomTodayState = { kind: 'loading' };
  /** 방 목록에 보이는 방들의 오늘 기록 (방 slug → 합계) */
  private roomsToday: Record<string, RoomToday> = {};
  /** 지금 방이 보통 몇 시에 붐비는지 */
  private busyHours: BusyHoursState = { kind: 'loading' };
  /** 다른 기기에서 이어하기 */
  private syncState: SyncState = { kind: 'off' };
  private syncDraft = '';
  private syncBusy = false;
  private syncError = '';
  private syncRevealed = false;

  constructor(private root: HTMLElement) {
    root.append(
      // 왼쪽 위: 장소
      h(
        'div',
        { class: 'hud hud-place' },
        h(
          'button',
          { class: 'place-name', id: 'room-btn', onclick: () => this.toggleSheet('rooms'), 'aria-label': '방 고르기' },
          h('span', { id: 'room-lock', hidden: true }, '🔒'),
          h('span', { id: 'room-name' }, placeMeta('cafe').name),
          h('span', { class: 'room', id: 'room', hidden: true }, ''),
          h('span', { class: 'caret' }, '▾'),
        ),
        h(
          'div',
          { class: 'hud-row' },
          h(
            'button',
            { class: 'place-meta', id: 'people-btn', onclick: () => this.toggleSheet('people'), 'aria-label': '지금 있는 사람 보기' },
            h('span', { class: 'live', id: 'conn' }),
            h('b', { id: 'count' }, '1'),
            '명 모각코 중',
            h('span', { class: 'sep' }, '·'),
            h('span', { id: 'since', title: '이 방에 들어온 뒤 지난 시간' }, ''),
            h('span', { class: 'sep' }, '·'),
            h('span', { id: 'study-today', title: '오늘 모각코한 총 시간', hidden: true }, ''),
          ),
        ),
        // 정각 모각코: 누르면 시트. 처음엔 빨간 점을 찍어 눌러 보게 해요
        h(
          'button',
          { type: 'button', class: 'session-pill', id: 'session-btn', onclick: () => this.toggleSheet('together') },
          h('i', { class: 'session-light', 'aria-hidden': 'true' }),
          h('span', { id: 'session-text' }, ''),
          h('i', { class: 'new-dot', id: 'session-dot', hidden: hasSeenTogether(), 'aria-hidden': 'true' }),
        ),
        h('div', { class: 'mode-pill', id: 'mode', hidden: true }, ''),
      ),
      // 오른쪽 위: 설정
      h(
        'div',
        { class: 'hud hud-tools' },
        h('button', { class: 'icon-btn', id: 'noise-btn', onclick: () => this.toggleSheet('noise'), 'aria-label': '배경 소리 고르기', title: '배경 소리' }, '🎧'),
        h('button', { class: 'icon-btn', onclick: () => this.h.onShare(), 'aria-label': '친구에게 공유' }, '🔗'),
        h('button', { class: 'icon-btn', onclick: () => this.toggleSheet('profile'), 'aria-label': '내 프로필' }, '👤'),
      ),
      // 하단 액션바
      h(
        'nav',
        { class: 'actions', id: 'actions' },
        this.action('rooms', '🚪', '방'),
        this.action('status', '💻', '상태', 'status-icon'),
        this.action('emote', '👍', '이모트'),
        this.action('wardrobe', '👕', '꾸미기'),
        (this.chatBtn = h('button', { class: 'act', id: 'act-chat', onclick: () => this.toggleChat(), 'aria-label': '채팅' }, h('span', { class: 'ai' }, '💬'), h('span', { class: 'al' }, '채팅'))),
        h('button', { class: 'act', id: 'act-coffee', onclick: () => this.h.onCoffee() }, h('span', { class: 'ai', id: 'use-icon' }, '☕'), h('span', { class: 'al', id: 'use-label' }, '커피')),
        this.action('commit', '⎇', '커밋'),
        // 시점: 평소엔 내 캐릭터를 따라 보고, 이미 시점을 옮긴 뒤엔 방 전체로 돌아가요
        h('button', { class: 'act', id: 'act-view', title: '내 캐릭터 따라 보기', 'aria-label': '내 캐릭터 따라 보기', onclick: () => this.h.onView(this.viewAway ? 'home' : 'follow') }, h('span', { class: 'ai', id: 'view-icon' }, '🎯'), h('span', { class: 'al' }, '시점')),
      ),
      h('div', { class: 'hint', id: 'hint' }, '바닥을 눌러 걷고, 빈자리를 눌러 앉아요 · 휠·핀치로 확대하고 드래그로 돌려 봐요'),
      h('section', { class: 'sheet', id: 'sheet', hidden: true, role: 'dialog' }),
      this.buildChat(),
      h('div', { class: 'pop', id: 'pop', hidden: true }),
      h('div', { class: 'alarm', id: 'alarm', hidden: true }, h('div', { class: 'alarm-banner', id: 'alarm-text' }, '')),
      h('div', { class: 'modal', id: 'modal', hidden: true }),
      (this.toastBox = h('div', { class: 'toasts', id: 'toasts', 'aria-live': 'polite' })),
    );

    document.addEventListener('pointerdown', (e) => {
      const t = e.target as HTMLElement;
      if (!this.sheet) return;
      if (t.closest('#sheet') || t.closest('.actions') || t.closest('.hud') || t.closest('.modal') || t.closest('.intro-room')) return;
      this.closeSheet();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeSheet();
        this.closeChat();
        this.hidePop();
      }
      if (e.key === 'Enter' && this.canOpenChatWithEnter(e)) {
        e.preventDefault();
        this.openChat();
      }
    });
    window.setTimeout(() => $('#hint').classList.add('gone'), 9000);
  }

  private action(kind: SheetKind, icon: string, label: string, iconId?: string) {
    return h(
      'button',
      { class: 'act', id: `act-${kind}`, onclick: () => this.toggleSheet(kind), 'aria-label': label },
      h('span', { class: 'ai', id: iconId }, icon),
      h('span', { class: 'al' }, label),
    );
  }

  bind(handlers: UIHandlers) {
    this.h = handlers;
  }

  // ── 입장 화면 ───────────────────────────────────
  showIntro(profile: Profile, returning: boolean) {
    const p = { ...profile };
    const nick = h('input', { id: 'nick', maxlength: 12, value: p.name, autocomplete: 'off', spellcheck: 'false' });
    const lang = h('select', { id: 'lang' }, ...LANGS.map((l) => h('option', { value: l.id, selected: l.id === p.lang }, l.label)));
    // 처음부터 옷장으로 꾸미고 들어가요. 고르는 값은 p에만 쌓고, 입장할 때 저장해요
    const dress = h('div', { class: 'intro-dress' });
    this.introWardrobe = new Wardrobe({
      onLook: (look) => Object.assign(p, look),
      // 이 화면은 ui.bind보다 먼저 그려져서, 핸들러가 붙은 뒤에 미리보기를 요청해요
      onPreview: (look) => Promise.resolve().then(() => this.h.onLookPreview(look)),
    });
    this.introWardrobe.render(
      dress,
      h('div', { class: 'intro-dress-head' }, h('span', { class: 'lbl' }, '내 캐릭터'), h('small', {}, '입고 들어가요 · 나중에 아래 👕 꾸미기에서 또 바꿀 수 있어요')),
      { color: p.color, hair: p.hair, skin: p.skin, glasses: p.glasses, outfit: p.outfit },
    );
    const btn = h('button', { class: 'enter', id: 'enter', disabled: true }, '문 여는 중…');
    const bar = h('i');

    const form = h(
      'form',
      {
        class: 'intro-card',
        onsubmit: async (e: Event) => {
          e.preventDefault();
          if (btn.disabled) return;
          if (this.rejectBadNick(nick)) return;
          // 비밀번호 방이면 입장 화면을 닫기 전에 비밀번호부터 확인해요 (못 들어가면 여기 그대로)
          btn.disabled = true;
          const unlocked = await this.h.onUnlockRoom();
          btn.disabled = false;
          if (!unlocked) return;
          p.name = nick.value.trim().slice(0, 12) || p.name;
          p.lang = lang.value;
          this.introWardrobe?.close();
          $('#intro').classList.add('out');
          window.setTimeout(() => $('#intro').remove(), 600);
          this.entered = true;
          this.closeSheet();
          this.h.onEnter(p);
        },
      },
      h('div', { class: 'intro-kicker', id: 'intro-kicker' }, placeMeta(this.room?.place).tagline),
      h('h1', {}, '온라인 모각코'),
      h('p', { class: 'intro-lead' }, '모여서 각자 코딩해요. 빈자리에 앉아 할 일을 하면 돼요.', h('br'), '말은 안 해도 괜찮아요.'),
      h('div', { class: 'intro-places', id: 'intro-places' }),
      h('div', { class: 'intro-room', id: 'intro-room' }),
      h(
        'div',
        { class: 'intro-form' },
        h('label', { for: 'nick' }, '닉네임'),
        nick,
        h('label', { for: 'lang' }, '주력 언어'),
        lang,
      ),
      dress,
      h('div', { class: 'progress' }, bar),
      btn,
      h(
        'p',
        { class: 'intro-foot' },
        '창 하나 켜두면 같이 있는 거예요. 장소마다 배경 소리가 달라요. · ',
        h('a', { href: FEEDBACK_URL }, '피드백 보내기'),
        ' · ',
        this.privacyLink(),
        h(
          'span',
          { id: 'intro-sync', hidden: this.syncState.kind === 'off' },
          ' · ',
          h('button', { type: 'button', class: 'sync-intro-link', onclick: () => this.openSync() }, '다른 기기에서 이어하기'),
        ),
      ),
    );
    this.root.append(h('div', { class: 'intro', id: 'intro' }, form));
    this.introBtn = btn;
    this.introBar = bar;
    this.returning = returning;
    this.renderIntroPlaces();
    this.renderIntroRoom();
  }

  /**
   * 입장 화면의 장소 네 곳. 눌러 보면 그 장소의 기본 방으로 바뀌어서 뒤의 3D 장면을 미리 볼 수 있어요.
   * 지금 보이는 장소에 표시해요.
   */
  private renderIntroPlaces() {
    const el = document.getElementById('intro-places');
    if (!el) return;
    const current = this.room?.place;
    el.replaceChildren(
      h('div', { class: 'ip-head' }, h('span', { class: 'ip-title' }, `장소는 ${PLACES.length}곳이에요`), h('small', {}, '눌러서 미리 둘러봐요')),
      h(
        'div',
        { class: 'ip-list' },
        ...PLACES.map((pm) => {
          const here = pm.id === current;
          const room = BUILTIN_ROOMS.find((r) => r.place === pm.id);
          return h(
            'button',
            {
              type: 'button',
              class: 'ip-place' + (here ? ' on' : ''),
              'aria-pressed': String(here),
              title: pm.desc,
              onclick: () => {
                if (!here && room) this.h.onPickRoom(room.slug);
              },
            },
            h('span', { class: 'ip-emoji', 'aria-hidden': 'true' }, pm.emoji),
            h('span', { class: 'ip-name' }, pm.name),
          );
        }),
      ),
    );
  }

  /** 입장 화면의 "들어갈 방" 줄 */
  private renderIntroRoom() {
    const el = document.getElementById('intro-room');
    if (!el) return;
    el.innerHTML = '';
    const r = this.room;
    if (!r) {
      el.append(h('div', { class: 'ir-loading' }, '방 목록 불러오는 중…'));
      return;
    }
    const n = this.counts[r.slug];
    el.append(
      h('div', { class: 'ir-label' }, this.invited ? '🔗 초대받은 방' : '들어갈 방'),
      h(
        'div',
        { class: 'ir-row' },
        h(
          'div',
          { class: 'ir-main' },
          h('b', {}, isLockedRoom(r) ? '🔒 ' : '', r.name),
          h(
            'span',
            { class: 'ir-meta' },
            r.name === placeMeta(r.place).name ? null : this.placeChip(r.place),
            r.hasPassword ? h('span', { class: 'tag lock' }, '입장할 때 비밀번호가 필요해요') : null,
            ...this.tagChips(r.tags),
            r.isPublic && n !== undefined ? h('span', { class: 'cnt' + (n ? ' on' : '') }, n ? `● ${n}명` : '비어 있음') : null,
          ),
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'ghost-sm',
            onclick: () => this.openSheet('rooms'),
          },
          '다른 방',
        ),
      ),
      h('div', { class: 'ir-session', id: 'ir-session' }, this.session ? sessionIntroText(this.session, Date.now()) : ''),
    );
    // 지금 아무도 없어도 오늘 다녀간 사람들이 있다는 걸 들어가기 전에 보여줘요
    if (this.roomToday.kind === 'ready' && hasRoomRecord(this.roomToday.value)) {
      el.append(h('div', { class: 'ir-today' }, `${roomTodaySentence(this.roomToday.value)}.`));
    }
    const busy = this.busyHours.kind === 'ready' ? busyIntroText(this.busyHours.value) : null;
    if (busy) el.append(h('div', { class: 'ir-today' }, busy));
  }

  private tagChips(tags: string[]) {
    return tags.map((t) => h('span', { class: 'tag' }, tagLabel(t)));
  }

  private placeChip(id: PlaceId) {
    const pm = placeMeta(id);
    return h('span', { class: 'tag place' }, `${pm.emoji} ${pm.name}`);
  }

  /** 하단 먹고 마시기 버튼 (커피, 음료, 컵라면, 피자) */
  private paintUse() {
    const u = placeMeta(this.room?.place).use;
    $('#use-icon').textContent = u.emoji;
    $('#use-label').textContent = u.label;
    $('#act-coffee').setAttribute('aria-label', u.label);
  }

  // ── 방 ─────────────────────────────────────────
  setRooms(list: RoomInfo[]) {
    this.rooms = list;
    if (this.sheet === 'rooms' && this.roomsView === 'list') this.renderSheet();
  }

  setCounts(c: Record<string, number>) {
    this.counts = c;
    this.renderIntroRoom();
    // 방 만드는 중에는 다시 그리면 입력이 날아가서 목록일 때만
    if (this.sheet === 'rooms' && this.roomsView === 'list') this.renderSheet();
  }

  /** 지금 방의 오늘 기록 (main.ts가 방에 들어올 때와 5분마다 읽어요) */
  setRoomToday(state: RoomTodayState) {
    this.roomToday = state;
    this.renderIntroRoom();
    if (this.sheet === 'together') this.renderSheet();
  }

  /** 지금 방이 붐비는 시간 (방에 들어올 때 읽어요) */
  setBusyHours(state: BusyHoursState) {
    this.busyHours = state;
    this.renderIntroRoom();
    if (this.sheet === 'together') this.renderSheet();
  }

  /** 방 목록에서 읽어 둔 한 방의 오늘 기록 (없으면 undefined) */
  roomTodayOf(slug: string): RoomToday | undefined {
    return this.roomsToday[slug];
  }

  /** 방 목록의 오늘 기록 */
  setRoomsToday(map: Record<string, RoomToday>) {
    this.roomsToday = map;
    if (this.sheet === 'rooms' && this.roomsView === 'list') this.renderSheet();
  }

  /** invited를 안 넘기면 초대 표시는 그대로 둠 */
  setCurrentRoom(r: RoomInfo, invited?: boolean) {
    this.room = r;
    if (invited !== undefined) this.invited = invited;
    $('#room-name').textContent = r.name;
    $('#room-lock').hidden = !isLockedRoom(r);
    const kicker = document.getElementById('intro-kicker');
    if (kicker) kicker.textContent = placeMeta(r.place).tagline;
    this.paintUse();
    if (!r.isPublic && !this.rooms.some((x) => x.slug === r.slug)) this.rooms = [r, ...this.rooms];
    this.renderIntroPlaces();
    this.renderIntroRoom();
    if ((this.sheet === 'rooms' && this.roomsView === 'list') || this.sheet === 'people') this.renderSheet();
  }
  private introBtn: HTMLButtonElement | null = null;
  private introBar: HTMLElement | null = null;
  private returning = false;
  private progress = 0;
  private isReady = false;

  setProgress(p: number) {
    this.progress = p;
    if (this.introBar) this.introBar.style.width = `${Math.round(p * 100)}%`;
  }

  /** 입장하기 전에 프로필이 바뀌면(다른 기기에서 이어받았을 때) 입장 화면을 새 프로필로 다시 그려요 */
  replaceIntroProfile(profile: Profile) {
    if (this.entered) return;
    this.introWardrobe?.close();
    document.getElementById('intro')?.remove();
    this.showIntro(profile, true);
    if (this.isReady) this.ready();
    else this.setProgress(this.progress);
  }

  ready() {
    this.isReady = true;
    this.setProgress(1);
    if (this.introBtn) {
      this.introBtn.disabled = false;
      this.introBtn.textContent = this.returning ? '$ npm run 다시-입장' : '$ npm run 입장';
      this.introBtn.focus({ preventScroll: true });
    }
  }

  // ── HUD ───────────────────────────────────────
  setSelf(s: PeerState) {
    this.self = s;
    $('#status-icon').textContent = statusById(s.status).emoji;
    if (this.sheet === 'status' || this.sheet === 'profile') this.renderSheet();
  }

  setRoom(instance: number) {
    const el = $('#room');
    el.textContent = `${instance}호점`;
    el.hidden = instance <= 1;
  }

  setMode(mode: 'online' | 'demo') {
    this.lockRoomOk = mode === 'online';
    const el = $('#mode');
    el.hidden = mode === 'online';
    el.textContent = '데모 모드 · 지금은 봇들이랑 있어요';
  }

  setConn(s: 'connecting' | 'online' | 'offline') {
    const el = $('#conn');
    el.className = 'live ' + s;
    el.title = s === 'online' ? '연결됨' : s === 'connecting' ? '연결 중' : '연결 끊김. 다시 연결하는 중';
  }

  setPeers(peers: PeerState[]) {
    this.peers = peers;
    $('#count').textContent = String(peers.length + 1);
    if (this.sheet === 'people') this.renderSheet();
  }

  /** 위쪽 인원 표시 옆에 내가 이 방에 있은 시간, 사람 목록이 열려 있으면 각자의 시간도 (1초마다 불러요) */
  tickSince() {
    if (!this.self) return;
    $('#since').textContent = stayText(this.self.joinedAt);
    if (this.sheet !== 'people') return;
    for (const el of document.querySelectorAll<HTMLElement>('.people .since')) el.textContent = stayText(Number(el.dataset.joined));
    for (const el of document.querySelectorAll<HTMLElement>('.people .today')) el.textContent = todayText(Number(el.dataset.since));
  }

  /** 이어하기 상태가 바뀌면 (시작할 때, 코드를 만들거나 끊었을 때) */
  setSyncState(state: SyncState) {
    this.syncState = state;
    this.syncError = '';
    if (state.kind !== 'linked') this.syncRevealed = false;
    const introLink = document.getElementById('intro-sync');
    if (introLink) introLink.hidden = state.kind === 'off';
    if (this.sheet === 'sync' || this.sheet === 'profile') this.renderSheet();
  }

  /** 이어하기 시트 열기. 링크로 받은 코드가 있으면 입력 칸에 넣어 둬요 */
  openSync(code?: string) {
    if (code) this.syncDraft = code;
    this.syncError = '';
    this.openSheet('sync');
  }

  /** 이어하기 버튼: 기다리는 동안 버튼을 막고, 실패하면 이유를 시트에 보여줘요 */
  private async runSync(task: () => Promise<SyncOutcome>) {
    if (this.syncBusy) return;
    this.syncBusy = true;
    this.syncError = '';
    this.renderSheet();
    const result = await task();
    this.syncBusy = false;
    if (!result.ok) this.syncError = result.reason;
    if (this.sheet === 'sync') this.renderSheet();
  }

  /** 위쪽에 오늘 누적 공부 시간을 보여줘요. 1분 넘기 전엔 아직 숨겨요 */
  setStudyToday(ms: number) {
    const el = $('#study-today');
    el.hidden = ms < 60e3;
    el.textContent = `오늘 ${elapsedText(ms)}째`;
  }

  /** '정각 모각코' 시트 내용 */
  private renderTogether(): HTMLElement[] {
    if (!this.session) return [];
    const view = {
      session: this.session,
      sessionsToday: getSessionsToday(),
      roomToday: this.roomToday,
      busyHours: this.busyHours,
      nowHour: this.session.hour,
    };
    const myHour = getMyHour();
    const pick = (hour: number | null) => {
      setMyHour(hour);
      this.renderSheet();
      if (hour !== null) this.toast(`매일 ${hourLabel(hour)}로 정했어요`, 'good');
    };
    // 토스 앱 안에서는 .ics 내려받기와 구글 캘린더(토스 밖 링크)를 쓸 수 없어서 캘린더 버튼은 빼요
    const myHourSection = renderMyHourSection(view, myHour, { pick, roomLink: null });
    // 데모 모드는 방 기록이 없어서, 빈 칸을 두 개 보여주는 대신 한 줄로 알려요
    if (this.roomToday.kind === 'off') {
      return [renderSessionSection(view, Date.now()), myHourSection, h('small', { class: 'tg-foot' }, '데모 모드에서는 방 기록이 남지 않아요.')];
    }
    return [renderSessionSection(view, Date.now()), renderTodaySection(view), renderBusySection(view, myHour), myHourSection];
  }

  /** 정각 세션 (매초). 단계가 바뀌면 시트를 다시 그리고, 아니면 글자만 바꿔요 */
  setSession(s: SessionState) {
    const phaseChanged = this.session?.phase !== s.phase;
    this.session = s;
    const now = Date.now();
    const btn = $('#session-btn');
    $('#session-text').textContent = sessionPillText(s, now);
    btn.setAttribute('aria-label', sessionPillLabel(s, now));
    btn.classList.toggle('break', s.phase === 'break');
    const intro = document.getElementById('ir-session');
    if (intro) intro.textContent = sessionIntroText(s, now);
    if (this.sheet !== 'together') return;
    if (phaseChanged) this.renderSheet();
    else paintSessionSection($('#sheet'), s, now);
  }

  setViewState({ moved, following }: ViewState) {
    this.viewAway = moved || following;
    const btn = $('#act-view');
    $('#view-icon').textContent = this.viewAway ? '🏠' : '🎯';
    const tip = this.viewAway ? '방 전체 보기' : '내 캐릭터 따라 보기';
    btn.title = tip;
    btn.setAttribute('aria-label', tip);
    btn.classList.toggle('on', following);
  }

  setSound(on: boolean) {
    this.soundOn = on;
  }

  private toggleSound() {
    this.setSound(!this.soundOn);
    this.h.onSound(this.soundOn);
    // 배경 소리 시트의 '소리가 꺼져 있어요' 줄을 맞춰요
    if (this.sheet === 'noise') this.renderSheet();
  }

  setNoise(state: NoiseState) {
    this.noise = state;
    if (this.sheet === 'noise') this.renderSheet();
  }

  /** 프로필 시트에 넣는 잔디 그래프: 처음엔 이번 주만, 기록이 쌓일수록 최대 53주까지 앞으로 늘어나요 */
  private renderStudyGraph(history: Record<string, number>): HTMLElement {
    const today = kstDate();
    const wd = weekdayKst(today);
    const todaySunday = addDaysKst(today, -wd);
    const earliestActive = Object.keys(history)
      .filter((d) => (history[d] ?? 0) > 0)
      .sort()[0];
    const earliestSunday = earliestActive ? addDaysKst(earliestActive, -weekdayKst(earliestActive)) : todaySunday;
    const weeksNeeded = Math.min(STUDY_GRAPH_WEEKS, daysBetweenKst(earliestSunday, todaySunday) / 7 + 1);
    const gridStart = addDaysKst(today, -(wd + (weeksNeeded - 1) * 7));
    let activeDays = 0;
    const cols = Array.from({ length: weeksNeeded }, (_, c) => {
      const rows = Array.from({ length: 7 }, (_, r) => {
        const date = addDaysKst(gridStart, c * 7 + r);
        if (date > today) return h('span', { class: 'study-cell future' });
        const ms = history[date] ?? 0;
        if (ms > 0) activeDays++;
        return h('span', { class: 'study-cell', 'data-level': String(studyLevel(ms)), title: `${date} · ${ms > 0 ? elapsedText(ms) : '기록 없음'}` });
      });
      return h('div', { class: 'study-col' }, ...rows);
    });
    const scroll = h('div', { class: 'study-graph-scroll' }, h('div', { class: 'study-graph' }, ...cols));
    // 만들자마자 오른쪽 끝(오늘)이 보이게
    window.setTimeout(() => (scroll.scrollLeft = scroll.scrollWidth), 0);
    return h(
      'div',
      { class: 'study-graph-wrap' },
      h('h3', { class: 'sheet-sub' }, '공부 잔디'),
      scroll,
      h(
        'div',
        { class: 'study-legend' },
        '적음',
        ...[0, 1, 2, 3, 4].map((lv) => h('span', { class: 'study-cell', 'data-level': String(lv) })),
        '많음',
        h('span', { class: 'study-days' }, `· ${activeDays}일 출석`),
      ),
    );
  }

  private renderNoise(el: HTMLElement, head: (title: string, sub?: string) => HTMLElement) {
    const { current, roomDefault } = this.noise;
    el.append(
      head('배경 소리', '나에게만 들려요. 방마다 고른 소리를 이 브라우저에 기억해요'),
      h(
        'div',
        { class: 'noise-muted' },
        h('span', {}, this.soundOn ? '🔊 소리 켜져 있어요' : '🔈 소리가 꺼져 있어요'),
        h('button', { type: 'button', class: 'chip-sm' + (this.soundOn ? '' : ' on'), onclick: () => this.toggleSound() }, this.soundOn ? '소리 끄기' : '소리 켜기'),
      ),
    );
    for (const g of NOISE_GROUPS) {
      el.append(
        h('h3', { class: 'noise-group' }, g.label),
        h(
          'div',
          { class: 'grid', role: 'radiogroup', 'aria-label': g.label },
          ...NOISES.filter((n) => n.group === g.id).map((n) =>
            h(
              'button',
              {
                type: 'button',
                role: 'radio',
                'aria-checked': String(n.id === current),
                class: 'chip' + (n.id === current ? ' on' : ''),
                onclick: () => this.h.onNoise(n.id),
              },
              h('span', { class: 'e' }, n.emoji),
              n.name,
              n.id === roomDefault ? h('small', { class: 'noise-default' }, '방 기본') : null,
            ),
          ),
        ),
      );
    }
    el.append(h('p', { class: 'noise-credit' }, '자연·공간 소리는 Freesound의 CC0 녹음이에요'));
  }

  // ── 커밋 ───────────────────────────────────────
  /**
   * 방명록 한 줄. 평소엔 내용만 보이고, 줄을 누르면 아래에 신고 버튼이 펼쳐져요 (한 번에 한 줄만).
   * 내가 남긴 커밋은 펼치지 않아요.
   */
  private commitRow(c: Commit) {
    const body = [
      h('code', { class: 'hash' }, c.hash),
      h('span', { class: 'msg' }, c.msg),
      h('span', { class: 'who', style: `--c:${langById(c.lang).color}` }, c.name),
      h('time', {}, ago(c.at)),
    ];
    if (this.myCommits.has(c.hash)) return h('li', {}, h('div', { class: 'log-main' }, ...body));
    const open = this.openCommit === c.hash;
    const actionsId = `commit-actions-${c.hash}`;
    return h(
      'li',
      { class: open ? 'open' : undefined },
      h(
        'button',
        {
          type: 'button',
          class: 'log-main',
          'aria-expanded': String(open),
          'aria-controls': actionsId,
          onclick: () => {
            this.openCommit = open ? null : c.hash;
            this.renderSheet();
          },
        },
        ...body,
      ),
      h(
        'div',
        { class: 'log-actions', id: actionsId, hidden: !open },
        h(
          'button',
          { type: 'button', class: 'report-btn', onclick: () => this.h.onReportCommit(c) },
          h('span', { 'aria-hidden': 'true' }, '🚩'),
          '이 커밋 신고하기',
        ),
      ),
    );
  }

  /** mine: 이번에 내가 남긴 커밋 해시 (신고할 수 없어서 줄을 펼치지 않아요) */
  setCommits(list: Commit[], mine: Set<string>) {
    this.commits = list;
    this.myCommits = mine;
    if (this.sheet === 'commit') this.renderSheet();
  }

  // ── 시트 ───────────────────────────────────────
  // ── 채팅 ─────────────────────────────────────
  // 시트는 다시 그릴 때 입력 중인 글이 사라져서, 채팅은 한 번 만들어 두고 줄만 덧붙여요.
  // 말풍선은 main.ts가 아바타에 띄우고, 여기는 입력 칸과 최근 대화 목록만 맡아요.
  private buildChat(): HTMLElement {
    this.chatLog = h('ol', { class: 'chat-log' });
    this.chatErr = h('p', { class: 'err', hidden: true });
    this.chatInput = h('input', { id: 'chat-input', maxlength: CHAT_MAX_LENGTH, placeholder: '한마디 (Enter로 보내기)', autocomplete: 'off', enterkeyhint: 'send' });
    this.whisperName = h('b', {}, '');
    this.whisperPill = h(
      'div',
      { class: 'whisper-pill', hidden: true },
      h('span', {}, '🤫 ', this.whisperName, '님에게만 보여요'),
      h('button', { type: 'button', class: 'whisper-x', onclick: () => this.clearWhisper(), 'aria-label': '귓속말 그만하기' }, '✕'),
    );
    this.chatSubmit = h('button', { class: 'primary', type: 'submit' }, '보내기');
    const form = h(
      'form',
      {
        class: 'chat-form',
        onsubmit: (e: Event) => {
          e.preventDefault();
          this.sendChat();
        },
      },
      this.chatInput,
      this.chatSubmit,
    );
    this.chatPanel = h(
      'section',
      { class: 'chat', id: 'chat', hidden: true, 'aria-label': '채팅' },
      h(
        'header',
        { class: 'chat-head' },
        h('p', {}, '말풍선으로 잠깐 보여요.', h('br'), '다른 사람을 누르면 귓속말도 가능 · 남기고 싶은 말은 📌'),
        h('button', { class: 'x', type: 'button', onclick: () => this.closeChat(), 'aria-label': '채팅 닫기' }, '✕'),
      ),
      this.chatLog,
      this.chatErr,
      this.whisperPill,
      form,
    );
    return this.chatPanel;
  }

  /** 특정 사람에게만 보이는 귓속말 모드로 전환 (방을 나가거나 새로고침하면 상대를 다시 못 찾아요) */
  startWhisper(id: string, name: string) {
    this.whisperTarget = { id, name };
    this.whisperName.textContent = name;
    this.whisperPill.hidden = false;
    this.chatPanel.classList.add('whispering');
    this.chatInput.placeholder = `${name}님에게 귓속말`;
    this.chatSubmit.textContent = '귓속말 보내기';
    this.openChat();
  }

  private clearWhisper() {
    this.whisperTarget = null;
    this.whisperPill.hidden = true;
    this.chatPanel.classList.remove('whispering');
    this.chatInput.placeholder = '한마디 (Enter로 보내기)';
    this.chatSubmit.textContent = '보내기';
  }

  toggleChat() {
    if (this.chatPanel.hidden) this.openChat();
    else this.closeChat();
  }

  openChat() {
    if (!this.entered) return;
    // 시트와 채팅은 화면의 같은 자리를 써서 둘 중 하나만 열어요 (openSheet도 채팅을 닫음)
    this.closeSheet();
    this.hidePop();
    this.chatPanel.hidden = false;
    this.chatBtn.classList.add('open');
    this.chatBtn.classList.remove('unread');
    window.setTimeout(() => this.chatInput.focus({ preventScroll: true }), CHAT_FOCUS_DELAY_MS);
  }

  closeChat() {
    this.chatPanel.hidden = true;
    this.chatBtn.classList.remove('open');
    this.chatInput.blur();
    this.clearWhisper();
  }

  /** 입력 칸·버튼·대화상자에 포커스가 없을 때만 Enter로 채팅을 열어요 */
  private canOpenChatWithEnter(e: KeyboardEvent) {
    if (!this.entered || !$('#modal').hidden) return false;
    return !(e.target as HTMLElement).closest('input, textarea, select, button, [contenteditable]');
  }

  private sendChat() {
    const text = this.chatInput.value.trim();
    if (!text) return;
    const problem = this.h.onChat(text, this.whisperTarget?.id);
    this.chatErr.hidden = !problem;
    this.chatErr.textContent = problem ?? '';
    if (!problem) this.chatInput.value = '';
    this.chatInput.focus({ preventScroll: true });
  }

  /**
   * 대화 한 줄 추가. 내 글에만 방명록에 남기는 📌 버튼이 붙어요 (방명록에는 내 닉네임으로 남으니까) —
   * 귓속말은 방명록이 공개라서 📌를 안 붙여요
   */
  addChat(line: ChatLine) {
    const pin =
      line.mine && !line.whisperWith
        ? h(
            'button',
            {
              class: 'pin',
              type: 'button',
              title: '방명록에 남기기',
              'aria-label': '방명록에 남기기',
              onclick: (e: Event) => void this.pinChat(line.text, e.currentTarget as HTMLButtonElement),
            },
            '📌',
          )
        : null;
    const who = line.whisperWith ? (line.mine ? `🤫 나 → ${line.whisperWith}` : `🤫 ${line.name}`) : line.name;
    this.chatLog.append(
      h(
        'li',
        { class: [line.mine && 'mine', line.whisperWith && 'whisper'].filter(Boolean).join(' ') || undefined },
        h('span', { class: 'who', style: `--c:${langById(line.lang).color}` }, who),
        h('span', { class: 'msg' }, line.text),
        pin,
      ),
    );
    while (this.chatLog.children.length > CHAT_LOG_MAX) this.chatLog.firstElementChild?.remove();
    this.chatLog.scrollTop = this.chatLog.scrollHeight;
    // 패널이 닫혀 있으면 새 글이 왔다는 표시만 해둬요
    if (!line.mine && this.chatPanel.hidden) this.chatBtn.classList.add('unread');
  }

  /** 방을 옮기면 이전 방의 대화는 비워요 */
  clearChat() {
    this.chatLog.replaceChildren();
    this.chatErr.hidden = true;
    this.chatBtn.classList.remove('unread');
  }

  private async pinChat(text: string, btn: HTMLButtonElement) {
    btn.disabled = true;
    const problem = await this.h.onChatPin(text);
    if (problem) {
      btn.disabled = false;
      this.chatErr.hidden = false;
      this.chatErr.textContent = problem;
      return;
    }
    btn.textContent = '✓';
    btn.title = '방명록에 남겼어요';
  }

  toggleSheet(kind: SheetKind) {
    if (this.sheet === kind) this.closeSheet();
    else this.openSheet(kind);
  }

  openSheet(kind: SheetKind) {
    // 채팅과 같은 자리를 쓰니까 열려 있으면 닫아요 (openChat도 시트를 닫음)
    this.closeChat();
    this.hidePop();
    if (kind === 'rooms' && this.sheet !== 'rooms') this.roomsView = 'list';
    if (kind === 'together') {
      markTogetherSeen();
      $('#session-dot').hidden = true;
    }
    this.sheet = kind;
    document.querySelectorAll('.act').forEach((b) => b.classList.remove('active'));
    $(`#act-${kind}`)?.classList.add('active');
    this.renderSheet();
    $('#sheet').hidden = false;
  }

  closeSheet() {
    this.sheet = '';
    this.openCommit = null;
    this.wardrobe.close();
    delete $('#sheet').dataset.sheetKey; // 다시 열면 맨 위부터
    $('#sheet').hidden = true;
    document.querySelectorAll('.act').forEach((b) => b.classList.remove('active'));
  }

  private renderSheet() {
    const el = $('#sheet');
    // 다른 시트로 바뀌면 옷장의 3D 미리보기를 정리해요
    if (this.sheet !== 'wardrobe') this.wardrobe.close();
    // 같은 화면을 다시 그리는 거면(인원수·커밋이 갱신될 때) 스크롤 위치와 쓰던 글을 이어 가요
    const sheetKey = `${this.sheet}:${this.roomsView}`;
    const sameSheet = el.dataset.sheetKey === sheetKey;
    const keptScroll = sameSheet ? (el.querySelector<HTMLElement>('.sheet-body')?.scrollTop ?? 0) : 0;
    const keptDraft = sameSheet && this.sheet === 'commit' ? this.readCommitDraft(el) : null;
    el.dataset.sheetKey = sheetKey;
    el.innerHTML = '';
    // 다시 그릴 때마다 클래스를 새로 정하니, 모양을 정하는 클래스는 모두 여기서 붙여요
    // 방 고르기와 커밋 방명록은 화면 가운데에 크게 (style.css .sheet.center, 방명록은 .wide로 더 넓게)
    const centered = this.sheet === 'rooms' || this.sheet === 'commit' || this.sheet === 'privacy' || this.sheet === 'sync';
    el.className = `sheet sheet-${this.sheet}` + (centered ? ' center' : '') + (this.sheet === 'commit' ? ' wide' : '');
    const head = (title: string, sub?: string) =>
      h('header', {}, h('h2', {}, title), sub ? h('p', {}, sub) : null, h('button', { class: 'x', onclick: () => this.closeSheet(), 'aria-label': '닫기' }, '✕'));

    switch (this.sheet) {
      case 'rooms': {
        this.renderRooms(el, head);
        break;
      }
      case 'noise': {
        this.renderNoise(el, head);
        break;
      }
      case 'together': {
        if (!this.session) break;
        el.append(
          head('정각 모각코', `매시 정각에 같이 시작해서 ${FOCUS_MINUTES}분 하고 ${BREAK_MINUTES}분 쉬어요`),
          ...this.renderTogether(),
        );
        break;
      }
      case 'status': {
        el.append(
          head('지금 뭐 해요?', '머리 위에 이모지로 보여요'),
          h(
            'div',
            { class: 'grid' },
            ...STATUSES.map((s) =>
              h(
                'button',
                {
                  class: 'chip' + (this.self?.status === s.id ? ' on' : ''),
                  onclick: () => {
                    this.h.onStatus(s.id);
                    this.closeSheet();
                  },
                },
                h('span', { class: 'e' }, s.emoji),
                s.label,
              ),
            ),
          ),
        );
        break;
      }
      case 'emote': {
        el.append(
          head('이모트', '말 대신 리액션'),
          h(
            'div',
            { class: 'grid grid-4' },
            ...EMOTES.map((e) =>
              h(
                'button',
                {
                  class: 'chip col',
                  onclick: () => {
                    this.h.onEmote(e.id);
                    this.closeSheet();
                  },
                },
                h('span', { class: 'e big' }, e.emoji),
                e.label,
              ),
            ),
          ),
          h('h3', { class: 'sheet-sub' }, '큰 동작'),
          h(
            'div',
            { class: 'grid grid-4' },
            ...ACTIONS.map((a) =>
              h(
                'button',
                {
                  class: 'chip col',
                  onclick: () => {
                    this.h.onAct(a.id);
                    this.closeSheet();
                  },
                },
                h('span', { class: 'e big' }, a.emoji),
                a.label,
              ),
            ),
          ),
        );
        break;
      }
      case 'wardrobe': {
        const s = this.self;
        this.wardrobe.render(el, head('옷장', '고르면 바로 입어 봐요'), { color: s.color, hair: s.hair, skin: s.skin, glasses: s.glasses, outfit: s.outfit });
        break;
      }
      case 'commit': {
        const type = h('select', { id: 'commit-type', 'aria-label': '커밋 종류' }, ...COMMIT_TYPES.map((t) => h('option', { value: t }, t)));
        const msg = h('input', { id: 'commit-msg', maxlength: 50, placeholder: '오늘 한 일, 하고 싶은 말', autocomplete: 'off' });
        const err = h('p', { class: 'err sheet-pin', hidden: true });
        const submit = h('button', { class: 'primary', type: 'submit' }, 'commit');
        const form = h(
          'form',
          {
            class: 'commit-form sheet-pin',
            onsubmit: async (e: Event) => {
              e.preventDefault();
              const m = msg.value.trim();
              if (!m) {
                msg.focus();
                return;
              }
              submit.disabled = true;
              const problem = await this.h.onCommit(type.value, m);
              submit.disabled = false;
              if (problem) {
                err.hidden = false;
                err.textContent = problem;
              } else {
                msg.value = '';
                err.hidden = true;
              }
            },
          },
          // 패널이 좁아도 메시지 칸이 한 줄을 다 쓰도록 명령어와 입력 칸을 두 줄로 나눔
          h(
            'div',
            { class: 'term' },
            h('div', { class: 'term-line' }, h('span', { class: 'prompt' }, '$ git commit -m "'), type, h('span', { class: 'colon' }, ':')),
            h('div', { class: 'term-line' }, msg, h('span', { class: 'prompt' }, '"')),
          ),
          submit,
        );
        el.append(
          head('커밋 남기기', '벽에 걸린 TV의 git log에 올라가요. 방명록이에요.'),
          form,
          err,
          h(
            'ol',
            { class: 'log' },
            ...this.commits.slice(0, 30).map((c) => this.commitRow(c)),
          ),
        );
        if (keptDraft) {
          type.value = keptDraft.type;
          msg.value = keptDraft.msg;
        }
        // 처음 열 때만 입력 칸에 커서를 둬요. 다시 그릴 때마다 두면 목록을 보다가 키보드가 올라와요
        if (!keptDraft || keptDraft.focused) window.setTimeout(() => msg.focus({ preventScroll: true }), 30);
        break;
      }
      case 'privacy': {
        const policy = h('article', { class: 'policy' }, h('p', { class: 'policy-note' }, '불러오는 중이에요…'));
        el.append(head('개인정보 처리방침', '어떤 정보를 받고, 어디에 얼마나 보관하는지 적어뒀어요'), policy);
        // 그 사이 다른 시트로 바뀌었으면(policy가 화면에서 빠졌으면) 그리지 않아요
        void loadPrivacyPolicy().then(
          (doc) => {
            if (policy.isConnected) policy.replaceChildren(doc);
          },
          () => {
            if (policy.isConnected) policy.replaceChildren(h('p', { class: 'policy-note' }, `처방침을 불러오지 못했어요. ${SITE.contact}로 문의해 주세요.`));
          },
        );
        break;
      }
      case 'people': {
        const list = [this.self, ...this.peers].filter(Boolean);
        el.append(
          head(`지금 ${list.length}명 모각코 중`, this.room?.name ?? placeMeta('cafe').name),
          h(
            'ul',
            { class: 'people' },
            ...list.map((p) => {
              const st = statusById(p.status);
              return h(
                'li',
                {},
                h(
                  'button',
                  {
                    onclick: () => {
                      this.h.onFocusPeer(p.id);
                      this.closeSheet();
                    },
                  },
                  h('span', { class: 'e' }, st.emoji),
                  h(
                    'span',
                    { class: 'n' },
                    p.name,
                    p.id === this.self.id
                      ? h('em', {}, ' (나)')
                      : getPeerMeetCount(p.id) >= 2
                        ? h('em', { class: 'familiar', title: '전에도 같이 모각코했어요' }, ' 🙋 또 만났어요')
                        : null,
                  ),
                  h(
                    'span',
                    { class: 's' },
                    st.label,
                    ' · ',
                    h('span', { class: 'since', 'data-joined': p.joinedAt }, stayText(p.joinedAt)),
                    ' · ',
                    h('span', { class: 'today', 'data-since': p.studySince }, todayText(p.studySince)),
                  ),
                  h('span', { class: 'lang', style: `--c:${langById(p.lang).color}` }, langById(p.lang).label.split(' ')[0]),
                ),
              );
            }),
          ),
        );
        break;
      }
      case 'profile': {
        const s = this.self;
        const p: Profile = { id: s.id, name: s.name, color: s.color, lang: s.lang, hair: s.hair, skin: s.skin, glasses: s.glasses, outfit: s.outfit };
        const nick = h('input', { id: 'p-nick', maxlength: 12, value: p.name, autocomplete: 'off' });
        const lang = h('select', { id: 'p-lang' }, ...LANGS.map((l) => h('option', { value: l.id, selected: l.id === p.lang }, l.label)));
        const history = getStudyHistory();
        const today = kstDate();
        const streak = currentStreak(history, today);
        const st = statusById(s.status);
        el.append(
          head('내 프로필', '후드티·머리·모자는 👕 옷장에서 바꿔요'),
          h(
            'div',
            { class: 'profile-head' },
            h('div', { class: 'profile-avatar', style: `background:${p.color}` }, st.emoji),
            h(
              'div',
              { class: 'profile-id' },
              h('div', { class: 'profile-name' }, p.name),
              h('span', { class: 'lang', style: `--c:${langById(p.lang).color}` }, langById(p.lang).label.split(' ')[0]),
            ),
          ),
          h(
            'div',
            { class: 'profile-stats' },
            h('span', { class: 'profile-stat' }, streak > 0 ? `🔥 연속 ${streak}일째` : '🌱 오늘부터 시작해봐요'),
            h('span', { class: 'profile-stat' }, `⏱ 오늘 ${elapsedText(history[today] ?? 0)}`),
            h('span', { class: 'profile-stat' }, `🟩 정각 모각코 ${getSessionsToday()}칸`),
          ),
          this.renderStudyGraph(history),
          h('h3', { class: 'sheet-sub' }, '✏️ 정보 수정'),
          h(
            'form',
            {
              class: 'intro-form',
              onsubmit: (e: Event) => {
                e.preventDefault();
                if (this.rejectBadNick(nick)) return;
                p.name = nick.value.trim().slice(0, 12) || p.name;
                p.lang = lang.value;
                this.h.onProfileSave(p);
                this.closeSheet();
              },
            },
            h('label', { for: 'p-nick' }, '닉네임'),
            nick,
            h('label', { for: 'p-lang' }, '주력 언어'),
            lang,
            h('button', { class: 'primary wide', type: 'submit' }, '저장'),
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'ghost wide tips-again',
              onclick: () => {
                this.closeSheet();
                this.h.onReplayTips();
              },
            },
            '처음 안내 다시 보기',
          ),
          ...(this.syncState.kind === 'off'
            ? []
            : [h('button', { type: 'button', class: 'ghost wide sync-open', onclick: () => this.openSync() }, '📱 다른 기기에서 이어하기')]),
          h(
            'small',
            { class: 'sheet-note' },
            this.syncState.kind === 'linked'
              ? '이어하기 코드로 연결돼 있어서 다른 기기와 같은 기록을 써요. · '
              : '프로필은 이 브라우저에만 저장돼요. 다른 기기나 시크릿 창에서는 처음부터 시작해요. · ',
            h('a', { href: FEEDBACK_URL }, '피드백 보내기'),
          ),
        );
        break;
      }
      case 'sync': {
        el.append(
          head('다른 기기에서 이어하기'),
          ...renderSyncSheet(
            { state: this.syncState, draft: this.syncDraft, busy: this.syncBusy, error: this.syncError, revealed: this.syncRevealed },
            {
              create: () => void this.runSync(() => this.h.onSyncCreate()),
              join: (code) => void this.runSync(() => this.h.onSyncJoin(code)),
              draft: (text) => {
                this.syncDraft = text;
              },
              reveal: () => {
                this.syncRevealed = true;
                this.renderSheet();
              },
              copyCode: () => this.h.onSyncCopy('code'),
              copyLink: () => this.h.onSyncCopy('link'),
              unlink: () => this.h.onSyncUnlink(),
              erase: () => this.h.onSyncErase(),
            },
          ),
        );
        break;
      }
    }
    this.fixSheetHeader(el, keptScroll);
  }

  /** 개인정보 처리방침 링크. 앱인토스는 밖으로 나가는 링크를 막아서, 새 창이 아니라 앱 안 시트로 열어요 */
  private privacyLink() {
    return h('button', { class: 'link-btn', type: 'button', onclick: () => this.openSheet('privacy') }, '개인정보 처리방침');
  }

  /**
   * 머리글(과 .sheet-pin 입력 줄)은 위에 고정하고, 나머지는 .sheet-body 안에서만 스크롤되게 감싸요.
   * 시트마다 따로 짜지 않고 한 곳에서 해서, 새 시트를 추가해도 같은 모양이 돼요.
   */
  private fixSheetHeader(el: HTMLElement, scrollTop: number) {
    const isPinned = (c: Element) => c.tagName === 'HEADER' || c.classList.contains('sheet-pin');
    const children = [...el.children];
    let pinned = 0;
    while (pinned < children.length && isPinned(children[pinned])) pinned++;
    const body = h('div', { class: 'sheet-body' }, ...children.slice(pinned));
    el.append(body);
    body.scrollTop = scrollTop;
  }

  /** 방명록 시트를 다시 그리기 전에, 쓰던 글과 종류를 꺼내 둬요 */
  private readCommitDraft(el: HTMLElement) {
    const msg = el.querySelector<HTMLInputElement>('#commit-msg');
    const type = el.querySelector<HTMLSelectElement>('#commit-type');
    if (!msg || !type) return null;
    return { msg: msg.value, type: type.value, focused: document.activeElement === msg };
  }

  // ── 방 고르기 / 만들기 ────────────────────────────
  private renderRooms(el: HTMLElement, head: (title: string, sub?: string) => HTMLElement) {
    if (this.roomsView === 'create') {
      const name = h('input', { id: 'room-name-input', maxlength: 24, placeholder: '예: 새벽 3시 버그 사냥단', autocomplete: 'off' });
      const picked = new Set<string>();
      const tagBox = h('div', { class: 'tag-pick' });
      const paint = () => {
        tagBox.innerHTML = '';
        for (const t of ROOM_TAGS) {
          const on = picked.has(t.id);
          tagBox.append(
            h(
              'button',
              {
                type: 'button',
                class: 'chip-sm' + (on ? ' on' : ''),
                'aria-pressed': String(on),
                onclick: () => {
                  if (on) picked.delete(t.id);
                  else if (picked.size < 3) picked.add(t.id);
                  paint();
                },
              },
              t.label,
            ),
          );
        }
      };
      paint();
      let place: PlaceId = 'cafe';
      const placeBox = h('div', { class: 'place-pick', role: 'radiogroup', 'aria-label': '장소' });
      const paintPlaces = () => {
        placeBox.replaceChildren(
          ...PLACES.map((pm) =>
            h(
              'button',
              {
                type: 'button',
                role: 'radio',
                'aria-checked': String(pm.id === place),
                class: 'place-opt' + (pm.id === place ? ' on' : ''),
                onclick: () => {
                  place = pm.id;
                  paintPlaces();
                },
              },
              h('span', { class: 'po-emoji' }, pm.emoji),
              h('b', {}, pm.name),
              h('small', {}, pm.desc),
              h('i', {}, `최대 ${pm.cap}명`),
            ),
          ),
        );
      };
      paintPlaces();
      let noise: NoiseId = DEFAULT_NOISE;
      const noiseBox = h('div', { class: 'tag-pick', role: 'radiogroup', 'aria-label': '배경 소리' });
      const paintNoises = () => {
        noiseBox.replaceChildren(
          ...NOISES.map((n) =>
            h(
              'button',
              {
                type: 'button',
                role: 'radio',
                'aria-checked': String(n.id === noise),
                class: 'chip-sm' + (n.id === noise ? ' on' : ''),
                onclick: () => {
                  noise = n.id;
                  paintNoises();
                },
              },
              `${n.emoji} ${n.name}`,
            ),
          ),
        );
      };
      paintNoises();
      const pub = h('input', { type: 'radio', name: 'vis', id: 'vis-pub', value: 'pub', checked: true });
      const priv = h('input', { type: 'radio', name: 'vis', id: 'vis-priv', value: 'priv' });
      const pw = h('input', { id: 'room-pw', type: 'password', maxlength: 40, placeholder: '비워 두면 누구나 들어와요', autocomplete: 'new-password', spellcheck: 'false' });
      const err = h('p', { class: 'err', hidden: true });
      const submit = h('button', { class: 'primary wide', type: 'submit' }, '방 만들기');
      el.append(
        head('새 방 만들기', '만들면 링크가 복사돼요. 보내면 받은 사람이 바로 이 방으로 들어와요'),
        h(
          'form',
          {
            class: 'room-form',
            onsubmit: async (e: Event) => {
              e.preventDefault();
              const n = name.value.trim();
              if (!n) {
                name.focus();
                return;
              }
              submit.disabled = true;
              const problem = await this.h.onCreateRoom({ name: n, tags: [...picked], isPublic: pub.checked, place, noise, password: pw.value });
              submit.disabled = false;
              if (problem) {
                err.hidden = false;
                err.textContent = problem;
              } else {
                this.roomsView = 'list';
              }
            },
          },
          h('label', { for: 'room-name-input' }, '방 이름'),
          name,
          h('span', { class: 'lbl' }, '장소'),
          placeBox,
          h('span', { class: 'lbl' }, '배경 소리 (들어온 사람이 각자 바꿀 수 있어요)'),
          noiseBox,
          h('span', { class: 'lbl' }, '주제 (3개까지)'),
          tagBox,
          ...(this.lockRoomOk
            ? [
                h('label', { for: 'room-pw' }, '🔒 입장 비밀번호 (선택)'),
                pw,
                h(
                  'small',
                  { class: 'form-hint' },
                  `정하면 방 목록에 🔒로 보이고, 비밀번호를 아는 사람끼리 모여요. 가벼운 잠금이라 ${ROOM_PASSWORD_MIN_LENGTH}글자 이상으로 정해 주세요. 만든 뒤에는 바꾸거나 풀 수 없고, 잊어버리면 찾을 수 없어요.`,
                ),
              ]
            : []),
          ...(PRIVATE_ROOMS_ENABLED
            ? [
                h('span', { class: 'lbl' }, '공개 여부'),
                h(
                  'div',
                  { class: 'vis' },
                  h('label', { for: 'vis-pub', class: 'vis-opt' }, pub, h('span', {}, h('b', {}, '공개'), h('small', {}, '방 목록에 보여요'))),
                  h('label', { for: 'vis-priv', class: 'vis-opt' }, priv, h('span', {}, h('b', {}, '🔒 비공개'), h('small', {}, '링크를 받은 사람만 들어와요'))),
                ),
              ]
            : []),
          err,
          submit,
          h(
            'button',
            {
              type: 'button',
              class: 'ghost wide',
              onclick: () => {
                this.roomsView = 'list';
                this.renderSheet();
              },
            },
            '목록으로',
          ),
        ),
      );
      window.setTimeout(() => name.focus({ preventScroll: true }), 30);
      return;
    }

    const cur = this.room;
    const counts = this.counts;
    const list = this.rooms
      .filter((r) => !this.tagFilter || r.tags.includes(this.tagFilter))
      .slice()
      .sort(
        (a, b) =>
          (counts[b.slug] ?? 0) - (counts[a.slug] ?? 0) ||
          // 지금 아무도 없으면 오늘 많이 쓴 방부터 (사람이 다시 올 만한 방)
          (this.roomsToday[b.slug]?.minutes ?? 0) - (this.roomsToday[a.slug]?.minutes ?? 0) ||
          Number(!!b.builtin) - Number(!!a.builtin) ||
          (b.createdAt ?? 0) - (a.createdAt ?? 0),
      );
    el.append(head(this.entered ? '방' : '들어갈 방 고르기', this.entered ? '다른 방을 누르면 바로 옮겨가요' : '고른 방으로 입장해요'));
    if (this.entered && cur) {
      el.append(
        h(
          'div',
          { class: 'cur-room' },
          h('div', { class: 'cr-top' }, h('b', {}, isLockedRoom(cur) ? '🔒 ' : '', cur.name), h('span', { class: 'cr-badge' }, '지금 여기')),
          h(
            'div',
            { class: 'cr-place' },
            // 방 이름이 곧 장소 이름이면(판교 새벽 카페) 칩은 빼고 이모지만
            cur.name === placeMeta(cur.place).name ? h('span', { 'aria-hidden': 'true' }, placeMeta(cur.place).emoji) : this.placeChip(cur.place),
            h('span', {}, placeMeta(cur.place).desc),
          ),
          h('button', { class: 'primary', type: 'button', onclick: () => this.h.onShare() }, '친구에게 공유'),
        ),
      );
    }
    const tagFilter = h(
      'div',
      { class: 'tag-filter', role: 'toolbar', 'aria-label': '주제로 거르기', onscroll: () => (this.tagFilterScroll = tagFilter.scrollLeft) },
      h(
        'button',
        {
          type: 'button',
          class: 'chip-sm' + (!this.tagFilter ? ' on' : ''),
          onclick: () => {
            this.tagFilter = '';
            this.renderSheet();
          },
        },
        '전체',
      ),
      ...ROOM_TAGS.map((t) =>
        h(
          'button',
          {
            type: 'button',
            class: 'chip-sm' + (this.tagFilter === t.id ? ' on' : ''),
            onclick: () => {
              this.tagFilter = this.tagFilter === t.id ? '' : t.id;
              this.renderSheet();
            },
          },
          t.label,
        ),
      ),
    );
    el.append(tagFilter);
    tagFilter.scrollLeft = this.tagFilterScroll;
    enableDragScroll(tagFilter);
    const roomRow = (r: RoomInfo) => {
      const n = counts[r.slug] ?? 0;
      const here = cur?.slug === r.slug;
      const locked = isLockedRoom(r);
      const label = roomCountLabel(r, n, here, this.entered);
      return h(
        'li',
        {},
        h(
          'button',
          {
            type: 'button',
            class: 'room-item' + (here ? ' here' : '') + (locked ? ' locked' : ''),
            onclick: () => (here ? this.closeSheet() : this.h.onPickRoom(r.slug)),
          },
          h('span', { class: 'ri-name' }, h('span', { class: 'ri-emoji', 'aria-hidden': 'true' }, placeMeta(r.place).emoji), r.name),
          h(
            'span',
            { class: 'ri-tags' },
            locked ? h('span', { class: 'tag lock' }, r.hasPassword ? '🔒 비밀번호' : '🔒 링크로만') : null,
            h('span', { class: 'tag place' }, placeMeta(r.place).name),
            ...this.tagChips(r.tags),
          ),
          h(
            'span',
            { class: 'ri-count' + (n || here ? ' on' : '') },
            label,
            (this.roomsToday[r.slug]?.minutes ?? 0) >= 1 ? h('small', { class: 'ri-today' }, `오늘 ${minutesText(this.roomsToday[r.slug].minutes)}`) : null,
          ),
        ),
      );
    };
    const groupHead = (kind: 'open' | 'locked', title: string, sub: string) =>
      h('li', { class: `room-group ${kind}`, role: 'presentation' }, h('b', {}, title), h('small', {}, sub));
    // 🔒 방이 하나라도 있으면 "열린 방"과 "🔒 방"으로 나눠서 보여줘요 (거르기 전 전체 기준)
    const split = this.rooms.some(isLockedRoom);
    const openRooms = list.filter((r) => !isLockedRoom(r));
    const lockedRooms = list.filter(isLockedRoom);
    const rows = split
      ? [
          ...(openRooms.length ? [groupHead('open', '열린 방', '누구나 바로 들어와요'), ...openRooms.map(roomRow)] : []),
          ...(lockedRooms.length ? [groupHead('locked', '🔒 비밀번호 · 비공개 방', '비밀번호를 알거나 링크를 받은 사람만 들어와요'), ...lockedRooms.map(roomRow)] : []),
        ]
      : list.map(roomRow);
    el.append(h('ul', { class: 'room-list' }, ...(rows.length ? rows : [h('li', { class: 'empty' }, '이 주제의 방이 아직 없어요. 하나 만들어볼까요?')])));
    el.append(
      h(
        'button',
        {
          type: 'button',
          class: 'row-btn new-room',
          onclick: () => {
            this.roomsView = 'create';
            this.renderSheet();
          },
        },
        h('b', {}, '+'),
        h('span', {}, '새 방 만들기'),
        h('i', {}, PRIVATE_ROOMS_ENABLED ? '공개 · 비공개' : this.lockRoomOk ? '링크 · 🔒 비밀번호' : '링크로 초대'),
      ),
    );
  }

  // ── 다른 사람 눌렀을 때 ─────────────────────────
  showPop(p: PeerState, x: number, y: number, isSelf: boolean) {
    const el = $('#pop');
    const st = statusById(p.status);
    const lang = langById(p.lang);
    el.innerHTML = '';
    const since = Date.now() - p.joinedAt;
    const sinceText = since < 60e3 ? '방금 들어왔어요' : `${elapsedText(since)}째 모각코 중`;
    const rows = [
      h('div', { class: 'pop-name' }, p.name, isSelf ? h('em', {}, ' (나)') : null),
      h('div', { class: 'pop-row' }, `${st.emoji} ${st.label}`),
      h('div', { class: 'pop-row' }, h('i', { class: 'dot', style: `background:${lang.color}` }), lang.label),
      h('div', { class: 'pop-row muted' }, `${sinceText} · ${placeMeta(this.room?.place).use.emoji} ${p.coffee}${placeMeta(this.room?.place).use.unit.replace('째', '')}`),
      isSelf
        ? null
        : h(
            'div',
            { class: 'pop-actions' },
            h(
              'button',
              {
                class: 'primary',
                onclick: () => {
                  this.h.onWave(p.id);
                  this.hidePop();
                },
              },
              '👋 손 흔들기',
            ),
            h(
              'button',
              {
                class: 'ghost',
                onclick: () => {
                  this.hidePop();
                  this.startWhisper(p.id, p.name);
                },
              },
              '💬 귓속말',
            ),
          ),
    ];
    el.append(...(rows.filter(Boolean) as Node[]));
    el.hidden = false;
    const r = el.getBoundingClientRect();
    el.style.left = `${Math.min(innerWidth - r.width - 12, Math.max(12, x - r.width / 2))}px`;
    el.style.top = `${Math.max(12, y - r.height - 18)}px`;
    window.clearTimeout(this.popTimer);
    this.popTimer = window.setTimeout(() => this.hidePop(), 6000);
  }
  private popTimer = 0;

  hidePop() {
    $('#pop').hidden = true;
  }

  // ── 토스트 / 모달 / 경보 ─────────────────────────
  /** 닉네임에 쓸 수 없는 말이 있으면 알려주고 true. 다른 사람 화면에서 ***로 가려지기 전에 입력할 때 막아요 */
  private rejectBadNick(input: HTMLInputElement): boolean {
    if (!hasBadWord(input.value)) return false;
    this.toast(`${BLOCKED_WORDS_REASON} 다른 닉네임으로 적어주세요.`, 'bad', 4200);
    input.focus();
    return true;
  }

  toast(text: string, kind: 'info' | 'good' | 'bad' = 'info', ms = 3200) {
    const el = h('div', { class: `toast ${kind}` }, text);
    this.toastBox.append(el);
    while (this.toastBox.children.length > 3) this.toastBox.firstElementChild?.remove();
    window.setTimeout(() => {
      el.classList.add('out');
      window.setTimeout(() => el.remove(), 400);
    }, ms);
  }

  confirm(title: string, body: string, yes: string, no: string): Promise<boolean> {
    return new Promise((resolve) => {
      const m = $('#modal');
      const done = (v: boolean) => {
        m.hidden = true;
        m.innerHTML = '';
        resolve(v);
      };
      m.innerHTML = '';
      m.append(
        h(
          'div',
          { class: 'modal-card', role: 'alertdialog', 'aria-label': title },
          h('h2', {}, title),
          h('p', {}, body),
          h(
            'div',
            { class: 'modal-actions' },
            h('button', { class: 'ghost', onclick: () => done(false) }, no),
            h('button', { class: 'danger-btn', onclick: () => done(true) }, yes),
          ),
        ),
      );
      m.onclick = (e) => {
        if (e.target === m) done(false);
      };
      m.hidden = false;
      (m.querySelector('.ghost') as HTMLElement)?.focus();
    });
  }

  /**
   * 비밀번호 방에 들어가기 전에 비밀번호를 물어봐요.
   * verify가 이유(글)를 돌려주면 그 자리에서 다시 입력받고, null을 돌려주면 통과예요. 취소하면 false.
   */
  askRoomPassword(roomName: string, verify: (password: string) => Promise<string | null>): Promise<boolean> {
    return new Promise((resolve) => {
      const m = $('#modal');
      const done = (v: boolean) => {
        m.hidden = true;
        m.innerHTML = '';
        m.onclick = null;
        resolve(v);
      };
      const input = h('input', { type: 'password', maxlength: 40, placeholder: '비밀번호', autocomplete: 'off', spellcheck: 'false', 'aria-label': '방 비밀번호' });
      const err = h('p', { class: 'err', hidden: true, role: 'alert' });
      const cancel = h('button', { class: 'ghost', type: 'button', onclick: () => done(false) }, '취소');
      const submit = h('button', { class: 'primary', type: 'submit' }, '들어가기');
      const form = h(
        'form',
        {
          class: 'modal-card pw-ask',
          role: 'dialog',
          'aria-label': `${roomName} 비밀번호`,
          onkeydown: (e: Event) => {
            if ((e as KeyboardEvent).key === 'Escape') done(false);
          },
          onsubmit: async (e: Event) => {
            e.preventDefault();
            const value = input.value;
            if (!value) {
              input.focus();
              return;
            }
            submit.disabled = true;
            cancel.disabled = true;
            input.readOnly = true;
            const problem = await verify(value);
            if (!problem) {
              done(true);
              return;
            }
            err.hidden = false;
            err.textContent = problem;
            submit.disabled = false;
            cancel.disabled = false;
            input.readOnly = false;
            input.select();
          },
        },
        h('h2', {}, `🔒 ${roomName}`),
        h('p', {}, '이 방은 비밀번호를 아는 사람끼리 모이는 방이에요.'),
        input,
        err,
        h('div', { class: 'modal-actions' }, cancel, submit),
      );
      m.innerHTML = '';
      m.append(form);
      m.onclick = (e) => {
        if (e.target === m) done(false);
      };
      m.hidden = false;
      window.setTimeout(() => input.focus(), MODAL_FOCUS_DELAY_MS);
    });
  }

  alarm(text: string, seconds: number) {
    const a = $('#alarm');
    $('#alarm-text').textContent = text;
    a.hidden = false;
    window.setTimeout(() => (a.hidden = true), seconds * 1000);
  }
}

/** 방 목록 오른쪽 글자: 지금 여기 / 선택됨 / 비공개 / ● 3명 / 비어 있음 */
function roomCountLabel(r: RoomInfo, n: number, here: boolean, entered: boolean): string {
  if (here) return entered ? '지금 여기' : '선택됨';
  if (!r.isPublic) return '비공개';
  return n ? `● ${n}명` : '비어 있음';
}

/** 얼마나 오래 있었는지: 방금 / 23분 / 1시간 / 1시간 23분 */
/** 이 방에 들어온 뒤 지난 시간 표시 (위쪽 인원 표시와 사람 목록이 같이 써요) */
function stayText(joinedAt: number) {
  return `⏱ ${elapsedText(Date.now() - joinedAt)}`;
}

/** 사람 목록의 오늘 누적 시간. 기준 시각으로 매초 다시 계산해요 (studyClock.ts) */
function todayText(studySince: number) {
  return `오늘 ${elapsedText(studyTodayAt(studySince, Date.now()))}째`;
}

/** 잔디 그래프에 보여줄 주 수 (대략 1년) */
const STUDY_GRAPH_WEEKS = 53;

/** KST 기준 날짜 문자열의 요일 (0=일 ~ 6=토). 시간대 영향 없이 날짜 문자열 자체로 계산해요 */
function weekdayKst(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00+09:00`).getUTCDay();
}

/** KST 기준 날짜 문자열에 날짜를 더하거나 빼요 */
function addDaysKst(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T00:00:00+09:00`);
  d.setUTCDate(d.getUTCDate() + delta);
  return kstDate(d);
}

/** KST 날짜 문자열 둘 사이의 날짜 수 (b - a) */
function daysBetweenKst(a: string, b: string): number {
  const ta = new Date(`${a}T00:00:00+09:00`).getTime();
  const tb = new Date(`${b}T00:00:00+09:00`).getTime();
  return Math.round((tb - ta) / 86400e3);
}

/** 오늘(아직 기록이 없으면 어제)부터 거슬러 올라가며 끊기지 않고 공부한 날 수 */
function currentStreak(history: Record<string, number>, today: string): number {
  let d = (history[today] ?? 0) > 0 ? today : addDaysKst(today, -1);
  let streak = 0;
  while ((history[d] ?? 0) > 0) {
    streak++;
    d = addDaysKst(d, -1);
  }
  return streak;
}

function studyLevel(ms: number): 0 | 1 | 2 | 3 | 4 {
  if (ms <= 0) return 0;
  const min = ms / 60e3;
  if (min < 30) return 1;
  if (min < 90) return 2;
  if (min < 180) return 3;
  return 4;
}

export function elapsedText(ms: number) {
  const min = Math.floor(Math.max(0, ms) / 60e3);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분`;
  const rest = min % 60;
  return rest === 0 ? `${Math.floor(min / 60)}시간` : `${Math.floor(min / 60)}시간 ${rest}분`;
}

export function ago(at: number) {
  const s = Math.max(0, (Date.now() - at) / 1000);
  if (s < 60) return '방금';
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86400)}일 전`;
}
