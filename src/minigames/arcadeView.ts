// 🎮 탕비실 오락기 화면: 게임 목록, 한 판, 이번 주 순위와 명예의 전당.
// 창을 열고 닫는 일(3D 멈추기, 뒤 화면 막기, 키 받기)은 arcade.ts가 해요.
// 내 최고 기록은 이 브라우저에, 게임별 이번 주 스코어 판은 서버(schema.sql 9번)에, 지난 주들의 1~3위는 명예의 전당(10번)에 남아요.
import { sound } from '../audio';
import { clockText, sessionAt } from '../together/session';
import { h } from '../ui/dom';
import { GAMES, type GameDef, type GameId } from './catalog';
import { bestScore, recordScore, scoreKey, type RecordOutcome } from './records';
import { RoundView } from './round';
import { ScoreApi, ScoreError, type Board, type Champion, type Hall, type HallRow, type Leader, type Player, type SubmitResult } from './scoreApi';
import { spriteIcon } from './sprites';

const SESSION_LINE_REFRESH_MS = 1000;
const LIST_ICON_PX = 44;
const HEAD_ICON_PX = 22;
/** 목록을 다시 열 때 이 시간 안이면 이번 주 1위를 다시 묻지 않아요 */
const LEADERS_FRESH_MS = 30_000;

/** 지금 보이는 화면 */
export type ArcadeScreen = { kind: 'list' } | { kind: 'play' | 'board'; game: GameId };

/** 순위 화면의 탭: 이번 주 TOP 10 / 명예의 전당 */
type BoardTab = 'week' | 'hall';

const BOARD_TABS: readonly { id: BoardTab; label: string; sub: string }[] = [
  { id: 'week', label: '🏆 이번 주', sub: '이번 주 TOP 10 · 매주 월요일 0시(KST)에 새로 시작해요' },
  // 몇 주까지 보여 주는지는 서버(schema.sql game_hall의 shown_weeks)가 정해서 여기 적지 않아요
  { id: 'hall', label: '🏛 명예의 전당', sub: '지난 주마다 1~3위가 계속 남아요 · 최근 주부터' },
];

const MEDALS = ['🥇', '🥈', '🥉'];
/** 이만큼 이어지거나 쌓여야 이름 옆에 붙여요 (1번은 우승 자체라 따로 안 적어요) */
const BADGE_MIN = 2;

export interface ArcadeViewOptions {
  /** 스코어 판에 올릴 지금의 내 이름표 (닉네임·후드티 색) */
  player(): Player;
  /** 실시간 서버. 데모 모드면 null이라 스코어 판 없이 내 기록만 보여요 */
  scoreServer: { url: string; key: string } | null;
  /** 제목 오른쪽 버튼들 (링크 복사, 닫기) */
  headActions: readonly HTMLElement[];
  /** 내 최고 기록을 깼을 때 */
  onNewRecord(game: GameId, score: number): void;
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

/** 지난주 1위가 없으면 빈 줄 (목록에서 숨겨요) */
function championLine(def: GameDef, champion: Champion | undefined): string {
  if (!champion) return '';
  const wins = champion.wins >= BADGE_MIN ? ` · 🏆 ${champion.wins}회 우승` : '';
  return `🏛 지난주 1위 ${champion.name} · ${def.formatScore(champion.score)}${wins}`;
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
  /** 게임마다 지난주 1위. 주가 바뀔 때만 달라져서 창을 연 동안 한 번만 받아요 */
  private champions: Partial<Record<GameId, Champion>> | null = null;

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
    this.body.replaceChildren(
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
              { type: 'button', class: 'arcade-game', 'aria-label': `${def.title} 시작`, 'aria-describedby': `ag-how-${def.id} ag-best-${def.id}${this.scores ? ` ag-leader-${def.id} ag-champ-${def.id}` : ''}`, onclick: () => void this.play(def) },
              h('span', { class: 'ag-icon' }, spriteIcon(def.icon, LIST_ICON_PX)),
              h(
                'span',
                { class: 'ag-text' },
                h('b', {}, def.title),
                h('span', { class: 'ag-how', id: `ag-how-${def.id}` }, def.tagline),
                h('span', { class: 'ag-best', id: `ag-best-${def.id}` }, best === null ? '아직 기록 없음' : `내 최고 기록 ${def.formatScore(best)}`),
                this.scores && h('span', { class: 'ag-leader', id: `ag-leader-${def.id}` }, ''),
                this.scores && h('span', { class: 'ag-leader', id: `ag-champ-${def.id}` }, ''),
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
          ? ['🏆 점수를 내면 닉네임과 점수가 이번 주 스코어 판에 올라가요. 한 사람(브라우저)당 이번 주 최고 점수 하나만 올라가요.', h('br'), '스코어 판은 매주 월요일 0시(KST)에 새로 시작하고, 그 주의 1~3위는 🏛 명예의 전당에 계속 남아요. 내 최고 기록은 이 브라우저에만 남아요.']
          : ['기록은 이 브라우저에만 남아요.']),
      ),
    );
    (this.body.querySelector('.arcade-game') as HTMLElement | null)?.focus();
    void this.showLeaders(view);
    void this.showChampions(view);
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

  /** 순위 화면. 탭을 바꾸면 화면을 다시 그리고, 바꾼 탭에 포커스를 둬요 */
  async showBoard(def: GameDef, tab: BoardTab = 'week', focusTab = false) {
    const scores = this.scores;
    if (!scores) return;
    const view = this.nextView({ kind: 'board', game: def.id });
    const again = h('button', { type: 'button', class: 'primary wide', onclick: () => void this.play(def) }, '한 판 하기');
    const panel = h(
      'div',
      { class: 'arcade-board', id: 'board-panel', role: 'tabpanel', 'aria-labelledby': `board-tab-${tab}`, 'aria-live': 'polite' },
      h('p', { class: 'arcade-loading' }, '불러오는 중…'),
    );
    const tabs = boardTabs(tab, (next) => void this.showBoard(def, next, true));
    this.body.replaceChildren(
      this.screenHead(def, `${def.title} 순위`),
      tabs,
      h('p', { class: 'arcade-board-sub' }, BOARD_TABS.find((t) => t.id === tab)!.sub),
      panel,
      again,
    );
    if (focusTab) (tabs.querySelector('[aria-selected="true"]') as HTMLElement | null)?.focus();
    let content: HTMLElement;
    try {
      content = tab === 'week' ? renderBoard(def, await this.loadBoard(scores, def)) : renderHall(def, await scores.hall(def.id, scoreKey()));
    } catch {
      if (view === this.viewId) panel.replaceChildren(h('p', { class: 'arcade-loading' }, '순위를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.'));
      return;
    }
    if (view !== this.viewId) return;
    panel.replaceChildren(content);
  }

  /** 이번 주 순위. 방금 올린 점수가 있으면 올라간 뒤에 읽어요 */
  private async loadBoard(scores: ScoreApi, def: GameDef): Promise<Board> {
    await this.pendingSubmit;
    return scores.board(def.id, scoreKey());
  }

  private stopRound() {
    this.round?.destroy();
    this.round = null;
  }

  /** 다른 화면으로 바꿀 준비: 하던 판을 멈추고 새 화면 번호를 받아요 */
  private nextView(screen: ArcadeScreen): number {
    this.current = screen;
    this.stopRound();
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

  /** 목록 카드마다 지난주 1위를 채워요 (없거나 못 받아 오면 그 줄은 숨겨요) */
  private async showChampions(view: number) {
    if (!this.scores) return;
    if (!this.champions) {
      try {
        this.champions = await this.scores.champions();
      } catch {
        return;
      }
    }
    if (view !== this.viewId) return;
    for (const def of GAMES) {
      const line = document.getElementById(`ag-champ-${def.id}`);
      if (line) line.textContent = championLine(def, this.champions[def.id]);
    }
  }

  /** 한 판이 끝나면: 내 기록에 남기고, 결과를 보여주고, 스코어 판에 올려요 */
  private finishRound(def: GameDef, score: number, panel: HTMLElement) {
    const outcome = recordScore(def.id, score);
    if (outcome.kind === 'new') {
      sound.chime();
      this.opts.onNewRecord(def.id, score);
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

/** 순위 화면 위 탭 (이번 주 / 명예의 전당) */
function boardTabs(current: BoardTab, onPick: (tab: BoardTab) => void): HTMLElement {
  return h(
    'div',
    { class: 'board-tabs', role: 'tablist', 'aria-label': '순위 종류' },
    ...BOARD_TABS.map((t) =>
      h(
        'button',
        {
          type: 'button',
          role: 'tab',
          id: `board-tab-${t.id}`,
          class: 'chip-sm' + (t.id === current ? ' on' : ''),
          'aria-selected': String(t.id === current),
          'aria-controls': 'board-panel',
          onclick: () => {
            if (t.id !== current) onPick(t.id);
          },
        },
        t.label,
      ),
    ),
  );
}

/** "2026-11-09" → "11월 9일 주" (서버가 KST 월요일 날짜로 줘서 시간대 계산 없이 글자로 읽어요) */
function weekLabel(week: string): string {
  const [, month, day] = week.split('-').map(Number);
  return `${month}월 ${day}일 주`;
}

/** 1위 줄 옆 한마디: 연속 우승이 먼저, 아니면 몇 번째 우승인지. 좁은 화면에서 이름이 잘리지 않게 짧게 */
function hallBadge(row: HallRow): { text: string; label: string } | null {
  if (row.rank !== 1) return null;
  if (row.streak >= BADGE_MIN) return { text: `🔥 ${row.streak}연속`, label: `${row.streak}주 연속 우승` };
  if (row.wins >= BADGE_MIN) return { text: `🏆 ${row.wins}번째`, label: `${row.wins}번째 우승` };
  return null;
}

function renderHall(def: GameDef, hall: Hall): HTMLElement {
  if (hall.weeks.length === 0) return h('p', { class: 'arcade-loading' }, '아직 끝난 주가 없어요. 이번 주 1~3위가 첫 주인공이 돼요');
  return h(
    'div',
    {},
    hall.most &&
      h(
        'p',
        { class: 'hall-most' },
        h('i', { class: 'bd-dot', style: `background:${hall.most.color}`, 'aria-hidden': 'true' }),
        `👑 역대 최다 우승 ${hall.most.name}${hall.most.mine ? ' (나)' : ''} · 🏆 ${hall.most.wins}회`,
      ),
    ...hall.weeks.map((w) =>
      h(
        'section',
        { class: 'hall-week' },
        h('h3', {}, weekLabel(w.week)),
        h(
          'ol',
          { class: 'board-list' },
          ...w.rows.map((row) => {
            const badge = hallBadge(row);
            return h(
              'li',
              { class: row.mine ? 'mine' : undefined },
              h('span', { class: 'bd-rank' }, h('span', { 'aria-hidden': 'true' }, MEDALS[row.rank - 1] ?? String(row.rank)), h('span', { class: 'sr-only' }, `${row.rank}위`)),
              h('i', { class: 'bd-dot', style: `background:${row.color}`, 'aria-hidden': 'true' }),
              h('span', { class: 'bd-name' }, row.mine ? `${row.name} (나)` : row.name),
              badge ? h('span', { class: 'hall-badge' }, h('span', { 'aria-hidden': 'true' }, badge.text), h('span', { class: 'sr-only' }, badge.label)) : null,
              h('span', { class: 'bd-score' }, def.formatScore(row.score)),
            );
          }),
        ),
      ),
    ),
  );
}
