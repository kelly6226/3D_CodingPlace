// 🎮 탕비실 오락기 화면: 게임 목록, 한 판, 이번 주 순위와 명예의 전당.
// 창을 열고 닫는 일(3D 멈추기, 뒤 화면 막기, 키 받기)은 arcade.ts가 해요.
// 내 최고 기록은 이 브라우저에, 게임별 이번 주 스코어 판은 서버(schema.sql 9번)에, 지난 주들의 1~3위는 명예의 전당(10번)에 남아요.
import { sound } from '../audio';
import { clockText, sessionAt } from '../together/session';
import { h } from '../ui/dom';
import { GAMES, type GameDef, type GameId } from './catalog';
import { bestScore, recordScore, scoreKey, type RecordOutcome } from './records';
import { RoundView } from './round';
import { ScoreApi, ScoreError, type Board, type BoardRow, type Champion, type Hall, type HallRow, type Leader, type Player, type SubmitResult } from './scoreApi';
import { spriteIcon } from './sprites';

const SESSION_LINE_REFRESH_MS = 1000;
const LIST_ICON_PX = 44;
const HEAD_ICON_PX = 22;
/** '지난주 우승' 줄에 붙는 게임 그림과 왕관 */
const CHAMP_ICON_PX = 20;
const CROWN_PX = 22;
/** 목록을 다시 열 때 이 시간 안이면 이번 주 1위를 다시 묻지 않아요 */
const LEADERS_FRESH_MS = 30_000;

/** 지금 보이는 화면 */
export type ArcadeScreen = { kind: 'list' } | { kind: 'play' | 'board'; game: GameId };

/** 순위 화면의 탭: 이번 주 TOP 10 / 명예의 전당 */
type BoardTab = 'week' | 'hall';

const BOARD_TABS: readonly { id: BoardTab; label: string; sub: string }[] = [
  { id: 'week', label: '이번 주', sub: '이번 주 TOP 10이에요. 매주 월요일 0시(KST)에 새로 시작해요.' },
  // 몇 주까지 보여 주는지는 서버(schema.sql game_hall의 shown_weeks)가 정해서 여기 적지 않아요
  { id: 'hall', label: '명예의 전당', sub: '끝난 주마다 1~3위가 여기 남아요. 최근 주부터 보여요.' },
];

const EMPTY_CROWN_PX = 40;
/** 명예의 전당에 오르는 순위 (schema.sql game_hall과 같아요) */
const HALL_PLACES = 3;
const HOUR_MS = 3600e3;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
/** 한국은 서머타임이 없어서 KST로 고정해요 (together/session.ts와 같아요) */
const KST_OFFSET_MS = 9 * HOUR_MS;

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

/** 목록 카드 아래 이번 주 1위 한 줄 */
function leaderLine(def: GameDef, leader: Leader | undefined): (Node | string)[] {
  if (!leader) return ['이번 주 1위 자리가 비어 있어요'];
  return ['이번 주 1위 ', h('b', {}, leader.name), ` ${def.formatScore(leader.score)}`];
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
      // 지난주 우승자가 있을 때만 보여요 (showChampions가 채워요)
      ...(this.scores ? [h('section', { class: 'arcade-champs', id: 'arcade-champs', hidden: true, 'aria-labelledby': 'champs-title' })] : []),
      h('ul', { class: 'arcade-list' }, ...GAMES.map((def) => this.gameItem(def))),
      h(
        'p',
        { class: 'arcade-foot' },
        this.scores
          ? '점수를 내면 닉네임과 이번 주 최고 점수가 순위에 올라가요(브라우저마다 한 줄). 순위는 매주 월요일 0시(KST)에 새로 시작하고, 1~3위는 명예의 전당에 남아요.'
          : '기록은 이 브라우저에만 남아요.',
      ),
    );
    (this.body.querySelector('.arcade-game') as HTMLElement | null)?.focus();
    void this.showLeaders(view);
    void this.showChampions(view);
  }

  /** 목록의 게임 하나: 누르면 시작, 아래 줄에 이번 주 1위와 순위 버튼 */
  private gameItem(def: GameDef): HTMLElement {
    const best = bestScore(def.id);
    return h(
      'li',
      { class: 'arcade-item' },
      h(
        'button',
        { type: 'button', class: 'arcade-game', 'aria-label': `${def.title} 시작`, 'aria-describedby': `ag-how-${def.id} ag-best-${def.id}`, onclick: () => void this.play(def) },
        h('span', { class: 'ag-icon' }, spriteIcon(def.icon, LIST_ICON_PX)),
        h(
          'span',
          { class: 'ag-text' },
          h('b', { class: 'ag-title' }, def.title),
          h('span', { class: 'ag-how', id: `ag-how-${def.id}` }, def.tagline),
          h('span', { class: `ag-best${best === null ? ' empty' : ''}`, id: `ag-best-${def.id}` }, best === null ? '아직 기록이 없어요' : `내 최고 ${def.formatScore(best)}`),
        ),
      ),
      this.scores &&
        h(
          'div',
          { class: 'ag-foot' },
          h('span', { class: 'ag-leader', id: `ag-leader-${def.id}` }),
          h('button', { type: 'button', class: 'ag-rank', 'aria-label': `${def.title} 순위 보기`, onclick: () => void this.showBoard(def) }, '순위'),
        ),
    );
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
      content = tab === 'week' ? renderBoard(def, await this.loadBoard(scores, def)) : await this.loadHall(scores, def);
    } catch {
      if (view === this.viewId) panel.replaceChildren(h('p', { class: 'arcade-loading' }, '순위를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.'));
      return;
    }
    if (view !== this.viewId) return;
    panel.replaceChildren(content);
  }

  /** 명예의 전당. 아직 끝난 주가 없으면 이번 주 순위를 같이 읽어서 '이대로 끝나면'을 보여 줘요 */
  private async loadHall(scores: ScoreApi, def: GameDef): Promise<HTMLElement> {
    const hall = await scores.hall(def.id, scoreKey());
    if (hall.weeks.length > 0) return renderHall(def, hall);
    const board = await this.loadBoard(scores, def).catch(() => null);
    return renderHallEmpty(def, board, Date.now());
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
      document.getElementById(`ag-leader-${def.id}`)?.replaceChildren(...leaderLine(def, leaders.byGame[def.id]));
    }
  }

  /** 목록 맨 위 '지난주 우승'을 채워요. 우승자가 없거나 못 받아 오면 숨긴 채로 둬요 */
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
    const box = document.getElementById('arcade-champs');
    const champions = this.champions;
    const rows = GAMES.flatMap((def) => {
      const champion = champions[def.id];
      return champion ? [championRow(def, champion, () => void this.showBoard(def, 'hall'))] : [];
    });
    if (!box || rows.length === 0) return;
    box.replaceChildren(h('h3', { class: 'champs-head', id: 'champs-title' }, spriteIcon('crown', CROWN_PX), '지난주 우승'), h('ul', { class: 'champs-list' }, ...rows));
    box.hidden = false;
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
        this.scores && h('button', { type: 'button', class: 'ghost', onclick: () => void this.showBoard(def) }, '순위'),
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
    h('ol', { class: 'hs-table' }, ...board.top.map((row) => scoreRow({ ...row, score: def.formatScore(row.score), badge: null }))),
    board.me && !meInTop && h('p', { class: 'board-me' }, `나는 ${board.me.rank}위, ${def.formatScore(board.me.score)}`),
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

/** 1위 이름 아래 한마디: 연속 우승이 먼저, 아니면 몇 번째 우승인지 */
function hallBadge(row: HallRow): string | null {
  if (row.rank !== 1) return null;
  if (row.streak >= BADGE_MIN) return `${row.streak}주 연속 우승`;
  if (row.wins >= BADGE_MIN) return `${row.wins}번째 우승`;
  return null;
}

interface ScoreRowParts {
  rank: number;
  name: string;
  color: string;
  mine: boolean;
  /** 사람이 읽는 점수 ('손 12개 막음') */
  score: string;
  /** 이름 아래 작은 줄 (명예의 전당의 연속·몇 번째 우승) */
  badge: string | null;
}

/**
 * 순위표 한 줄. 이번 주 순위와 명예의 전당이 같은 모양이에요 (오락실 최고 기록 화면처럼 이름과 점수를 점선으로 이어요).
 * 1~3위는 순위 숫자를 금·은·동 색으로 칠해요
 */
function scoreRow(p: ScoreRowParts): HTMLElement {
  const podium = p.rank <= 3 ? ` r${p.rank}` : '';
  return h(
    'li',
    { class: `hs-row${podium}${p.mine ? ' mine' : ''}` },
    h('span', { class: 'hs-rank' }, String(p.rank), h('span', { class: 'sr-only' }, '위')),
    h('i', { class: 'bd-dot', style: `background:${p.color}`, 'aria-hidden': 'true' }),
    h(
      'span',
      { class: 'hs-who' },
      h('span', { class: 'hs-line' }, h('span', { class: 'hs-name' }, p.name), p.mine ? h('span', { class: 'hs-me' }, '나') : null),
      p.badge ? h('span', { class: 'hs-badge' }, p.badge) : null,
    ),
    h('span', { class: 'hs-lead', 'aria-hidden': 'true' }),
    h('span', { class: 'hs-score' }, p.score),
  );
}

/** 목록 맨 위 '지난주 우승' 한 줄. 누르면 그 게임의 명예의 전당이 열려요 */
function championRow(def: GameDef, champion: Champion, onOpen: () => void): HTMLElement {
  return h(
    'li',
    {},
    h(
      'button',
      { type: 'button', class: 'champ', onclick: onOpen },
      spriteIcon(def.icon, CHAMP_ICON_PX),
      h('span', { class: 'champ-game' }, def.title),
      h('span', { class: 'hs-lead', 'aria-hidden': 'true' }),
      h('b', { class: 'champ-name' }, champion.name),
      champion.wins >= BADGE_MIN ? h('span', { class: 'champ-wins' }, `${champion.wins}회 우승`) : null,
      h('span', { class: 'sr-only' }, ', 명예의 전당 보기'),
    ),
  );
}

/** 순위가 새로 시작하는 다음 월요일 0시(KST) */
function nextWeekStart(now: number): number {
  const kst = now + KST_OFFSET_MS;
  const daysSinceMonday = (new Date(kst).getUTCDay() + 6) % 7;
  const thisMonday = Math.floor(kst / DAY_MS) * DAY_MS - daysSinceMonday * DAY_MS;
  return thisMonday + WEEK_MS - KST_OFFSET_MS;
}

/** 남은 시간: 하루가 넘으면 '4일 11시간', 한 시간이 넘으면 '3시간 20분', 아니면 '12분' */
function remainingText(ms: number): string {
  const days = Math.floor(ms / DAY_MS);
  const hours = Math.floor((ms % DAY_MS) / HOUR_MS);
  const minutes = Math.max(1, Math.floor((ms % HOUR_MS) / 60e3));
  if (days > 0) return `${days}일 ${hours}시간`;
  if (hours > 0) return `${hours}시간 ${minutes}분`;
  return `${minutes}분`;
}

/** 지금 순위에서 내 자리: 이대로 끝나면 명예의 전당에 오르는지 */
function myPlaceLine(board: Board, podium: readonly BoardRow[]): string | null {
  if (!board.me) return null;
  if (podium.some((row) => row.mine)) return `지금 ${board.me.rank}위예요. 이대로 끝나면 내 이름도 올라가요.`;
  // 동점이면 먼저 낸 사람이 올라가요 (schema.sql game_hall_archive의 pos)
  if (board.me.rank <= HALL_PLACES) return `지금 공동 ${board.me.rank}위예요. 동점이면 먼저 낸 사람이 올라가니, 점수를 조금만 더 올려 보세요.`;
  return `나는 지금 ${board.me.rank}위예요. ${HALL_PLACES}위 안에 들면 이름이 남아요.`;
}

/** 아직 끝난 주가 없을 때: 언제 처음 이름이 오르는지와, 지금 순위 그대로라면 누가 오르는지 */
function renderHallEmpty(def: GameDef, board: Board | null, now: number): HTMLElement {
  const end = nextWeekStart(now);
  const endDay = new Date(end + KST_OFFSET_MS);
  // 서버가 동점을 먼저 낸 순서로 보내서, 앞에서 세 줄이 그대로 명예의 전당에 오르는 줄이에요
  const podium = board?.top.slice(0, HALL_PLACES) ?? [];
  const myPlace = board && myPlaceLine(board, podium);
  return h(
    'div',
    { class: 'hall-empty' },
    spriteIcon('crown', EMPTY_CROWN_PX),
    h('p', { class: 'he-title' }, '명예의 전당이 아직 비어 있어요'),
    h('p', { class: 'he-text' }, `${endDay.getUTCMonth() + 1}월 ${endDay.getUTCDate()}일(월) 0시에 이번 주가 끝나면, 이번 주 1~${HALL_PLACES}위가 처음으로 이름을 올려요.`),
    h('p', { class: 'he-left' }, `남은 시간 ${remainingText(end - now)}`),
    board &&
      h(
        'section',
        { class: 'he-preview', 'aria-labelledby': 'he-preview-title' },
        h('h3', { id: 'he-preview-title' }, '지금 순위 그대로라면'),
        podium.length > 0
          ? h('ol', { class: 'hs-table' }, ...podium.map((row) => scoreRow({ ...row, score: def.formatScore(row.score), badge: null })))
          : h('p', { class: 'he-none' }, '이번 주 기록이 아직 없어요. 지금 한 판 하면 1위예요.'),
        myPlace ? h('p', { class: 'board-me' }, myPlace) : null,
      ),
  );
}

function renderHall(def: GameDef, hall: Hall): HTMLElement {
  return h(
    'div',
    {},
    hall.most &&
      h(
        'p',
        { class: 'hall-most' },
        spriteIcon('crown', CROWN_PX),
        h('span', { class: 'hm-label' }, '역대 최다 우승'),
        h('b', { class: 'hm-name' }, hall.most.name),
        hall.most.mine ? h('span', { class: 'hs-me' }, '나') : null,
        h('span', { class: 'hm-wins' }, `${hall.most.wins}회`),
      ),
    ...hall.weeks.map((w) =>
      h(
        'section',
        { class: 'hall-week' },
        h('h3', {}, weekLabel(w.week)),
        h('ol', { class: 'hs-table' }, ...w.rows.map((row) => scoreRow({ ...row, score: def.formatScore(row.score), badge: hallBadge(row) }))),
      ),
    ),
  );
}
