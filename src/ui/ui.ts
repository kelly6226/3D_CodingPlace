// 화면 위 UI (HUD, 하단 액션바, 시트, 토스트)
import {
  ACTIONS,
  CHAT_MAX_LENGTH,
  COMMIT_TYPES,
  EMOTES,
  FEEDBACK_URL,
  LANGS,
  PLACES,
  PRIVATE_ROOMS_ENABLED,
  ROOM_TAGS,
  SITE,
  STATUSES,
  langById,
  placeMeta,
  statusById,
  tagLabel,
  type ActionId,
  type PlaceId,
  type RoomInfo,
  type ViewCommand,
  type ViewState,
} from '../config';
import type { Look } from '../look';
import type { AuthUser, Commit, PeerState } from '../net/types';
import { hasOpenedWardrobe, markWardrobeOpened } from '../store';
import { $, h } from './dom';
import { enableDragScroll } from './dragScroll';
import { Wardrobe, type LookPreviewHandle } from './wardrobe';
import {
  type Profile,
} from '../store';

/** 채팅 목록에 쌓아두는 줄 수. 넘으면 오래된 것부터 지워요 (저장은 안 해요) */
const CHAT_LOG_MAX = 30;
/** 패널이 나타난 직후에 입력 칸에 포커스를 주기까지 기다리는 시간 */
const CHAT_FOCUS_DELAY_MS = 30;

export interface ChatLine {
  name: string;
  lang: string;
  text: string;
  mine: boolean;
}

export type SheetKind = 'rooms' | 'status' | 'emote' | 'commit' | 'people' | 'profile' | 'wardrobe';

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
  /** 방 사람들에게 한마디. 보낼 수 없으면 이유를 돌려줌 */
  onChat(text: string): string | null;
  /** 내 채팅 글을 방명록(커밋)에 남기기. 실패하면 이유를 돌려줌 */
  onChatPin(text: string): Promise<string | null>;
  onSound(on: boolean): void;
  onShare(): void;
  /** 시점 버튼: 내 캐릭터 따라 보기 / 방 전체 보기 */
  onView(cmd: ViewCommand): void;
  onProfileSave(p: Profile): void;
  onWave(id: string): void;
  onFocusPeer(id: string): void;
  /** 방 고르기: 입장 전이면 선택만, 입장 후면 그 방으로 이동 */
  onPickRoom(slug: string): void;
  /** 새 방 만들기. 실패하면 이유를 돌려줌 */
  onCreateRoom(name: string, tags: string[], isPublic: boolean, place: PlaceId): Promise<string | null>;
  /** GitHub 로그인 (선택) */
  onSignIn(): void;
  onSignOut(): void;
}

export class UI {
  private h!: UIHandlers;
  private sheet = '' as SheetKind | '';
  private commits: Commit[] = [];
  private peers: PeerState[] = [];
  private self!: PeerState;
  private toastBox: HTMLElement;
  private soundOn = true;
  private rooms: RoomInfo[] = [];
  private counts: Record<string, number> = {};
  private room: RoomInfo | null = null;
  private invited = false;
  private entered = false;
  private tagFilter = '';
  /** 칩을 눌러 목록을 다시 그려도 넘겨 둔 칩 줄 위치가 처음으로 돌아가지 않게 */
  private tagFilterScroll = 0;
  private roomsView: 'list' | 'create' = 'list';
  private account: AuthUser | null = null;
  private canLogin = false;
  private chatBtn: HTMLButtonElement;
  private chatPanel!: HTMLElement;
  private chatLog!: HTMLOListElement;
  private chatInput!: HTMLInputElement;
  private chatErr!: HTMLElement;
  private wardrobe = new Wardrobe({ onLook: (look) => this.h.onLook(look), onPreview: (look) => this.h.onLookPreview(look) });
  /** 입장 화면 안의 옷장. 방 안 옷장(위)과 따로 둬서, 입장 화면에서 방 목록을 열어도 미리보기가 안 닫혀요 */
  private introWardrobe: Wardrobe | null = null;
  /** 시점이 처음에서 벗어났거나 내 캐릭터를 따라가는 중이면 true (시점 버튼이 어느 쪽으로 가는지) */
  private viewAway = false;

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
          ),
        ),
        h('div', { class: 'mode-pill', id: 'mode', hidden: true }, ''),
      ),
      // 오른쪽 위: 설정
      h(
        'div',
        { class: 'hud hud-tools' },
        h('button', { class: 'icon-btn', id: 'sound-btn', onclick: () => this.toggleSound(), 'aria-label': '소리 켜고 끄기' }, '🔊'),
        h('button', { class: 'icon-btn', onclick: () => this.h.onShare(), 'aria-label': '친구에게 공유' }, '🔗'),
        h('button', { class: 'icon-btn', onclick: () => this.toggleSheet('profile'), 'aria-label': '내 프로필' }, '⚙️'),
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

    // 꾸미기 버튼은 한 번도 안 열어본 사람에게만 반짝여요
    if (!hasOpenedWardrobe()) $('#act-wardrobe').classList.add('fresh');

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
        onsubmit: (e: Event) => {
          e.preventDefault();
          if (btn.disabled) return;
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
      h('div', { class: 'intro-account', id: 'intro-account', hidden: true }),
      h('div', { class: 'progress' }, bar),
      btn,
      h(
        'p',
        { class: 'intro-foot' },
        '창 하나 켜두면 같이 있는 거예요. 장소마다 배경 소리가 달라요. · ',
        h('a', { href: FEEDBACK_URL }, '피드백 보내기'),
        ' · ',
        h('a', { href: '/privacy.html', target: '_blank', rel: 'noopener' }, '개인정보 처리방침'),
      ),
    );
    this.root.append(h('div', { class: 'intro', id: 'intro' }, form));
    this.introBtn = btn;
    this.introBar = bar;
    this.returning = returning;
    this.renderIntroRoom();
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
          h('b', {}, r.isPublic ? '' : '🔒 ', r.name),
          h(
            'span',
            { class: 'ir-meta' },
            r.name === placeMeta(r.place).name ? null : this.placeChip(r.place),
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
    );
  }

  // ── GitHub 로그인 (선택) ────────────────────────
  setAccount(u: AuthUser | null, canLogin: boolean) {
    this.account = u;
    this.canLogin = canLogin;
    const el = document.getElementById('intro-account');
    if (el) {
      el.hidden = !canLogin;
      el.replaceChildren(...(canLogin ? [this.accountRow()] : []));
    }
    if (this.sheet === 'profile') this.renderSheet();
  }

  /** 아직 저장한 프로필이 없으면 입장 화면 닉네임을 GitHub 아이디로 채워줌 */
  suggestNick(name: string) {
    const nick = document.getElementById('nick') as HTMLInputElement | null;
    if (nick && !this.returning) nick.value = name.slice(0, 12);
  }

  private accountRow(): HTMLElement {
    const u = this.account;
    if (!u) {
      return h(
        'div',
        { class: 'account' },
        h('button', { type: 'button', class: 'gh-btn', onclick: () => this.h.onSignIn() }, 'GitHub로 로그인'),
        h('small', {}, '선택이에요 · 만 14세 이상만'),
      );
    }
    return h(
      'div',
      { class: 'account in' },
      u.avatar ? h('img', { class: 'gh-avatar', src: u.avatar + (u.avatar.includes('?') ? '&' : '?') + 's=64', alt: '', width: 28, height: 28, referrerpolicy: 'no-referrer' }) : null,
      h('span', { class: 'gh-login' }, '@' + u.login),
      h('button', { type: 'button', class: 'ghost-sm', onclick: () => this.h.onSignOut() }, '로그아웃'),
    );
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

  /** invited를 안 넘기면 초대 표시는 그대로 둠 */
  setCurrentRoom(r: RoomInfo, invited?: boolean) {
    this.room = r;
    if (invited !== undefined) this.invited = invited;
    $('#room-name').textContent = r.name;
    $('#room-lock').hidden = r.isPublic;
    const kicker = document.getElementById('intro-kicker');
    if (kicker) kicker.textContent = placeMeta(r.place).tagline;
    this.paintUse();
    if (!r.isPublic && !this.rooms.some((x) => x.slug === r.slug)) this.rooms = [r, ...this.rooms];
    this.renderIntroRoom();
    if ((this.sheet === 'rooms' && this.roomsView === 'list') || this.sheet === 'people') this.renderSheet();
  }
  private introBtn: HTMLButtonElement | null = null;
  private introBar: HTMLElement | null = null;
  private returning = false;

  setProgress(p: number) {
    if (this.introBar) this.introBar.style.width = `${Math.round(p * 100)}%`;
  }

  ready() {
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
    const b = $('#sound-btn');
    b.textContent = on ? '🔊' : '🔈';
    b.setAttribute('aria-pressed', String(on));
  }

  private toggleSound() {
    this.setSound(!this.soundOn);
    this.h.onSound(this.soundOn);
  }

  // ── 커밋 ───────────────────────────────────────
  setCommits(list: Commit[]) {
    this.commits = list;
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
      h('button', { class: 'primary', type: 'submit' }, '보내기'),
    );
    this.chatPanel = h(
      'section',
      { class: 'chat', id: 'chat', hidden: true, 'aria-label': '채팅' },
      h(
        'header',
        { class: 'chat-head' },
        h('p', {}, '말풍선으로 잠깐 보여요 · 남기고 싶은 말은 📌'),
        h('button', { class: 'x', type: 'button', onclick: () => this.closeChat(), 'aria-label': '채팅 닫기' }, '✕'),
      ),
      this.chatLog,
      this.chatErr,
      form,
    );
    return this.chatPanel;
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
  }

  /** 입력 칸·버튼·대화상자에 포커스가 없을 때만 Enter로 채팅을 열어요 */
  private canOpenChatWithEnter(e: KeyboardEvent) {
    if (!this.entered || !$('#modal').hidden) return false;
    return !(e.target as HTMLElement).closest('input, textarea, select, button, [contenteditable]');
  }

  private sendChat() {
    const text = this.chatInput.value.trim();
    if (!text) return;
    const problem = this.h.onChat(text);
    this.chatErr.hidden = !problem;
    this.chatErr.textContent = problem ?? '';
    if (!problem) this.chatInput.value = '';
    this.chatInput.focus({ preventScroll: true });
  }

  /** 대화 한 줄 추가. 내 글에만 방명록에 남기는 📌 버튼이 붙어요 (방명록에는 내 닉네임으로 남으니까) */
  addChat(line: ChatLine) {
    const pin = line.mine
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
    this.chatLog.append(
      h('li', { class: line.mine ? 'mine' : undefined }, h('span', { class: 'who', style: `--c:${langById(line.lang).color}` }, line.name), h('span', { class: 'msg' }, line.text), pin),
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
    this.sheet = kind;
    // 옷장을 한 번 열어보면 반짝임은 멈춰요
    if (kind === 'wardrobe') {
      markWardrobeOpened();
      $('#act-wardrobe').classList.remove('fresh');
    }
    document.querySelectorAll('.act').forEach((b) => b.classList.remove('active'));
    $(`#act-${kind}`)?.classList.add('active');
    this.renderSheet();
    $('#sheet').hidden = false;
  }

  closeSheet() {
    this.sheet = '';
    this.wardrobe.close();
    $('#sheet').hidden = true;
    document.querySelectorAll('.act').forEach((b) => b.classList.remove('active'));
  }

  private renderSheet() {
    const el = $('#sheet');
    // 다른 시트로 바뀌면 옷장의 3D 미리보기를 정리해요
    if (this.sheet !== 'wardrobe') this.wardrobe.close();
    el.innerHTML = '';
    // 다시 그릴 때마다 클래스를 새로 정하니, 모양을 정하는 클래스는 모두 여기서 붙여요
    // 방 고르기와 커밋 방명록은 화면 가운데에 크게 (style.css .sheet.center, 방명록은 .wide로 더 넓게)
    const centered = this.sheet === 'rooms' || this.sheet === 'commit';
    el.className = `sheet sheet-${this.sheet}` + (centered ? ' center' : '') + (this.sheet === 'commit' ? ' wide' : '');
    const head = (title: string, sub?: string) =>
      h('header', {}, h('h2', {}, title), sub ? h('p', {}, sub) : null, h('button', { class: 'x', onclick: () => this.closeSheet(), 'aria-label': '닫기' }, '✕'));

    switch (this.sheet) {
      case 'rooms': {
        this.renderRooms(el, head);
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
        const err = h('p', { class: 'err', hidden: true });
        const submit = h('button', { class: 'primary', type: 'submit' }, 'commit');
        const form = h(
          'form',
          {
            class: 'commit-form',
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
            ...this.commits.slice(0, 30).map((c) =>
              h(
                'li',
                {},
                h('code', { class: 'hash' }, c.hash),
                h('span', { class: 'msg' }, c.msg),
                h('span', { class: 'who', style: `--c:${langById(c.lang).color}` }, c.name),
                h('time', {}, ago(c.at)),
              ),
            ),
          ),
        );
        window.setTimeout(() => msg.focus({ preventScroll: true }), 30);
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
                  h('span', { class: 'n' }, p.name, p.id === this.self.id ? h('em', {}, ' (나)') : null),
                  h('span', { class: 's' }, st.label, ' · ', h('span', { class: 'since', 'data-joined': p.joinedAt }, stayText(p.joinedAt))),
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
        const acct = this.account;
        const accountBox = this.canLogin
            ? h(
                'div',
                { class: 'account-box' },
                h('span', { class: 'lbl' }, 'GitHub 계정'),
                this.accountRow(),
                acct
                  ? h(
                      'div',
                      { class: 'account-more' },
                      h(
                        'button',
                        {
                          type: 'button',
                          class: 'ghost-sm',
                          onclick: () => {
                            nick.value = acct.login.slice(0, 12);
                            nick.focus();
                          },
                        },
                        `닉네임을 ${acct.login.slice(0, 12)}로`,
                      ),
                      h(
                        'a',
                        {
                          class: 'danger-link',
                          href: `mailto:${SITE.contact}?subject=${encodeURIComponent('[온라인 모각코] 계정 삭제 요청')}&body=${encodeURIComponent(`GitHub 아이디: @${acct.login}\n계정 번호: ${acct.id}\n\n위 계정과 로그인 정보의 삭제를 요청합니다.`)}`,
                        },
                        '계정 삭제 요청',
                      ),
                    )
                  : null,
                h('small', { class: 'account-note' }, acct ? '로그인 정보는 Supabase에 저장돼요. 지우고 싶으면 메일로 요청해 주세요. 10일 안에 지우고 알려드려요.' : '로그인은 선택이에요. 안 해도 지금처럼 쓸 수 있어요.', ' · ', h('a', { href: '/privacy.html', target: '_blank', rel: 'noopener' }, '개인정보 처리방침')),
              )
            : null;
        el.append(
          head('내 프로필', '후드티·머리·모자는 👕 옷장에서 바꿔요'),
          ...(accountBox ? [accountBox] : []),
          h(
            'form',
            {
              class: 'intro-form',
              onsubmit: (e: Event) => {
                e.preventDefault();
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
            'small',
            { class: 'sheet-note' },
            '프로필은 이 브라우저에만 저장돼요. 다른 기기나 시크릿 창에서는 처음부터 시작해요. · ',
            h('a', { href: FEEDBACK_URL }, '피드백 보내기'),
          ),
        );
        break;
      }
    }
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
      const pub = h('input', { type: 'radio', name: 'vis', id: 'vis-pub', value: 'pub', checked: true });
      const priv = h('input', { type: 'radio', name: 'vis', id: 'vis-priv', value: 'priv' });
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
              const problem = await this.h.onCreateRoom(n, [...picked], pub.checked, place);
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
          h('span', { class: 'lbl' }, '주제 (3개까지)'),
          tagBox,
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
          Number(!!b.builtin) - Number(!!a.builtin) ||
          (b.createdAt ?? 0) - (a.createdAt ?? 0),
      );
    el.append(head(this.entered ? '방' : '들어갈 방 고르기', this.entered ? '다른 방을 누르면 바로 옮겨가요' : '고른 방으로 입장해요'));
    if (this.entered && cur) {
      el.append(
        h(
          'div',
          { class: 'cur-room' },
          h('div', { class: 'cr-top' }, h('b', {}, cur.isPublic ? '' : '🔒 ', cur.name), h('span', { class: 'cr-badge' }, '지금 여기')),
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
    el.append(
      h(
        'ul',
        { class: 'room-list' },
        ...(list.length
          ? list.map((r) => {
              const n = counts[r.slug] ?? 0;
              const here = cur?.slug === r.slug;
              const label = here ? (this.entered ? '지금 여기' : '선택됨') : !r.isPublic ? '비공개' : n ? `● ${n}명` : '비어 있음';
              return h(
                'li',
                {},
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'room-item' + (here ? ' here' : ''),
                    onclick: () => (here ? this.closeSheet() : this.h.onPickRoom(r.slug)),
                  },
                  h('span', { class: 'ri-name' }, h('span', { class: 'ri-emoji', 'aria-hidden': 'true' }, placeMeta(r.place).emoji), r.isPublic ? '' : '🔒 ', r.name),
                  h('span', { class: 'ri-tags' }, h('span', { class: 'tag place' }, placeMeta(r.place).name), ...this.tagChips(r.tags)),
                  h('span', { class: 'ri-count' + (n || here ? ' on' : '') }, label),
                ),
              );
            })
          : [h('li', { class: 'empty' }, '이 주제의 방이 아직 없어요. 하나 만들어볼까요?')]),
      ),
    );
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
        h('i', {}, PRIVATE_ROOMS_ENABLED ? '공개 · 비공개' : '링크로 초대'),
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

  alarm(text: string, seconds: number) {
    const a = $('#alarm');
    $('#alarm-text').textContent = text;
    a.hidden = false;
    window.setTimeout(() => (a.hidden = true), seconds * 1000);
  }
}

/** 얼마나 오래 있었는지: 방금 / 23분 / 1시간 / 1시간 23분 */
/** 이 방에 들어온 뒤 지난 시간 표시 (위쪽 인원 표시와 사람 목록이 같이 써요) */
function stayText(joinedAt: number) {
  return `⏱ ${elapsedText(Date.now() - joinedAt)}`;
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
