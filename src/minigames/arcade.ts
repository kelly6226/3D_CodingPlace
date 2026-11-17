// 🎮 방 안에서 여는 탕비실 오락기 창. 화면 내용은 arcadeView.ts가 그리고, 여기는 창을 열고 닫는 일만 해요.
// 창이 떠 있는 동안 3D를 멈추고 뒤 화면을 눌리지 않게 해요.
import { $, h } from '../ui/dom';
import { ArcadeView } from './arcadeView';
import { GAMES, type GameId } from './catalog';
import { gamesUrl } from './ids';
import type { Player } from './scoreApi';

/** 링크를 복사한 뒤 버튼에 ✓를 보여주는 시간 */
const COPIED_MARK_MS = 1500;

export interface ArcadeHooks {
  /** 오락기가 화면을 다 가리는 동안 3D를 멈추고, 닫으면 다시 그려요 */
  pauseWorld(): void;
  resumeWorld(): void;
  /** 스코어 판에 올릴 지금의 내 이름표 (닉네임·후드티 색) */
  player(): Player;
  /** 실시간 서버. 데모 모드면 null이라 스코어 판 없이 내 기록만 보여요 */
  scoreServer: { url: string; key: string } | null;
  /** 내 최고 기록을 깼을 때. 같은 방 사람들에게 알리는 건 main.ts 몫이에요 */
  onNewRecord(game: GameId, score: number): void;
  /** 오락기를 닫은 뒤 (게임 주소로 들어왔으면 main.ts가 주소를 방 주소로 돌려요) */
  onClosed?(): void;
}

let opened: ArcadeWindow | null = null;

/** 오락기를 열어요. game을 주면 그 게임 시작 화면부터. 이미 열려 있으면 아무것도 안 해요 */
export function openArcade(hooks: ArcadeHooks, game: GameId | null = null) {
  if (opened) return;
  opened = new ArcadeWindow(hooks, game);
}

class ArcadeWindow {
  private root: HTMLElement;
  private view: ArcadeView;
  private copyBtn: HTMLButtonElement;
  /** 오락기가 떠 있는 동안 뒤 화면을 눌리거나 읽히지 않게(inert) 해 둔 것들 */
  private inertBehind: HTMLElement[];

  constructor(
    private hooks: ArcadeHooks,
    game: GameId | null,
  ) {
    this.copyBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': '지금 보는 게임 링크 복사', title: '링크 복사', onclick: () => void this.copyLink() }, '🔗');
    this.view = new ArcadeView({
      player: hooks.player,
      scoreServer: hooks.scoreServer,
      onNewRecord: hooks.onNewRecord,
      headActions: [this.copyBtn, h('button', { type: 'button', class: 'icon-btn', 'aria-label': '오락기 닫기', onclick: () => this.close() }, '✕')],
    });
    this.root = h('div', { class: 'arcade', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'arcade-title' }, this.view.card);
    this.inertBehind = [...$('#app').children, $('#stage')].filter((el): el is HTMLElement => el instanceof HTMLElement && !el.inert);
    for (const el of this.inertBehind) el.inert = true;
    $('#app').append(this.root);
    this.hooks.pauseWorld();
    // 게임하는 동안 누른 키가 방(채팅 열기, 아바타 타자 치기)으로 새지 않게 먼저 받아요
    addEventListener('keydown', this.onKey, true);

    const first = GAMES.find((def) => def.id === game);
    if (first) void this.view.play(first);
    else this.view.showList();
  }

  private onKey = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      if (this.view.screen.kind === 'list') this.close();
      else this.view.showList();
      return;
    }
    if (this.view.keyToRound(e.key)) e.preventDefault();
  };

  /** 목록이면 /games, 게임·순위 화면이면 /games/<게임 id>를 복사해요 */
  private async copyLink() {
    const screen = this.view.screen;
    const url = gamesUrl(screen.kind === 'list' ? null : screen.game);
    let mark = '✓';
    try {
      await navigator.clipboard.writeText(url);
      this.copyBtn.setAttribute('aria-label', '링크를 복사했어요');
    } catch {
      mark = '⚠';
      this.copyBtn.setAttribute('aria-label', `링크를 복사하지 못했어요. 주소는 ${url}`);
      this.copyBtn.title = url;
    }
    this.copyBtn.textContent = mark;
    window.setTimeout(() => {
      this.copyBtn.textContent = '🔗';
      this.copyBtn.setAttribute('aria-label', '지금 보는 게임 링크 복사');
      this.copyBtn.title = '링크 복사';
    }, COPIED_MARK_MS);
  }

  private close() {
    this.view.destroy();
    removeEventListener('keydown', this.onKey, true);
    this.root.remove();
    for (const el of this.inertBehind) el.inert = false;
    this.hooks.resumeWorld();
    opened = null;
    this.hooks.onClosed?.();
    document.getElementById('arcade-btn')?.focus();
  }
}
