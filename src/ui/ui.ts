// 화면 위 UI (HUD, 하단 액션바, 시트, 토스트)
import {
  COMMIT_TYPES,
  EMOTES,
  HOODIE_COLORS,
  LANGS,
  PLACE,
  SPRINT_PRESETS,
  STATUSES,
  langById,
  statusById,
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
    else if (k === 'html') el.innerHTML = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

export type SheetKind = 'status' | 'emote' | 'sprint' | 'commit' | 'grass' | 'people' | 'profile';

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

  constructor(private root: HTMLElement) {
    root.append(
      // 왼쪽 위: 장소
      h(
        'div',
        { class: 'hud hud-place' },
        h('div', { class: 'place-name' }, PLACE.name, h('span', { class: 'room', id: 'room' }, '1호점')),
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
        this.action('sprint', '🎯', '스프린트'),
        this.action('status', '💻', '상태', 'status-icon'),
        this.action('emote', '👍', '이모트'),
        h('button', { class: 'act', id: 'act-coffee', onclick: () => this.h.onCoffee() }, h('span', { class: 'ai' }, '☕'), h('span', { class: 'al' }, '커피')),
        this.action('commit', '⎇', '커밋'),
        this.action('grass', '🌱', '잔디'),
      ),
      h('div', { class: 'hint', id: 'hint' }, '바닥을 눌러 걷고, 빈 의자를 눌러 앉아요 · 드래그로 둘러보기'),
      h('section', { class: 'sheet', id: 'sheet', hidden: true, role: 'dialog' }),
      h('div', { class: 'pop', id: 'pop', hidden: true }),
      h('div', { class: 'alarm', id: 'alarm', hidden: true }, h('div', { class: 'alarm-banner', id: 'alarm-text' }, '')),
      h('div', { class: 'modal', id: 'modal', hidden: true }),
      (this.toastBox = h('div', { class: 'toasts', id: 'toasts', 'aria-live': 'polite' })),
    );

    document.addEventListener('pointerdown', (e) => {
      const t = e.target as HTMLElement;
      if (!this.sheet) return;
      if (t.closest('#sheet') || t.closest('.actions') || t.closest('.hud') || t.closest('.sprint-pill') || t.closest('.modal')) return;
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
    const btn = h('button', { class: 'enter', id: 'enter', disabled: true }, '카페 문 여는 중…');
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
          this.h.onEnter(p);
        },
      },
      h('div', { class: 'intro-kicker' }, `${PLACE.name} · 24시간 영업`),
      h('h1', {}, '온라인 모각코'),
      h('p', { class: 'intro-lead' }, '모여서 각자 코딩해요. 빈자리에 앉아 할 일을 하면 돼요.', h('br'), '말은 안 해도 괜찮아요.'),
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
      h('p', { class: 'intro-foot' }, '창 하나 켜두면 같이 있는 거예요. 빗소리가 나와요.'),
    );
    this.root.append(h('div', { class: 'intro', id: 'intro' }, form));
    this.introBtn = btn;
    this.introBar = bar;
    this.returning = returning;
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
    $('#room').textContent = `${instance}호점`;
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
            stat(`${getCoffeeToday()}잔`, '오늘 커피'),
          ),
          h('div', { class: 'grass', style: `--w:${weeks}` }, ...cells),
          h('p', { class: 'note' }, `최근 ${weeks}주 동안 스프린트 ${total}개 · ${Math.round(totalMin / 6) / 10}시간 집중`),
        );
        break;
      }
      case 'people': {
        const list = [this.self, ...this.peers].filter(Boolean);
        el.append(
          head(`지금 ${list.length}명 모각코 중`, PLACE.name),
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
      h('div', { class: 'pop-row muted' }, `${sinceText} · ☕ ${p.coffee}잔`),
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
