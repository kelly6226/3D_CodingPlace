// 🎮 게임만 따로 연 페이지 (/games, /games/<게임 id>). 3D 없이 오락기만 띄워요.
// 화면 내용은 방 안 오락기와 같은 minigames/arcadeView.ts를 쓰고, 여기서는 주소·탭 제목만 맞춰요.
import '../style.css';
import { sound } from '../audio';
import { GAMES_PAGE_PATH, MINIGAMES_ENABLED, SITE } from '../config';
import { GAMES, type GameDef } from '../minigames/catalog';
import { ArcadeView, type ArcadeScreen } from '../minigames/arcadeView';
import { serverConfig } from '../net/server';
import * as store from '../store';
import { h } from '../ui/dom';
import { nicknameForm } from './nicknameForm';
import { readOrCreatePlayer } from './playerTag';

const LIST_TITLE = `탕비실 오락기 · ${SITE.name}`;

function gameFromPath(path: string): GameDef | null {
  const id = path.slice(GAMES_PAGE_PATH.length + 1).replace(/\/+$/, '');
  return GAMES.find((g) => g.id === id) ?? null;
}

function pathOf(screen: ArcadeScreen): string {
  return screen.kind === 'list' ? GAMES_PAGE_PATH : `${GAMES_PAGE_PATH}/${screen.game}`;
}

function titleOf(screen: ArcadeScreen): string {
  if (screen.kind === 'list') return LIST_TITLE;
  const def = GAMES.find((g) => g.id === screen.game);
  return def ? `${def.title} · ${LIST_TITLE}` : LIST_TITLE;
}

/** 화면이 바뀌면 주소와 탭 제목을 맞춰요. 뒤로 가기로 바뀐 거면 주소가 이미 같아서 기록을 더 쌓지 않아요 */
function syncAddress(screen: ArcadeScreen) {
  const path = pathOf(screen);
  if (location.pathname.replace(/\/+$/, '') !== path) history.pushState(null, '', path);
  document.title = titleOf(screen);
}

/** 주소에 맞는 화면을 열어요. 없는 게임 주소면 목록으로 */
function showFromAddress(view: ArcadeView) {
  const def = gameFromPath(location.pathname);
  if (def) {
    void view.play(def);
    return;
  }
  // 없는 게임 주소는 기록을 쌓지 않고 목록 주소로 바꿔요
  history.replaceState(null, '', GAMES_PAGE_PATH);
  view.showList();
}

function start() {
  const server = serverConfig(new URLSearchParams(location.search));
  const view = new ArcadeView({
    player: readOrCreatePlayer,
    scoreServer: server,
    headActions: [h('a', { class: 'ghost games-home', href: '/' }, '모각코 들어가기')],
    listTop: server ? nicknameForm : undefined,
    onScreen: syncAddress,
  });
  const root = h('main', { class: 'arcade arcade-page', 'aria-labelledby': 'arcade-title' }, view.card);
  document.getElementById('games')!.replaceChildren(root);

  // 소리 설정은 방과 같이 써요. 브라우저 자동재생 정책 때문에 처음 누를 때 켜요
  sound.enabled = store.getSound();
  const unlockSound = () => sound.start();
  addEventListener('pointerdown', unlockSound, { once: true });
  addEventListener('keydown', unlockSound, { once: true });

  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && view.screen.kind !== 'list') {
      view.showList();
      return;
    }
    if (view.keyToRound(e.key)) e.preventDefault();
  });
  addEventListener('popstate', () => showFromAddress(view));
  showFromAddress(view);
}

// 오락기를 끈 곳(토스 앱 브랜치)에서는 이 페이지도 열지 않고 방으로 보내요
if (MINIGAMES_ENABLED) start();
else location.replace('/');
