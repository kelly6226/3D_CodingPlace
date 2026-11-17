// 🎮 탕비실 오락기 화면: 게임 목록, 한 판, 이번 주 순위.
// 방 안에서 여는 창(arcade.ts)과 게임만 따로 연 페이지(games/main.ts)가 같이 써요.
// 내 최고 기록은 이 브라우저에, 게임별 이번 주 스코어 판은 서버(schema.sql 9번)에 남아요.
import { sound } from '../audio';
import { clockText, sessionAt } from '../together/session';
import { h } from '../ui/dom';
import { GAMES, type GameDef, type GameId } from './catalog';
import { bestScore, recordScore, scoreKey, type RecordOutcome } from './records';
import { RoundView } from './round';
import { ScoreApi, ScoreError, type Board, type Leader, type Player, type SubmitResult } from './scoreApi';
import { spriteIcon } from './sprites';

const SESSION_LINE_REFRESH_MS = 1000;
const LIST_ICON_PX = 44;
const HEAD_ICON_PX = 22;
/** 목록을 다시 열 때 이 시간 안이면 이번 주 1위를 다시 묻지 않아요 */
const LEADERS_FRESH_MS = 30_000;

/** 지금 보이는 화면 */
export type ArcadeScreen = { kind: 'list' } | { kind: 'play' | 'board'; game: GameId };

export interface ArcadeViewOptions {
  /** 스코어 판에 올릴 지금의 내 이름표 (닉네임·후드티 색) */
  player(): Player;
  /** 실시간 서버. 데모 모드면 null이라 스코어 판 없이 내 기록만 보여요 */
  scoreServer: { url: string; key: string } | null;
  /** 제목 오른쪽 버튼들 (방에서는 따로 열기·닫기, 따로 연 페이지에서는 모각코로 가기) */
  headActions: readonly HTMLElement[];
  /** 목록 맨 위에 둘 것 (따로 연 페이지의 닉네임 칸). 목록을 그릴 때마다 불러요 */
  listTop?: () => Node | null;
  /** 내 최고 기록을 깼을 때 */
  onNewRecord?(game: GameId, score: number): void;
  /** 화면이 바뀔 때 (따로 연 페이지는 주소와 탭 제목을 맞춰요) */
  onScreen?(screen: ArcadeScreen): void;
}

function sessionLine(now: number): string {
  const s = sessionAt(now);
  const left = clockText(s.endsAt - now);
  if (s.phase === 'break') return `쉬는 시간 · ${left} 남았어요`;
  return `집중 시간 · ${left} 남았어요. 한 판만 하고 돌아가요`;
}

function recordLine(def: GameDef, outcome: RecordOutcome): string {
  switch (outcome.kind) {
    case 'first':
      return '첫 기록이에요';
    case 'new':
      return `내 최고 기록 경신! (전에는 ${def.formatScore(outcome.prev)})`;
    case 'kept':
      return `내 최고 기록 ${def.formatScore(outcome.best)}`;
  }
}

/** 순위를 올린 뒤 한 줄: 1위면 축하, 아니면 1위가 누구인지 */
function rankLine(def: GameDef, mine: SubmitResult): string {
  if (mine.rank === 1) return '🏆 이번 주 전체 1위예요!';
  const top = mine.top ? `\n1위 ${mine.top.name} · ${def.formatScore(mine.top.score)}` : '';
  return `🏆 이번 주 전체 ${mine.rank}위${top}`;
}

function leaderLine(def: GameDef, leader: Leader | undefined): string {
  return leader ? `👑 이번 주 1위 ${leader.name} · ${def.formatScore(leader.score)}` : '👑 이번 주 1위 자리가 비어 있어요';
}

function submitFailureLine(e: unknown): string {
  const reason = e instanceof ScoreError ? e.reason : 'server';
  switch (reason) {
    case 'bad_name':
      return '닉네임에 쓸 수 없는 말이 있어서 스코어 판에는 못 올렸어요';
    case 'busy':
      return '너무 빨리 다시 올려서 이번 판은 스코어 판에 못 올렸어요';
    case 'offline':
      return '인터넷이 끊겨서 스코어 판에 못 올렸어요';
    case 'server':
      return '스코어 판에 올리지 못했어요';
  }
}

export class ArcadeView {
  /** 오락기 카드 전체. 붙일 곳은 부르는 쪽이 정해요 */
  readonly card: HTMLElement;
  private body: HTMLElement;
  private sessionText: HTMLElement;
  private current: ArcadeScreen = { kind: 'list' };
  private round: RoundView | null = null;
  private sessionTimer: number;
  private scores: ScoreApi | null;
  /** 화면을 바꿀 때마다 늘려요. 늦게 도착한 응답이 이미 떠난 화면을 그리지 않게 */
  private viewId = 0;
  /** 방금 올린 점수. 끝나기 전에 순위를 열면 기다렸다가 읽어요 */
  private pendingSubmit: Promise<unknown> = Promise.resolve();
  /** 게임마다 이번 주 1위와 받아 온 시각 */
  private leaders: { at: number; byGame: Partial<Record<GameId, Leader>> } | null = null;

  constructor(private opts: ArcadeViewOptions) {
    this.scores = opts.scoreServer ? new ScoreApi(opts.scoreServer.url, opts.scoreServer.key) : null;
    this.sessionText = h('p', { class: 'arcade-session' }, sessionLine(Date.now()));
    this.body = h('div', { class: 'arcade-body' });
    this.card = h(
      'div',
      { class: 'arcade-card' },
      h(
        'header',
        { class: 'arcade-head' },
        h('div', {}, h('h2', { id: 'arcade-title' }, '🎮 탕비실 오락기'), this.sessionText),
        h('div', { class: 'arcade-head-actions' }, ...opts.headActions),
      ),
      this.body,
    );
    this.sessionTimer = window.setInterval(() => (this.sessionText.textContent = sessionLine(Date.now())), SESSION_LINE_REFRESH_MS);
  }

  get screen(): ArcadeScreen {
    return this.current;
  }

  /** 키 하나를 하던 판에 넘겨요. 게임이 받았으면 true */
  keyToRound(key: string): boolean {
    return this.round?.key(key) ?? false;
  }

  /** 하던 판과 시계를 멈춰요. 카드를 떼는 건 부르는 쪽이 해요 */
  destroy() {
    this.stopRound();
    this.viewId++;
    window.clearInterval(this.sessionTimer);
  }

  showList() {
    const view = this.nextView({ kind: 'list' });
    const top = this.opts.listTop?.();
    this.body.replaceChildren(
      ...(top ? [top] : []),
      h(
        'ul',
        { class: 'arcade-list' },
        ...GAMES.map((def) => {
          const best = bestScore(def.id);
          return h(
            'li',
            { class: 'arcade-item' },
            h(
              'button',
              { type: 'button', class: 'arcade-game', 'aria-label': `${def.title} 시작`, 'aria-describedby': `ag-how-${def.id} ag-best-${def.id}${this.scores ? ` ag-leader-${def.id}` : ''}`, onclick: () => void this.play(def) },
              h('span', { class: 'ag-icon' }, spriteIcon(def.icon, LIST_ICON_PX)),
              h(
                'span',
                { class: 'ag-text' },
                h('b', {}, def.title),
                h('span', { class: 'ag-how', id: `ag-how-${def.id}` }, def.tagline),
                h('span', { class: 'ag-best', id: `ag-best-${def.id}` }, best === null ? '아직 기록 없음' : `내 최고 기록 ${def.formatScore(best)}`),
                this.scores && h('span', { class: 'ag-leader', id: `ag-leader-${def.id}` }, ''),
              ),
            ),
            this.scores && h('button', { type: 'button', class: 'arcade-rank-btn', 'aria-label': `${def.title} 이번 주 순위`, onclick: () => void this.showBoard(def) }, '🏆'),
          );
        }),
      ),
      h(
        'p',
        { class: 'arcade-foot' },
        ...(this.scores
          ? ['🏆 점수를 내면 닉네임과 점수가 이번 주 스코어 판에 올라가요. 한 사람(브라우저)당 이번 주 최고 점수 하나만 올라가요.', h('br'), '스코어 판은 매주 월요일 0시(KST)에 새로 시작하고, 내 최고 기록은 이 브라우저에만 남아요.']
          : ['기록은 이 브라우저에만 남아요.']),
      ),
    );
    (this.body.querySelector('.arcade-game') as HTMLElement | null)?.focus();
    void this.showLeaders(view);
  }

  async play(def: GameDef) {
    const view = this.nextView({ kind: 'play', game: def.id });
    this.body.replaceChildren(h('p', { class: 'arcade-loading' }, '불러오는 중…'));
    let game: Awaited<ReturnType<GameDef['load']>>;
    try {
      game = await def.load();
    } catch {
      if (view !== this.viewId) return;
      this.body.replaceChildren(h('p', { class: 'arcade-loading' }, '게임을 불러오지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.'), this.backButton());
      return;
    }
    if (view !== this.viewId) return;

    const result = h('div', { class: 'arcade-result', hidden: true, 'aria-live': 'polite' });
    const round = game.create({ playerColor: this.opts.player().color });
    this.round = new RoundView(round, game.intro, (score) => this.finishRound(def, score, result));
    this.body.replaceChildren(this.screenHead(def, def.title), h('div', { class: 'arcade-stage' }, this.round.canvas, result));
    this.round.canvas.focus();
  }

  async showBoard(def: GameDef) {
    if (!this.scores) return;
    const view = this.nextView({ kind: 'board', game: def.id });
    const again = h('button', { type: 'button', class: 'primary wide', onclick: () => void this.play(def) }, '한 판 하기');
    const list = h('div', { class: 'arcade-board', 'aria-live': 'polite' }, h('p', { class: 'arcade-loading' }, '불러오는 중…'));
    this.body.replaceChildren(
      this.screenHead(def, `${def.title} 순위`),
      h('p', { class: 'arcade-board-sub' }, '이번 주 TOP 10 · 매주 월요일 0시(KST)에 새로 시작해요'),
      list,
      again,
    );
    let board: Board;
    try {
      await this.pendingSubmit;
      board = await this.scores.board(def.id, scoreKey());
    } catch {
      if (view === this.viewId) list.replaceChildren(h('p', { class: 'arcade-loading' }, '순위를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.'));
      return;
    }
    if (view !== this.viewId) return;
    list.replaceChildren(renderBoard(def, board));
  }

  private stopRound() {
    this.round?.destroy();
    this.round = null;
  }

  /** 다른 화면으로 바꿀 준비: 하던 판을 멈추고 새 화면 번호를 받아요 */
  private nextView(screen: ArcadeScreen): number {
    this.current = screen;
    this.stopRound();
    this.opts.onScreen?.(screen);
    return ++this.viewId;
  }

  private backButton() {
    return h('button', { type: 'button', class: 'ghost arcade-back', onclick: () => this.showList() }, '← 목록');
  }

  /** 게임 화면·순위 화면 위쪽: 목록으로 버튼 + 게임 그림 + 제목 */
  private screenHead(def: GameDef, title: string) {
    return h('div', { class: 'arcade-play-head' }, this.backButton(), spriteIcon(def.icon, HEAD_ICON_PX), h('b', {}, title));
  }

  /** 목록 카드마다 이번 주 1위를 채워요 (못 받아 오면 그 줄은 비워 둬요) */
  private async showLeaders(view: number) {
    if (!this.scores) return;
    let leaders = this.leaders;
    if (!leaders || Date.now() - leaders.at > LEADERS_FRESH_MS) {
      try {
        leaders = { at: Date.now(), byGame: await this.scores.leaders() };
      } catch {
        return;
      }
      this.leaders = leaders;
    }
    if (view !== this.viewId) return;
    for (const def of GAMES) {
      const line = document.getElementById(`ag-leader-${def.id}`);
      if (line) line.textContent = leaderLine(def, leaders.byGame[def.id]);
    }
  }

  /** 한 판이 끝나면: 내 기록에 남기고, 결과를 보여주고, 스코어 판에 올려요 */
  private finishRound(def: GameDef, score: number, panel: HTMLElement) {
    const outcome = recordScore(def.id, score);
    if (outcome.kind === 'new') {
      sound.chime();
      this.opts.onNewRecord?.(def.id, score);
    }
    const boardLine = h('p', { class: 'ar-board' }, '');
    const again = h('button', { type: 'button', class: 'primary', onclick: () => void this.play(def) }, '다시 하기');
    panel.replaceChildren(
      h('p', { class: 'ar-title' }, '끝!'),
      h('p', { class: 'ar-score' }, def.formatScore(score)),
      h('p', { class: `ar-record${outcome.kind === 'new' ? ' new' : ''}` }, recordLine(def, outcome)),
      boardLine,
      h(
        'div',
        { class: 'modal-actions' },
        h('button', { type: 'button', class: 'ghost', onclick: () => this.showList() }, '다른 게임'),
        this.scores && h('button', { type: 'button', class: 'ghost', onclick: () => void this.showBoard(def) }, '🏆 순위'),
        again,
      ),
    );
    panel.classList.toggle('celebrate', outcome.kind === 'new');
    panel.hidden = false;
    again.focus();
    if (this.scores && score > 0) this.submitAndShowRank(def, score, boardLine);
  }

  private submitAndShowRank(def: GameDef, score: number, line: HTMLElement) {
    if (!this.scores) return;
    line.textContent = '스코어 판에 올리는 중…';
    this.pendingSubmit = this.scores.submit(def.id, scoreKey(), this.opts.player(), score).then(
      (mine) => {
        line.textContent = rankLine(def, mine);
        this.leaders = null; // 1위가 바뀌었을 수 있어서 목록에서 다시 받아요
      },
      (e: unknown) => (line.textContent = submitFailureLine(e)),
    );
  }
}

function renderBoard(def: GameDef, board: Board): HTMLElement {
  if (board.top.length === 0) return h('p', { class: 'arcade-loading' }, '이번 주 첫 기록의 주인공이 되어 보세요');
  const meInTop = board.top.some((row) => row.mine);
  return h(
    'div',
    {},
    h(
      'ol',
      { class: 'board-list' },
      ...board.top.map((row) =>
        h(
          'li',
          { class: row.mine ? 'mine' : undefined },
          h('span', { class: 'bd-rank' }, String(row.rank)),
          h('i', { class: 'bd-dot', style: `background:${row.color}`, 'aria-hidden': 'true' }),
          h('span', { class: 'bd-name' }, row.mine ? `${row.name} (나)` : row.name),
          h('span', { class: 'bd-score' }, def.formatScore(row.score)),
        ),
      ),
    ),
    board.me && !meInTop && h('p', { class: 'board-me' }, `나는 ${board.me.rank}위 · ${def.formatScore(board.me.score)}`),
  );
}
