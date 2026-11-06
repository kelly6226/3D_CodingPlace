// 옷장 시트: 내 캐릭터를 꾸미고, 고르는 즉시 방 안의 내 아바타와 미리보기에 반영해요
import { ACTIONS, HAIR_COLORS, HOODIE_COLORS, SKIN_TONES, type ActionId } from '../config';
import {
  ACCENT_COLORS,
  BACKS,
  DEFAULT_OUTFIT,
  HAIR_STYLES,
  HATS,
  NECKS,
  PANTS_COLORS,
  SHOE_COLORS,
  randomLook,
  type Look,
  type LookOption,
} from '../look';
import { h } from './dom';

/** 옷장 안에서 돌아가는 작은 3D 미리보기 (world/lookPreview.ts가 구현) */
export interface LookPreviewHandle {
  readonly canvas: HTMLCanvasElement;
  set(look: Look): void;
  perform(id: ActionId): void;
  dispose(): void;
}

export interface WardrobeCallbacks {
  /** 고를 때마다 불러요. 저장과 방 사람들에게 알리는 건 받는 쪽이 해요 */
  onLook(look: Look): void;
  /** 미리보기를 만들어 줘요. 3D를 쓸 수 없으면 null */
  onPreview(): Promise<LookPreviewHandle | null>;
}

type TabId = 'hair' | 'hat' | 'acc' | 'color';

const TABS: { id: TabId; label: string }[] = [
  { id: 'hair', label: '머리' },
  { id: 'hat', label: '모자' },
  { id: 'acc', label: '등·목' },
  { id: 'color', label: '색' },
];

const cloneLook = (l: Look): Look => ({ ...l, outfit: { ...l.outfit } });

export class Wardrobe {
  private look!: Look;
  private tab: TabId = 'hair';
  private preview: LookPreviewHandle | null = null;
  private pane = h('div', { class: 'wd-pane' });
  private tabBar = h('div', { class: 'wd-tabs', role: 'tablist' });
  /** 시트를 닫고 다시 열 때마다 올려서, 늦게 도착한 미리보기가 닫힌 화면에 붙지 않게 해요 */
  private session = 0;

  constructor(private cb: WardrobeCallbacks) {}

  /** 시트 안에 옷장을 그림. 이미 열려 있던 미리보기가 있으면 먼저 정리해요 */
  render(el: HTMLElement, head: HTMLElement, look: Look) {
    this.close();
    const session = this.session;
    this.look = cloneLook(look);

    const stage = h('div', { class: 'wd-preview', 'aria-hidden': 'true' });
    void this.cb.onPreview().then(
      (p) => {
        if (!p) return;
        if (session !== this.session) {
          p.dispose(); // 그 사이 시트를 닫았음
          return;
        }
        p.set(cloneLook(this.look));
        this.preview = p;
        stage.append(p.canvas);
      },
      () => {
        /* 3D 미리보기를 못 만들어도 옷 고르기는 그대로 돼요 */
      },
    );

    const actions = h(
      'div',
      { class: 'wd-acts' },
      ...ACTIONS.map((a) =>
        h(
          'button',
          { type: 'button', class: 'chip col wd-act', title: a.label, 'aria-label': `${a.label} 미리보기`, onclick: () => this.preview?.perform(a.id) },
          h('span', { class: 'e big' }, a.emoji),
        ),
      ),
    );
    const side = h(
      'div',
      { class: 'wd-side' },
      h('span', { class: 'wd-title' }, '동작 미리보기'),
      actions,
      h(
        'div',
        { class: 'wd-quick' },
        h('button', { type: 'button', class: 'ghost-sm', onclick: () => this.change((l) => Object.assign(l, randomLook())) }, '🎲 랜덤'),
        h('button', { type: 'button', class: 'ghost-sm', onclick: () => this.change((l) => (l.outfit = { ...DEFAULT_OUTFIT })) }, '↺ 기본 옷'),
      ),
      h('small', { class: 'wd-hint' }, '미리보기는 끌어서 돌려 볼 수 있어요'),
    );

    el.append(head, h('div', { class: 'wd-stage' }, stage, side), this.tabBar, this.pane);
    this.paintTabs();
    this.paintPane();
  }

  /** 시트를 닫을 때 부름. 미리보기 3D를 정리해요 */
  close() {
    this.session++;
    this.preview?.dispose();
    this.preview = null;
  }

  private change(edit: (look: Look) => unknown) {
    edit(this.look);
    this.cb.onLook(cloneLook(this.look));
    this.preview?.set(cloneLook(this.look));
    this.paintPane();
  }

  private paintTabs() {
    this.tabBar.replaceChildren(
      ...TABS.map((t) =>
        h(
          'button',
          {
            type: 'button',
            role: 'tab',
            class: 'chip-sm' + (t.id === this.tab ? ' on' : ''),
            'aria-selected': String(t.id === this.tab),
            onclick: () => {
              this.tab = t.id;
              this.paintTabs();
              this.paintPane();
            },
          },
          t.label,
        ),
      ),
    );
  }

  private paintPane() {
    const { outfit: o, hair, color, skin } = this.look;
    // 고르면 this.look을 고치고 화면을 다시 그리니까, 고치는 함수는 그때의 look을 받아서 써요
    const setAccent = (c: string) => this.change((l) => (l.outfit.accent = c));
    switch (this.tab) {
      case 'hair':
        this.pane.replaceChildren(
          this.options('머리 모양', HAIR_STYLES, o.hairStyle, (id) => this.change((l) => (l.outfit.hairStyle = id))),
          this.swatches('머리색', HAIR_COLORS, hair, (c) => this.change((l) => (l.hair = c))),
        );
        break;
      case 'hat':
        this.pane.replaceChildren(
          this.options('모자·머리 장식', HATS, o.hat, (id) => this.change((l) => (l.outfit.hat = id))),
          this.swatches('포인트 색', ACCENT_COLORS, o.accent, setAccent),
        );
        break;
      case 'acc':
        this.pane.replaceChildren(
          this.options('등', BACKS, o.back, (id) => this.change((l) => (l.outfit.back = id))),
          this.options('목', NECKS, o.neck, (id) => this.change((l) => (l.outfit.neck = id))),
          this.swatches('포인트 색', ACCENT_COLORS, o.accent, setAccent),
        );
        break;
      case 'color':
        this.pane.replaceChildren(
          this.swatches('후드티', HOODIE_COLORS, color, (c) => this.change((l) => (l.color = c))),
          this.swatches('바지', PANTS_COLORS, o.pants, (c) => this.change((l) => (l.outfit.pants = c))),
          this.swatches('신발', SHOE_COLORS, o.shoes, (c) => this.change((l) => (l.outfit.shoes = c))),
          this.swatches('피부', SKIN_TONES, skin, (c) => this.change((l) => (l.skin = c))),
        );
        break;
    }
  }

  private options(title: string, list: LookOption[], current: string, pick: (id: string) => void) {
    return h(
      'section',
      {},
      h('h3', { class: 'wd-title' }, title),
      h(
        'div',
        { class: 'grid grid-4' },
        ...list.map((opt) =>
          h(
            'button',
            { type: 'button', class: 'chip col' + (opt.id === current ? ' on' : ''), onclick: () => pick(opt.id) },
            h('span', { class: 'e big' }, opt.emoji),
            opt.label,
          ),
        ),
      ),
    );
  }

  private swatches(title: string, colors: readonly string[], current: string, pick: (color: string) => void) {
    return h(
      'div',
      { class: 'wd-row' },
      h('span', { class: 'wd-label' }, title),
      h(
        'div',
        { class: 'swatches', role: 'radiogroup', 'aria-label': title },
        ...colors.map((c) =>
          h('button', {
            type: 'button',
            class: 'sw' + (c === current ? ' on' : ''),
            style: `--c:${c}`,
            role: 'radio',
            'aria-checked': String(c === current),
            'aria-label': `${title} ${c}`,
            onclick: () => pick(c),
          }),
        ),
      ),
    );
  }
}
