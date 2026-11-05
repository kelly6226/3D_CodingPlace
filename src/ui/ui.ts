// 화면 위 UI (HUD, 하단 액션바, 시트, 토스트)
import {
  COMMIT_TYPES,
  EMOTES,
  HOODIE_COLORS,
  LANGS,
  PLACES,
  ROOM_TAGS,
  SPRINT_PRESETS,
  STATUSES,
  langById,
  placeMeta,
  roomUrl,
  statusById,
  tagLabel,
  type PlaceId,
  type RoomInfo,
} from '../config';
import type { Commit, PeerState } from '../net/types';
import {
  getCoffeeToday,
  getFocusMin,
  getGrass,
  getSprintPreset,
  getStreak,
  kstDate,
  type Profile,
} from '../store';

type Attrs = Record<string, string | number | boolean | ((e: Event) => void) | undefined>;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

export type SheetKind = 'rooms' | 'status' | 'emote' | 'sprint' | 'commit' | 'grass' | 'people' | 'profile';

export interface UIHandlers {
  onEnter(p: Profile): void;
  onStatus(id: string): void;
  onEmote(id: string): void;
  onSprintStart(presetId: string): void;
  onSprintStop(): void;
  onCoffee(): void;
  onCommit(type: string, msg: string): Promise<string | null>;
  onSound(on: boolean): void;
  onShare(): void;
  onProfileSave(p: Profile): void;
  onWave(id: string): void;
  onFocusPeer(id: string): void;
  /** 방 고르기: 입장 전이면 선택만, 입장 후면 그 방으로 이동 */
  onPickRoom(slug: string): void;
  /** 새 방 만들기. 실패하면 이유를 돌려줌 */
  onCreateRoom(name: string, tags: string[], isPublic: boolean, place: PlaceId): Promise<string | null>;
}

export interface SprintView {
  phase: 'idle' | 'focus' | 'rest';
  endsAt: number;
  total: number;
}

export class UI {
  private h!: UIHandlers;
  private sheet = '' as SheetKind | '';
  private commits: Commit[] = [];
  private peers: PeerState[] = [];
  private self!: PeerState;
  private sprint: SprintView = { phase: 'idle', endsAt: 0, total: 0 };
  private toastBox: HTMLElement;
  private soundOn = true;
  private rooms: RoomInfo[] = [];
  private counts: Record<string, number> = {};
  private room: RoomInfo | null = null;
  private invited = false;
  private entered = false;
  private tagFilter = '';
  private roomsView: 'list' | 'create' = 'list';

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
          'button',
          { class: 'place-meta', id: 'people-btn', onclick: () => this.toggleSheet('people'), 'aria-label': '지금 있는 사람 보기' },
          h('span', { class: 'live', id: 'conn' }),
          h('b', { id: 'count' }, '1'),
          '명 모각코 중',
          h('span', { class: 'sep' }, '·'),
          h('span', { id: 'clock' }, ''),
        ),
        h('div', { class: 'mode-pill', id: 'mode', hidden: true }, ''),
      ),
      // 오른쪽 위: 설정
      h(
        'div',
        { class: 'hud hud-tools' },
        h('button', { class: 'icon-btn', id: 'sound-btn', onclick: () => this.toggleSound(), 'aria-label': '소리 켜고 끄기' }, '🔊'),
        h('button', { class: 'icon-btn', onclick: () => this.h.onShare(), 'aria-label': '링크 복사' }, '🔗'),
        h('button', { class: 'icon-btn', onclick: () => this.toggleSheet('profile'), 'aria-label': '내 프로필' }, '⚙️'),
      ),
      // 스프린트 타이머
      h(
        'button',
        { class: 'sprint-pill', id: 'sprint-pill', hidden: true, onclick: () => this.toggleSheet('sprint') },
        h('span', { class: 'sp-ring', id: 'sp-ring' }),
        h('span', { id: 'sp-label' }, ''),
        h('b', { id: 'sp-time' }, ''),
      ),
      // 하단 액션바
      h(
        'nav',
        { class: 'actions', id: 'actions' },
        this.action('rooms', '🚪', '방'),
        this.action('sprint', '🎯', '스프린트'),
        this.action('status', '💻', '상태', 'status-icon'),
        this.action('emote', '👍', '이모트'),
        h('button', { class: 'act', id: 'act-coffee', onclick: () => this.h.onCoffee() }, h('span', { class: 'ai', id: 'use-icon' }, '☕'), h('span', { class: 'al', id: 'use-label' }, '커피')),
        this.action('commit', '⎇', '커밋'),
        this.action('grass', '🌱', '잔디'),
      ),
      h('div', { class: 'hint', id: 'hint' }, '바닥을 눌러 걷고, 빈자리를 눌러 앉아요 · 드래그로 둘러보기'),
      h('section', { class: 'sheet', id: 'sheet', hidden: true, role: 'dialog' }),
      h('div', { class: 'pop', id: 'pop', hidden: true }),
      h('div', { class: 'alarm', id: 'alarm', hidden: true }, h('div', { class: 'alarm-banner', id: 'alarm-text' }, '')),
      h('div', { class: 'modal', id: 'modal', hidden: true }),
      (this.toastBox = h('div', { class: 'toasts', id: 'toasts', 'aria-live': 'polite' })),
    );

    document.addEventListener('pointerdown', (e) => {
      const t = e.target as HTMLElement;
      if (!this.sheet) return;
      if (t.closest('#sheet') || t.closest('.actions') || t.closest('.hud') || t.closest('.sprint-pill') || t.closest('.modal') || t.closest('.intro-room')) return;
      this.closeSheet();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeSheet();
        this.hidePop();
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
    const sw = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': '후드티 색' });
    const paintSw = () => {
      sw.innerHTML = '';
      for (const c of HOODIE_COLORS) {
        sw.append(
          h('button', {
            class: 'sw' + (c === p.color ? ' on' : ''),
            style: `--c:${c}`,
            'aria-label': `후드티 색 ${c}`,
            role: 'radio',
            'aria-checked': String(c === p.color),
            onclick: (e: Event) => {
              e.preventDefault();
              p.color = c;
              paintSw();
            },
          }),
        );
      }
    };
    paintSw();
    const glasses = h('input', { type: 'checkbox', id: 'glasses', checked: p.glasses });
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
          p.glasses = glasses.checked;
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
        h('span', { class: 'lbl' }, '후드티'),
        sw,
        h('label', { class: 'check', for: 'glasses' }, glasses, h('span', {}, '안경 쓰기')),
      ),
      h('div', { class: 'progress' }, bar),
      btn,
      h('p', { class: 'intro-foot' }, '창 하나 켜두면 같이 있는 거예요. 장소마다 배경 소리가 달라요.'),
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

  tickClock() {
    const t = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date());
    $('#clock').textContent = t;
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

  // ── 스프린트 ───────────────────────────────────
  setSprint(v: SprintView) {
    this.sprint = v;
    const pill = $('#sprint-pill');
    pill.hidden = v.phase === 'idle';
    $('#act-sprint').classList.toggle('on', v.phase !== 'idle');
    if (v.phase !== 'idle') {
      const left = Math.max(0, v.endsAt - Date.now());
      const m = Math.floor(left / 60e3);
      const s = Math.floor((left % 60e3) / 1000);
      $('#sp-label').textContent = v.phase === 'focus' ? '🎧 집중' : '☕ 휴식';
      $('#sp-time').textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      const pct = 1 - left / v.total;
      $('#sp-ring').style.setProperty('--p', String(pct));
      pill.classList.toggle('rest', v.phase === 'rest');
    }
    if (this.sheet === 'sprint') this.renderSheet();
  }

  // ── 커밋 ───────────────────────────────────────
  setCommits(list: Commit[]) {
    this.commits = list;
    if (this.sheet === 'commit') this.renderSheet();
  }

  // ── 시트 ───────────────────────────────────────
  toggleSheet(kind: SheetKind) {
    if (this.sheet === kind) this.closeSheet();
    else this.openSheet(kind);
  }

  openSheet(kind: SheetKind) {
    this.hidePop();
    if (kind === 'rooms' && this.sheet !== 'rooms') this.roomsView = 'list';
    this.sheet = kind;
    document.querySelectorAll('.act').forEach((b) => b.classList.remove('active'));
    $(`#act-${kind}`)?.classList.add('active');
    this.renderSheet();
    $('#sheet').hidden = false;
  }

  closeSheet() {
    this.sheet = '';
    $('#sheet').hidden = true;
    document.querySelectorAll('.act').forEach((b) => b.classList.remove('active'));
  }

  private renderSheet() {
    const el = $('#sheet');
    el.innerHTML = '';
    el.className = `sheet sheet-${this.sheet}`;
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
        );
        break;
      }
      case 'sprint': {
        const v = this.sprint;
        if (v.phase === 'idle') {
          const cur = getSprintPreset();
          el.append(
            head('스프린트', '집중이 끝날 때마다 잔디가 한 칸 심어져요'),
            h(
              'div',
              { class: 'stack' },
              ...SPRINT_PRESETS.map((p) =>
                h(
                  'button',
                  {
                    class: 'row-btn' + (p.id === cur ? ' on' : ''),
                    onclick: () => {
                      this.h.onSprintStart(p.id);
                      this.closeSheet();
                    },
                  },
                  h('b', {}, `${p.focus}분`),
                  h('span', {}, p.label),
                  h('i', {}, '시작 ▶'),
                ),
              ),
            ),
            h('p', { class: 'note' }, '집중하는 동안 헤드폰을 써요. 다른 사람들 화면에도 보여요.'),
          );
        } else {
          el.append(
            head(v.phase === 'focus' ? '집중하는 중' : '쉬는 중', v.phase === 'focus' ? '알림은 잠시 꺼두세요' : '스트레칭 한 번 해요'),
            h('div', { class: 'big-timer' }, $('#sp-time').textContent ?? ''),
            h(
              'button',
              {
                class: 'row-btn danger',
                onclick: () => {
                  this.h.onSprintStop();
                  this.closeSheet();
                },
              },
              h('span', {}, v.phase === 'focus' ? '스프린트 중단 (잔디 없음)' : '휴식 끝내기'),
            ),
          );
        }
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
          h('div', { class: 'term' }, h('span', { class: 'prompt' }, '$ git commit -m "'), type, h('span', { class: 'colon' }, ':'), msg, h('span', { class: 'prompt' }, '"')),
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
      case 'grass': {
        const grass = getGrass();
        const mins = getFocusMin();
        const today = kstDate();
        const weeks = 18;
        const end = new Date();
        const start = new Date(end);
        start.setDate(end.getDate() - (weeks * 7 - 1) - ((end.getDay() + 6) % 7 === 6 ? 0 : 6 - ((end.getDay() + 6) % 7)));
        const cells: HTMLElement[] = [];
        let total = 0;
        let totalMin = 0;
        for (let i = 0; i < weeks * 7; i++) {
          const d = new Date(start);
          d.setDate(start.getDate() + i);
          const key = kstDate(d);
          const n = grass[key] ?? 0;
          total += n;
          totalMin += mins[key] ?? 0;
          const lvl = n === 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : n <= 5 ? 3 : 4;
          const future = key > today;
          cells.push(h('i', { class: `g g${lvl}` + (future ? ' f' : '') + (key === today ? ' today' : ''), title: `${key} · 스프린트 ${n}개` }));
        }
        el.append(
          head('내 잔디', '이 브라우저에만 저장돼요'),
          h(
            'div',
            { class: 'stats' },
            stat(String(grass[today] ?? 0), '오늘 스프린트'),
            stat(`${Math.round((mins[today] ?? 0) / 6) / 10}h`, '오늘 집중'),
            stat(`${getStreak()}일`, '연속 기록'),
            stat(`${getCoffeeToday()}${placeMeta(this.room?.place).use.unit.replace('째', '')}`, `오늘 ${placeMeta(this.room?.place).use.label}`),
          ),
          h('div', { class: 'grass', style: `--w:${weeks}` }, ...cells),
          h('p', { class: 'note' }, `최근 ${weeks}주 동안 스프린트 ${total}개 · ${Math.round(totalMin / 6) / 10}시간 집중`),
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
              const focusing = p.focusUntil && p.focusUntil > Date.now();
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
                  h('span', { class: 's' }, focusing ? '🎧 집중 중' : st.label),
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
        const p: Profile = { id: s.id, name: s.name, color: s.color, lang: s.lang, hair: s.hair, skin: s.skin, glasses: s.glasses };
        const nick = h('input', { id: 'p-nick', maxlength: 12, value: p.name, autocomplete: 'off' });
        const lang = h('select', { id: 'p-lang' }, ...LANGS.map((l) => h('option', { value: l.id, selected: l.id === p.lang }, l.label)));
        const sw = h('div', { class: 'swatches' });
        for (const c of HOODIE_COLORS) {
          sw.append(
            h('button', {
              class: 'sw' + (c === p.color ? ' on' : ''),
              style: `--c:${c}`,
              'aria-label': `후드티 색 ${c}`,
              onclick: (e: Event) => {
                e.preventDefault();
                p.color = c;
                sw.querySelectorAll('.sw').forEach((b) => b.classList.remove('on'));
                (e.currentTarget as HTMLElement).classList.add('on');
              },
            }),
          );
        }
        const glasses = h('input', { type: 'checkbox', id: 'p-glasses', checked: p.glasses });
        el.append(
          head('내 프로필'),
          h(
            'form',
            {
              class: 'intro-form',
              onsubmit: (e: Event) => {
                e.preventDefault();
                p.name = nick.value.trim().slice(0, 12) || p.name;
                p.lang = lang.value;
                p.glasses = glasses.checked;
                this.h.onProfileSave(p);
                this.closeSheet();
              },
            },
            h('label', { for: 'p-nick' }, '닉네임'),
            nick,
            h('label', { for: 'p-lang' }, '주력 언어'),
            lang,
            h('span', { class: 'lbl' }, '후드티'),
            sw,
            h('label', { class: 'check', for: 'p-glasses' }, glasses, h('span', {}, '안경 쓰기')),
            h('button', { class: 'primary wide', type: 'submit' }, '저장'),
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
          h('span', { class: 'lbl' }, '공개 여부'),
          h(
            'div',
            { class: 'vis' },
            h('label', { for: 'vis-pub', class: 'vis-opt' }, pub, h('span', {}, h('b', {}, '공개'), h('small', {}, '방 목록에 보여요'))),
            h('label', { for: 'vis-priv', class: 'vis-opt' }, priv, h('span', {}, h('b', {}, '🔒 비공개'), h('small', {}, '링크를 받은 사람만 들어와요'))),
          ),
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
          h('div', { class: 'cr-place' }, this.placeChip(cur.place), h('span', {}, placeMeta(cur.place).desc)),
          h('code', { class: 'cr-link' }, roomUrl(cur.slug)),
          h('button', { class: 'primary', type: 'button', onclick: () => this.h.onShare() }, '링크 복사'),
        ),
      );
    }
    el.append(
      h(
        'div',
        { class: 'tag-filter', role: 'toolbar', 'aria-label': '주제로 거르기' },
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
      ),
    );
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
        h('i', {}, '공개 · 비공개'),
      ),
    );
  }

  // ── 다른 사람 눌렀을 때 ─────────────────────────
  showPop(p: PeerState, x: number, y: number, isSelf: boolean) {
    const el = $('#pop');
    const st = statusById(p.status);
    const lang = langById(p.lang);
    const focusing = p.focusUntil && p.focusUntil > Date.now();
    el.innerHTML = '';
    const since = Math.floor((Date.now() - p.joinedAt) / 60e3);
    const sinceText = since < 1 ? '방금 들어왔어요' : since < 60 ? `${since}분째 모각코 중` : `${Math.floor(since / 60)}시간째 모각코 중`;
    const rows = [
      h('div', { class: 'pop-name' }, p.name, isSelf ? h('em', {}, ' (나)') : null),
      h('div', { class: 'pop-row' }, `${st.emoji} ${st.label}`),
      focusing ? h('div', { class: 'pop-row' }, `🎧 집중 중 · ${Math.ceil((p.focusUntil! - Date.now()) / 60e3)}분 남음`) : null,
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

function stat(v: string, label: string) {
  return h('div', { class: 'stat' }, h('b', {}, v), h('span', {}, label));
}

export function ago(at: number) {
  const s = Math.max(0, (Date.now() - at) / 1000);
  if (s < 60) return '방금';
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86400)}일 전`;
}
