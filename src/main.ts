import './style.css';
import {
  CHAT_MAX_LENGTH,
  CHAT_SEND_GAP_MS,
  CONTEXT_LOSS_TOAST_MS,
  DEFAULT_ROOM,
  DEVICE_SYNC_ENABLED,
  PRESENCE_LAG_MS,
  PRIVATE_ROOMS_ENABLED,
  REPORTS_TO_HIDE,
  ROOM_SLUG_RE,
  builtinRoom,
  emoteById,
  isNoiseId,
  isPlaceId,
  pageTitle,
  placeMeta,
  roomAddress,
  roomPasswordProblem,
  statusById,
  type ActionId,
  type NoiseId,
  type PlaceId,
  type RoomInfo,
} from './config';
import { entryRoomParam, shareRoom } from './toss';
import type { Look } from './look';
import { sound } from './audio';
import { BLOCKED_WORDS_REASON, hasBadWord, isBlockedWordsError } from './net/badwords';
import { DemoNet, randomHash } from './net/demo';
import type { Commit, Net, NetEvent, PeerState, SeatTrace } from './net/types';
import * as store from './store';
import { startStudyClock, studySinceFor, studyTodayAt } from './studyClock';
import { SyncApi } from './sync/api';
import { formatSyncCode, parseSyncCode, syncLink, takeSyncCodeFromUrl } from './sync/code';
import { DeviceSync, type SyncStart } from './sync/deviceSync';
import { canShareLink, kakaoExternalUrl } from './sync/env';
import { RoomTimeReporter } from './together/roomTime';
import { SeatTimeReporter } from './together/seatTime';
import { BREAK_MINUTES, FOCUS_MINUTES, SESSION_DONE_MIN_MS, sessionAt, watchSession, type SessionState } from './together/session';
import { hasRoomRecord, hourLabel, roomTodaySentence, seatTraceLine } from './ui/together';
import { Tips } from './ui/tips';
import { UI, type RoomDraft } from './ui/ui';
import { followVisualViewport } from './ui/viewport';
import { watchContextLoss } from './world/contextWatch';
import { SEATS, SPAWN, SPOTS, seatById, type SeatKind } from './world/layout';
import type { InteractData } from './world/places/kit';
import { startRenderHud } from './world/renderHud';
import type { World } from './world/world';

const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const secondsSincePageLoad = () => Math.round(performance.now() / 1000);

const app = document.getElementById('app')!;
const stage = document.getElementById('stage')!;
const ui = new UI(app);

const profile = store.getProfile();
ui.showIntro(profile, store.hasSavedProfile());
ui.setSound(store.getSound());
sound.enabled = store.getSound();

const params = new URLSearchParams(location.search);
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;
const isOnline = !!supabaseUrl && !!supabaseKey && params.get('demo') !== '1';

/** 다른 기기에서 이어하기. 서버가 없으면(데모 모드) null */
const deviceSync = isOnline && DEVICE_SYNC_ENABLED ? new DeviceSync(new SyncApi(supabaseUrl!, supabaseKey!)) : null;
/** 이어하기 링크(#sync=…)로 들어왔으면 그 코드. 주소에서는 바로 지워요 */
const syncCodeFromLink = deviceSync ? takeSyncCodeFromUrl() : null;

/** ?room= 값에서 방 찾기. 호점 표기(pangyo-2)는 기본 제공 방에서만 받아줌: 사용자가 만든 방 이름이 -숫자로 끝나도 한 방으로 읽기 위해서 */
function roomFromParam(param: string): { slug: string | null; instance: number } {
  const withInstance = param.match(/^([a-z0-9-]+)-(\d)$/);
  if (withInstance && builtinRoom(withInstance[1])) return { slug: withInstance[1], instance: Number(withInstance[2]) };
  if (ROOM_SLUG_RE.test(param)) return { slug: param, instance: 1 };
  return { slug: null, instance: 1 };
}

/** 주소에서 방 찾기: ?room=<방>. 웹에서 공유한 예전 /r/<방> 링크도 받아줌 */
function roomFromUrl(): { slug: string | null; instance: number } {
  const m = location.pathname.match(/^\/r\/([a-z0-9-]{3,32})\/?$/);
  if (m) return { slug: m[1], instance: Number(new URLSearchParams(location.search).get('n')) || 1 };
  return roomFromParam(new URLSearchParams(location.search).get('room') ?? '');
}

followVisualViewport();

let world: World;
let places: typeof import('./world/places');
let net: Net;
let self: PeerState;
let room: RoomInfo = builtinRoom(DEFAULT_ROOM)!;
let startInstance = 1;
let commits: Commit[] = [];
let enteredAt = 0;
let connWarned = false;
/** 방에 있던 시간을 5분마다 서버에 더해요 (net이 정해진 뒤 boot에서 만들어요) */
let roomTime: RoomTimeReporter | null = null;
/** 앉아 있던 자리의 시간도 같이 (자리에 남은 흔적용) */
let seatTime: SeatTimeReporter | null = null;

// ── 1. 폰트 → 3D 장면 준비 ─────────────────────────
async function boot() {
  ui.setProgress(0.1);
  // 다른 기기에서 바꾼 프로필을 입장 화면이 열려 있는 동안 받아와요 (폰트·3D 준비와 같이)
  const syncStarting = startDeviceSync();
  const placesP = import('./world/places');
  const worldP = import('./world/world');
  try {
    const { ALL_CANVAS_TEXT: t } = await placesP;
    await Promise.race([
      Promise.all([
        document.fonts.load('700 40px Gaegu', t.hand),
        document.fonts.load('500 20px "JetBrains Mono"', t.mono),
        document.fonts.load('800 20px Pretendard', t.ui + t.mono),
        document.fonts.load('500 20px Pretendard', t.ui + t.mono),
      ]),
      wait(3000),
    ]);
  } catch {
    /* 폰트가 없어도 기본 글꼴로 진행 */
  }
  places = await placesP;
  ui.setProgress(0.35);

  if (isOnline) {
    const { OnlineNet } = await import('./net/online');
    net = new OnlineNet(supabaseUrl!, supabaseKey!, profile.id);
  } else {
    net = new DemoNet();
  }
  ui.setMode(net.mode);
  roomTime = new RoomTimeReporter((slug, report) => net.addRoomTime(slug, report));
  seatTime = new SeatTimeReporter((slug, seat, minutes) => net.addSeatTime(slug, seat, minutes));

  // 링크로 들어왔으면 그 방, 아니면 기본 방
  const fromAddress = roomFromUrl();
  const fromUrl = fromAddress.slug ? fromAddress : roomFromParam(entryRoomParam());
  let found: RoomInfo | null = null;
  if (fromUrl.slug) found = await Promise.race([net.getRoom(fromUrl.slug), wait(5000).then(() => null)]);
  if (fromUrl.slug && !found) {
    ui.toast('링크의 방을 찾을 수 없어요. 판교 새벽 카페로 안내할게요.', 'bad', 5000);
    history.replaceState(null, '', roomAddress(DEFAULT_ROOM));
  }
  room = found ?? builtinRoom(DEFAULT_ROOM)!;
  startInstance = found ? fromUrl.instance : 1;

  // 방이 정해진 다음에 그 방의 장소로 3D 장면을 만듦
  ui.setProgress(0.6);
  const { World } = await worldP;
  const def = places.placeDef(room.place);
  world = new World(stage, def);
  sound.setAmbience(def.ambience);
  applyNoise(room);
  world.start(onFrame);
  watchContextLoss(world.renderer.domElement, {
    lost: () => ui.toast(`3D 화면이 멈췄어요 (접속 ${secondsSincePageLoad()}초 후)`, 'bad', CONTEXT_LOSS_TOAST_MS),
    restored: () => ui.toast(`3D 화면이 돌아왔어요 (접속 ${secondsSincePageLoad()}초 후)`, 'good', CONTEXT_LOSS_TOAST_MS),
  });
  if (params.get('diag') === '1') startRenderHud(world.renderer);
  ui.setProgress(0.9);
  ui.setCurrentRoom(room, !!found);
  ui.setRoom(startInstance);
  void refreshRooms();
  reloadRoomToday();
  window.setInterval(() => void refreshRoomToday(), ROOM_TODAY_REFRESH_MS);
  net.watchCounts((c) => ui.setCounts(c));
  await loadRoomCommits();
  await syncStarting;
  ui.ready();
  if (syncCodeFromLink) openSyncLink(syncCodeFromLink);
}

// ── 다른 기기에서 이어하기 ────────────────────────
async function startDeviceSync() {
  if (!deviceSync) return;
  const result = await deviceSync.start();
  showSyncStart(result);
  ui.setSyncState(deviceSync.state());
  deviceSync.startAutoFlush();
}

/** 이어하기를 아직 안 켰고 안내 창도 안 열어 봤으면, 기록이 쌓인 순간에 알려줘요 (하루 한 번, 모두 세 번까지) */
function shouldNudgeSync(): boolean {
  return deviceSync?.state().kind === 'unlinked' && !store.hasSeenSync() && store.takeSyncNudge();
}

function showSyncStart(result: SyncStart) {
  if (result === 'applied') ui.replaceIntroProfile(store.getProfile());
  if (result === 'gone') ui.toast('다른 기기에서 이어하기 기록을 지워서, 이 기기도 연결을 끊었어요.', 'info', 6000);
}

/** 이어하기 링크로 들어왔을 때. 이미 연결된 기기면 다시 묻지 않아요 */
function openSyncLink(code: string) {
  const state = deviceSync!.state();
  if (state.kind === 'linked' && state.code === code) {
    ui.toast('이 기기는 이미 이어져 있어요', 'good');
    return;
  }
  ui.openSync(code);
  if (state.kind === 'linked') {
    ui.toast('이 기기는 다른 이어하기에 연결돼 있어요. 이 링크로 바꾸려면 먼저 연결을 끊어 주세요', 'info', 7000);
  }
}

async function createSyncCode() {
  const result = await deviceSync!.create();
  // 시트가 '나에게 보내기'로 바뀌어서, 다음에 할 일은 거기서 알려줘요
  if (result.ok) ui.setSyncState(deviceSync!.state());
  return result;
}

/** 내 링크를 공유 창으로 보내요. 공유 창이 없거나 실패하면 복사로 대신해요 */
async function shareSyncLink() {
  const state = deviceSync?.state();
  if (state?.kind !== 'linked') return;
  if (!canShareLink()) {
    await copySync('link');
    return;
  }
  try {
    await navigator.share({
      title: '온라인 모각코 이어하기',
      text: '온라인 모각코 이어하기 링크예요. 다른 기기에서 열면 내 캐릭터와 잔디가 이어져요. 남에게는 보내지 마세요.',
      url: syncLink(state.code),
    });
    markSyncShared();
    ui.toast('보냈어요. 다른 기기에서 이 링크를 열면 이어져요', 'good');
  } catch (e) {
    // 사용자가 공유 창을 닫은 거면 아무것도 안 해요
    if (e instanceof DOMException && e.name === 'AbortError') return;
    await copySync('link');
  }
}

function markSyncShared() {
  store.markSyncShared();
  ui.setSyncState(deviceSync!.state());
}

/** 카카오톡 안의 브라우저에서 이 페이지(링크로 왔으면 그 코드까지)를 기본 브라우저로 다시 열어요 */
function openSyncExternal(draft: string) {
  const code = parseSyncCode(draft);
  const url = code ? syncLink(code) : location.href;
  location.href = kakaoExternalUrl(url);
}

async function joinSyncCode(code: string) {
  const result = await deviceSync!.join(code);
  // 프로필·방 기록·화면을 처음부터 새 기록으로 맞추려고 새로 불러요
  if (result.ok) location.reload();
  return result;
}

async function unlinkSync() {
  const ok = await ui.confirm('이 기기에서 연결을 끊을까요?', '이 기기의 기록은 그대로 남고, 앞으로는 다른 기기와 맞추지 않아요. 같은 코드로 다시 이어할 수 있어요.', '연결 끊기', '취소');
  if (!ok) return;
  deviceSync!.unlink();
  ui.setSyncState(deviceSync!.state());
  ui.toast('이 기기에서 연결을 끊었어요');
}

async function eraseSync() {
  const ok = await ui.confirm(
    '서버에 남은 기록을 지울까요?',
    '이 코드로 저장한 프로필과 날짜별 시간을 서버에서 지워요. 되살릴 수 없고, 다른 기기들도 다음에 열 때 연결이 끊겨요. 각 기기에 있던 기록은 남아요.',
    '지우기',
    '취소',
  );
  if (!ok) return;
  const result = await deviceSync!.erase();
  if (!result.ok) {
    ui.toast(result.reason, 'bad', 5000);
    return;
  }
  ui.setSyncState(deviceSync!.state());
  ui.toast('서버에 남은 기록을 지웠어요');
}

/** 클립보드에 복사. 막혀 있거나 오래 걸리면 false (토스 앱에서는 이어하기가 꺼져 있어서 지금은 안 불려요) */
async function copyText(text: string) {
  try {
    return await Promise.race([navigator.clipboard.writeText(text).then(() => true), wait(1500).then(() => false)]);
  } catch {
    return false;
  }
}

async function copySync(what: 'code' | 'link') {
  const state = deviceSync?.state();
  if (state?.kind !== 'linked') return;
  const value = what === 'code' ? formatSyncCode(state.code) : syncLink(state.code);
  if (!(await copyText(value))) {
    ui.toast(value, 'info', 10000);
    return;
  }
  // 복사했으면 어딘가에 붙여 둘 거라 보고, '아직 안 보냈어요' 안내를 그만해요
  markSyncShared();
  ui.toast(what === 'code' ? '코드를 복사했어요. 남에게 보여주지 마세요' : '복사했어요. 카톡 나와의 채팅이나 메모에 붙여 두세요', 'good');
}

// ── 정각 모각코: 방별 오늘 기록 ─────────────────
/** 오늘 기록을 다시 읽는 간격 (브라우저들이 5분마다 더해요) */
const ROOM_TODAY_REFRESH_MS = 5 * 60e3;
/** 방에 들어온 뒤 '다녀감'이 서버에 더해질 때까지 기다렸다 읽어요 */
const ROOM_TODAY_AFTER_ENTER_MS = 1500;

/** 지금 방과 방 목록의 오늘 기록을 읽어요. 데모 모드는 기록이 없다고 알려요 */
async function refreshRoomToday() {
  if (!net.keepsRoomStats) {
    ui.setRoomToday({ kind: 'off' });
    return;
  }
  const slug = room.slug;
  const [today, all, traces] = await Promise.all([net.loadRoomToday(slug), net.loadRoomsToday(), net.loadSeatTraces(slug)]);
  ui.setRoomsToday(all);
  if (slug !== room.slug) return;
  ui.setRoomToday({ kind: 'ready', value: today });
  showSeatTraces(traces);
}

/** 자리에 남은 흔적(식은 커피잔). 지금 장소에 없는 자리와 이번에 내가 앉았던 자리는 빼요 */
function showSeatTraces(traces: SeatTrace[]) {
  const now = Date.now();
  const props = traces.flatMap((t) => {
    const seat = seatById(t.seat);
    if (!seat || seatTime?.isMine(room.slug, t.seat)) return [];
    return [{ seat, line: seatTraceLine(t, now) }];
  });
  world.setTraces(props);
  syncTraceVisibility();
  // 처음 한 번만: 컵이 무엇인지 알려줘요
  if (props.length && self && store.takeTracesHint()) {
    window.setTimeout(() => ui.toast('☕ 책상에 놓인 커피잔은 최근에 누가 앉았던 자리예요. 눌러 보세요', 'info', 6000), NUDGE_DELAY_MS);
  }
}

/** 지금 누가(나 포함) 앉아 있는 자리의 흔적은 숨겨요 */
function syncTraceVisibility() {
  if (!world) return;
  const taken = takenSeats();
  if (self?.seat) taken.add(self.seat);
  world.hideTraceSeats(taken);
}

/** 붐비는 시간은 하루 사이에 크게 안 바뀌어서 방이 바뀔 때만 읽어요 */
async function refreshBusyHours() {
  if (!net.keepsRoomStats) {
    ui.setBusyHours({ kind: 'off' });
    return;
  }
  const slug = room.slug;
  const busy = await net.loadBusyHours(slug);
  if (slug === room.slug) ui.setBusyHours({ kind: 'ready', value: busy });
}

/** 방이 바뀌면 이전 방 숫자가 잠깐이라도 보이지 않게 비우고 다시 읽어요 */
function reloadRoomToday(delayMs = 0) {
  const pending = net.keepsRoomStats ? ({ kind: 'loading' } as const) : ({ kind: 'off' } as const);
  ui.setRoomToday(pending);
  ui.setBusyHours(pending);
  world.setTraces([]);
  void refreshBusyHours();
  window.setTimeout(() => void refreshRoomToday(), delayMs);
}

let roomsCache: RoomInfo[] = [];
async function refreshRooms() {
  roomsCache = await Promise.race([net.listRooms(), wait(6000).then(() => roomsCache)]);
  ui.setRooms(roomsCache);
  ui.setCurrentRoom(room);
}

async function loadRoomCommits() {
  const slug = room.slug;
  const list = await Promise.race([net.loadCommits(slug), wait(5000).then(() => [] as Commit[])]);
  if (slug !== room.slug) return; // 그 사이 방을 옮겼으면 버림
  showCommits(list);
  document.title = pageTitle(room);
}

/** 방명록을 TV와 시트에 그려요. 내가 신고한 커밋은 빼요 */
function showCommits(list: Commit[]) {
  const reported = store.getReportedCommits(room.slug);
  commits = list.filter((c) => !reported.has(c.hash));
  world.room.gitlog.draw(commits, room.name);
  ui.setCommits(commits, myCommitHashes);
}

// ── 2. 입장 ──────────────────────────────────────
async function enter(p: store.Profile) {
  // saveProfile 전에 봐야 해요. 저장하고 나면 항상 '저장된 프로필 있음'이 돼요
  const firstVisit = !store.hasSavedProfile();
  store.saveProfile(p);
  sound.start();
  enteredAt = Date.now();
  self = {
    ...p,
    status: 'coding',
    seat: null,
    seatAt: 0,
    x: SPAWN.x,
    z: SPAWN.z,
    coffee: store.getCoffeeToday(),
    joinedAt: Date.now(),
    studySince: studySinceFor(store.getStudyMsToday(), Date.now()),
  };
  world.addAvatar(self, true);
  ui.setSelf(self);
  ui.setStudyToday(store.getStudyMsToday());
  startStudyClock({ onElapsed: onStudyElapsed, onSkipped: skipAsleepTime });

  const connecting = net.connect(
    self,
    {
      onPeers,
      onEvent,
      onCommits: showCommits,
      onStatus: (s) => {
        ui.setConn(s);
        if (s === 'offline' && !connWarned) {
          connWarned = true;
          ui.toast('실시간 서버에 연결하지 못했어요. 다시 연결하는 중이에요.', 'bad', 5000);
        }
        if (s === 'online') connWarned = false;
      },
      onRoomChange: (n) => {
        ui.setRoom(n);
        for (const id of [...world.avatars.keys()]) if (id !== self.id) world.removeAvatar(id);
        known.clear();
        lastMoves.clear();
        metThisSession.clear();
        ui.clearChat();
        ui.toast(`자리가 꽉 차서 ${n}호점으로 안내했어요`);
      },
    },
    room,
    startInstance,
  );
  // 연결이 늦어도 방 구경은 먼저 할 수 있게
  await Promise.race([connecting, wait(8000)]);
  roomTime?.enter(room.slug);
  reloadRoomToday(ROOM_TODAY_AFTER_ENTER_MS);
  if (room.slug !== DEFAULT_ROOM || roomFromUrl().slug) history.replaceState(null, '', roomAddress(room.slug));

  await wait(700);
  // 처음 온 사람은 자리 안내를 토스트 대신 안내 메모 첫 장으로 보여줘요
  autoSeat(!firstVisit);
  if (store.getMyHour() === sessionAt(Date.now()).hour) {
    window.setTimeout(() => ui.toast('정해 둔 시간에 맞춰 왔어요', 'good'), NUDGE_DELAY_MS);
  }
  if (firstVisit) {
    await wait(TIPS_DELAY_MS);
    showTips();
  }
}

// ── 처음 안내 ──────────────────────────────────────
/** 자리로 걸어가는 걸 잠깐 보여준 뒤 안내를 띄워요 */
const TIPS_DELAY_MS = 1600;
const tips = new Tips();

/** 기능 옆에 하나씩 붙이는 안내. 처음 왔을 때 한 번, ⚙️에서 다시 볼 수 있어요 */
function showTips() {
  tips.start(
    [
      {
        emoji: '🪑',
        title: '여기가 오늘 자리예요',
        body: '다른 빈자리를 누르면 옮겨 앉고, 바닥을 누르면 그쪽으로 걸어가요.',
        target: () => {
          const me = world.avatars.get(self.id);
          return me ? world.toScreen(me.position.clone().setY(2)) : null;
        },
      },
      {
        emoji: '⏱',
        title: '정각에 같이 시작해요',
        body: `매시 정각부터 ${FOCUS_MINUTES}분 집중하고 ${BREAK_MINUTES}분 쉬어요. 누르면 오늘 이 방 기록과 사람 많은 시간을 볼 수 있어요.`,
        target: () => document.getElementById('session-btn'),
      },
      {
        emoji: '💬',
        title: '한마디 걸어 보기',
        body: '보낸 말은 머리 위 말풍선으로 잠깐 떠요. 다른 사람을 눌러 "💬 귓속말"을 고르면 그 사람에게만 보여요. 남겨 두고 싶은 말은 📌로 방명록에 붙여요.',
        target: () => document.getElementById('act-chat'),
      },
      {
        emoji: '⎇',
        title: '오늘 한 일 커밋하기',
        body: '벽에 걸린 TV의 git log에 올라가요. 같은 방 사람들이 다 같이 봐요.',
        target: () => document.getElementById('act-commit'),
      },
      {
        emoji: '🎧',
        title: '배경 소리 고르기',
        body: '모닥불, 빗소리, 도서관 같은 소리로 바꿀 수 있어요. 나한테만 들려요.',
        target: () => document.getElementById('noise-btn'),
      },
    ],
    () => {},
  );
}

/** 장소마다 먼저 앉혀줄 자리 (카페는 창가 바, 서버실은 랙 앞 바닥…) */
const FIRST_SEAT: Record<PlaceId, SeatKind> = { cafe: 'stool', serverroom: 'floor', studio: 'chair', hackathon: 'chair' };

/** 빈자리 찾아서 앉기 */
function autoSeat(first: boolean) {
  const taken = takenSeats();
  const free = SEATS.filter((s) => !taken.has(s.id));
  const seat = free.find((s) => s.kind === FIRST_SEAT[room.place]) ?? free[0];
  if (seat) {
    sitAt(seat.id);
    if (first) ui.toast(`${seat.label}에 앉을게요. 다른 자리를 누르면 옮길 수 있어요.`);
  } else {
    ui.toast('자리가 다 찼어요. 서서 코딩해도 괜찮아요.');
    moveTo(SPOTS.idle.x, SPOTS.idle.z);
  }
}

/** 방의 장소로 3D 장면과 배경 소리를 바꿈 */
function applyPlace(r: RoomInfo) {
  const def = places.placeDef(r.place);
  const changed = world.setPlace(def);
  sound.setAmbience(def.ambience);
  return changed;
}

/** 이 방에서 들을 배경 소리: 내가 고른 게 있으면 그것, 없으면 방 기본값 */
function applyNoise(r: RoomInfo) {
  const current = store.getRoomNoise(r.slug) ?? r.noise;
  sound.setNoise(current);
  ui.setNoise({ current, roomDefault: r.noise });
}

function pickNoise(id: NoiseId) {
  // 방 기본값을 다시 고르면 '내가 고른 것'을 지워요. 나중에 방 기본값이 바뀌면 그걸 따라가게
  if (id === room.noise) store.clearRoomNoise(room.slug);
  else store.setRoomNoise(room.slug, id);
  applyNoise(room);
}

// ── 방 고르기 · 옮기기 · 만들기 ─────────────────────
const JOIN_PROBLEM = {
  wrong: '비밀번호가 맞지 않아요.',
  error: '확인하지 못했어요. 잠시 뒤에 다시 해주세요.',
} as const;

/** 방에 들어갈 수 있는지. 비밀번호 방이고 아직 못 맞혔으면 비밀번호를 물어봐요. 못 들어가면 false */
async function unlockRoom(r: RoomInfo): Promise<boolean> {
  if (!r.hasPassword) return true;
  if (await net.hasRoomAccess(r)) return true;
  return ui.askRoomPassword(r.name, async (password) => {
    const result = await net.joinRoom(r.slug, password);
    return result === 'ok' ? null : JOIN_PROBLEM[result];
  });
}

async function pickRoom(slug: string, push = true) {
  const r = roomsCache.find((x) => x.slug === slug) ?? (await net.getRoom(slug));
  if (!r) {
    ui.toast('방을 찾을 수 없어요', 'bad');
    return;
  }
  ui.closeSheet();
  if (!self) {
    // 입장 전: 고르기만
    room = r;
    startInstance = 1;
    applyPlace(r);
    applyNoise(r);
    ui.setCurrentRoom(r, false);
    ui.setRoom(1);
    history.replaceState(null, '', roomAddress(r.slug));
    reloadRoomToday();
    await loadRoomCommits();
    return;
  }
  if (!(await unlockRoom(r))) {
    // 뒤로가기로 주소만 먼저 바뀐 경우, 지금 방 주소로 되돌려요
    if (!push) history.replaceState(null, '', room.slug === DEFAULT_ROOM ? '/' : `/r/${room.slug}`);
    return;
  }
  await switchRoom(r, push);
}

let switching = false;
async function switchRoom(r: RoomInfo, push = true) {
  if (switching || r.slug === room.slug) return;
  switching = true;
  room = r;
  // 이전 방 사람들은 조용히 정리 (퇴근 알림 없이)
  for (const id of [...world.avatars.keys()]) if (id !== self.id) world.removeAvatar(id, true);
  known.clear();
  lastMoves.clear();
  metThisSession.clear();
  ui.clearChat();
  ui.setPeers([]);
  // 장소가 다르면 3D 장면을 갈아끼움. 배치도가 바뀌니 연결(검사)보다 먼저
  applyPlace(r);
  applyNoise(r);
  useBusy = false;
  self.seat = null;
  self.x = SPAWN.x;
  self.z = SPAWN.z;
  self.joinedAt = Date.now();
  meAvatar().teleport(SPAWN.x, SPAWN.z, null);
  enteredAt = Date.now();
  lastDeploy = 0;
  ui.setCurrentRoom(r, false);
  ui.setRoom(1);
  if (push) history.pushState(null, '', roomAddress(r.slug));
  void loadRoomCommits();
  await Promise.race([net.switchRoom(r), wait(8000)]);
  switching = false;
  roomTime?.enter(r.slug);
  reloadRoomToday(ROOM_TODAY_AFTER_ENTER_MS);
  ui.toast(enteredMessage(r), 'good', 4200);
  await wait(600);
  autoSeat(false);
}

let lastRoomCreate = 0;
async function createRoom({ name, tags, isPublic, place, noise, password = '' }: RoomDraft): Promise<string | null> {
  const nm = name.trim().slice(0, 24);
  if (!nm) return '방 이름을 적어주세요.';
  if (hasBadWord(nm)) return `${BLOCKED_WORDS_REASON} 다른 이름으로 적어주세요.`;
  if (!isPlaceId(place)) return '장소를 골라주세요.';
  if (!isNoiseId(noise)) return '배경 소리를 골라주세요.';
  if (Date.now() - lastRoomCreate < 30e3) return '방은 30초에 하나씩 만들 수 있어요.';
  const hasPassword = password !== '';
  if (hasPassword) {
    if (!net.canLockRooms) return '비밀번호 방은 지금 만들 수 없어요. 실시간 서버에 연결됐을 때 다시 해주세요.';
    const problem = roomPasswordProblem(password);
    if (problem) return problem;
  }
  let r: RoomInfo;
  try {
    // 비공개 방이 꺼져 있으면 화면과 상관없이 항상 공개 방으로 만듦
    // 비밀번호 방은 목록에 보이는 공개 방이에요 (들어올 때 비밀번호로 막아요)
    const listed = hasPassword || isPublic || !PRIVATE_ROOMS_ENABLED;
    r = await net.createRoom({ name: nm, tags: tags.slice(0, 3), isPublic: listed, place, noise, creator: self?.name ?? profile.name, password: hasPassword ? password : undefined });
  } catch (e) {
    console.warn(e);
    if (isBlockedWordsError(e)) return `${BLOCKED_WORDS_REASON} 방 이름이나 닉네임을 바꿔주세요.`;
    return '방을 만들지 못했어요. 잠시 후 다시 해주세요.';
  }
  lastRoomCreate = Date.now();
  roomsCache = [r, ...roomsCache];
  ui.setRooms(roomsCache);
  ui.closeSheet();
  if (self) await switchRoom(r);
  else await pickRoom(r.slug);
  ui.toast(createdMessage(r), 'good', 6000);
  return null;
}

/** 방을 옮겼을 때: 오늘 기록이 있으면 같이 알려줘요 (지금 아무도 없어도 다들 다녀간 곳이라는 걸) */
function enteredMessage(r: RoomInfo): string {
  const today = ui.roomTodayOf(r.slug);
  return hasRoomRecord(today) ? `🚪 ${r.name}에 들어왔어요. ${roomTodaySentence(today)}` : `🚪 ${r.name}에 들어왔어요`;
}

/** 방을 만든 뒤 안내. 토스 앱은 주소창이 없어서 🔗(토스 공유 시트)로 보내게 해요 */
function createdMessage(r: RoomInfo): string {
  const head = `"${r.name}" 방을 만들었어요. 🔗 버튼으로 친구에게 보내면 바로 이 방으로 들어와요.`;
  if (r.hasPassword) return `${head} 비밀번호도 함께 알려주세요. 비밀번호는 만든 뒤에 바꿀 수 없어요.`;
  return head;
}

addEventListener('popstate', () => {
  const slug = roomFromUrl().slug ?? DEFAULT_ROOM;
  if (slug !== room.slug) void pickRoom(slug, false);
});

function takenSeats() {
  const set = new Set<string>();
  for (const a of world.avatars.values()) if (a.id !== self?.id && a.state.seat) set.add(a.state.seat);
  return set;
}

function meAvatar() {
  return world.avatars.get(self.id)!;
}

// ── 3. 내 행동 ───────────────────────────────────
function moveTo(x: number, z: number, then?: () => void) {
  useBusy = false; // 다른 데로 가면 먹으러 가던 건 취소
  self.seat = null;
  self.x = x;
  self.z = z;
  meAvatar().goTo(x, z, null, then);
  net.send({ type: 'move', id: self.id, x, z, seat: null });
  net.updateSelf({ seat: null, x, z });
  syncTraceVisibility();
}

function sitAt(id: string) {
  const s = seatById(id);
  if (!s) return;
  if (self.seat === id) return;
  useBusy = false;
  self.seat = id;
  self.seatAt = Date.now();
  self.x = s.x;
  self.z = s.z;
  meAvatar().goTo(s.x, s.z, id);
  net.send({ type: 'move', id: self.id, x: s.x, z: s.z, seat: id });
  net.updateSelf({ seat: id, seatAt: self.seatAt, x: s.x, z: s.z });
  syncTraceVisibility();
}

function setStatus(id: string) {
  self.status = id;
  meAvatar().apply(self);
  ui.setSelf(self);
  net.updateSelf({ status: id });
}

/** 저장하는 프로필 모양만 골라냄. self에는 자리·위치 같은 실시간 값도 있어서 통째로 저장하지 않아요 */
/** 옷장 미리보기에 쓰는 아바타 바탕. 입장 화면에서도 쓰니까 self에 기대지 않아요 */
function previewBase(look: Look): PeerState {
  return { id: 'preview', name: '', lang: store.getProfile().lang, status: 'coding', seat: null, seatAt: 0, x: 0, z: 0, coffee: 0, joinedAt: 0, studySince: 0, ...look };
}

function profileOf(s: PeerState): store.Profile {
  return { id: s.id, name: s.name, color: s.color, lang: s.lang, hair: s.hair, skin: s.skin, glasses: s.glasses, outfit: s.outfit };
}

/** 옷장에서 고를 때마다: 저장하고, 내 아바타에 입히고, 방 사람들에게 알림 (Presence 전송은 online.ts가 모아서 보내요) */
function changeLook(look: Look) {
  Object.assign(self, look);
  store.saveProfile(profileOf(self));
  meAvatar().apply(self);
  ui.setSelf(self);
  net.updateSelf(look);
}

/** 춤추기, 노트북 던지기 같은 큰 동작. 하던 동작이 끝나야 다음 동작을 할 수 있어요 */
function act(id: ActionId) {
  const me = meAvatar();
  if (me.acting) {
    ui.toast('아직 하던 동작이 안 끝났어요');
    return;
  }
  me.perform(id);
  sound.pop();
  net.send({ type: 'act', id: self.id, act: id });
}

function emote(id: string, to?: string) {
  const e = emoteById(id);
  if (!e) return;
  meAvatar().emote(e.emoji, e.label);
  sound.pop();
  net.send({ type: 'emote', id: self.id, emote: id, to });
}

/** 채팅 글을 방명록에 남길 때 붙는 커밋 종류 */
const CHAT_PIN_COMMIT_TYPE = 'chore';

let lastChat = 0;
/**
 * 방 사람들에게 한마디(말풍선). 보낼 수 없으면 이유를 돌려줘요. 커밋 입력과 같은 방식이에요.
 * to를 주면 그 사람에게만 보이는 귓속말이 돼요 (로그인이 없어서 이 방문 동안만 가요. 암호화는 안 돼요)
 */
function chat(text: string, to?: string): string | null {
  const waitMs = CHAT_SEND_GAP_MS - (Date.now() - lastChat);
  if (waitMs > 0) return `조금만 천천히요. ${Math.ceil(waitMs / 1000)}초 뒤에 보낼 수 있어요.`;
  if (hasBadWord(text)) return `${BLOCKED_WORDS_REASON} 다른 말로 적어주세요.`;
  const msg = text.slice(0, CHAT_MAX_LENGTH);
  lastChat = Date.now();
  meAvatar().say(msg);
  sound.pop();
  const whisperWith = to ? (world.avatars.get(to)?.state.name ?? '상대방') : undefined;
  ui.addChat({ name: self.name, lang: self.lang, text: msg, mine: true, whisperWith });
  net.send({ type: 'chat', id: self.id, text: msg, to });
  return null;
}

/** 먹고 마시기: 카페는 커피, 서버실은 자판기, 원룸은 컵라면, 해커톤장은 피자 */
let useBusy = false;
function useItem() {
  if (useBusy) return;
  const slug = room.slug;
  const u = placeMeta(room.place).use;
  const amb = places.placeDef(room.place).ambience;
  moveTo(SPOTS.use.x, SPOTS.use.z, async () => {
    if (!useBusy || room.slug !== slug) return;
    sound.use(amb);
    meAvatar().say(u.making);
    await wait(2600);
    if (!useBusy || room.slug !== slug) return;
    useBusy = false;
    const n = store.addCoffee();
    self.coffee = n;
    meAvatar().sip();
    net.updateSelf({ coffee: n });
    net.send({ type: 'coffee', id: self.id });
    ui.toast(`${pick(u.lines)} · 오늘 ${n}${u.unit}`, 'good');
    if (n >= 5) window.setTimeout(() => ui.toast(room.place === 'cafe' ? '카페인 5잔 넘었어요. 물도 한 잔 마셔요 💧' : '오늘 많이 먹었어요. 물도 한 잔 마셔요 💧'), 1800);
  });
  useBusy = true;
}

let lastDeploy = 0;
async function pressDeploy() {
  if (Date.now() - lastDeploy < 60e3) {
    ui.toast('방금 장애 나서 롤백했어요. 1분만 참아주세요.');
    return;
  }
  const d = placeMeta(room.place).deploy;
  const cafe = room.place === 'cafe';
  const fri = isFridayKST();
  const ok = await ui.confirm(
    cafe && fri ? '진짜 금요일인데 배포하시겠어요?' : d.confirmTitle,
    cafe ? (fri ? '오늘은 진짜 금요일이에요. 주말이 위험해요.' : `오늘은 ${weekdayKST()}이지만, 이 버튼은 언제 눌러도 금요일 배포예요. 방에 있는 모두에게 장애 경보가 울려요.`) : d.confirmBody,
    d.yes,
    d.no,
  );
  if (!ok) {
    ui.toast(d.calm);
    return;
  }
  moveTo(SPOTS.deploy.x, SPOTS.deploy.z, () => {
    meAvatar().press();
    window.setTimeout(() => {
      net.send({ type: 'deploy', id: self.id, name: self.name });
      triggerDeploy(self.name);
    }, 350);
  });
}

function triggerDeploy(name: string) {
  if (Date.now() - lastDeploy < 60e3) return;
  lastDeploy = Date.now();
  const sec = 7;
  const d = placeMeta(room.place).deploy;
  world.room.alarm(sec);
  sound.siren(sec - 0.5);
  ui.alarm(d.alarm.replace('{name}', name), sec);
  let i = 0;
  for (const a of world.avatars.values()) {
    const e = pick(['🔥 불났다', '🤯 뭐야', '🙏 롤백 제발', '😱 내 코드 아님']);
    window.setTimeout(() => a.emote(e.split(' ')[0], e.slice(e.indexOf(' ') + 1)), 300 + i++ * 180);
  }
  window.setTimeout(() => {
    ui.toast(d.done, 'good', 4200);
    sound.chime();
  }, sec * 1000 + 300);
}

let lastCommit = 0;
/** 이번에 내가 남긴 커밋 (내 커밋은 신고하지 않게) */
const myCommitHashes = new Set<string>();

/** 커밋 신고: 확인을 받고, 나에게는 바로 가리고, 서로 다른 사람 REPORTS_TO_HIDE명이 신고하면 DB가 모두에게서 숨겨요 */
async function reportCommit(c: Commit) {
  if (myCommitHashes.has(c.hash)) return;
  const ok = await ui.confirm(
    '이 커밋을 신고할까요?',
    `"${c.msg}" (${c.name})\n\n신고하면 나에게는 바로 가려져요. 서로 다른 ${REPORTS_TO_HIDE}명이 신고하면 모두에게서 가려져요. 욕설, 성적인 말, 혐오 표현, 정치 이야기처럼 방명록에 맞지 않는 글을 신고해 주세요.`,
    '신고하기',
    '취소',
  );
  if (!ok) return;
  store.addReportedCommit(room.slug, c.hash);
  showCommits(commits);
  try {
    const hidden = await net.reportCommit(c.hash, self.id);
    ui.toast(
      hidden ? `🚩 신고했어요. ${REPORTS_TO_HIDE}명이 신고해서 모두에게서 가렸어요.` : '🚩 신고했어요. 고마워요. 나에게는 바로 가렸어요.',
      'good',
      4200,
    );
  } catch (e) {
    console.warn(e);
    const tooMany = e instanceof Error && e.message.includes('too many reports');
    ui.toast(tooMany ? '신고가 너무 잦아요. 잠시 후 다시 해주세요. (나에게는 가려졌어요)' : '신고를 보내지 못했어요. 나에게만 가려졌어요.', 'bad', 4200);
  }
}

async function commit(type: string, msg: string): Promise<string | null> {
  if (Date.now() - lastCommit < 30e3) return `커밋은 30초에 한 번씩 남길 수 있어요. ${Math.ceil((30e3 - (Date.now() - lastCommit)) / 1000)}초 남았어요.`;
  if (hasBadWord(msg)) return `${BLOCKED_WORDS_REASON} 다른 말로 적어주세요.`;
  if (hasBadWord(self.name)) return `닉네임에 쓸 수 없는 말이 있어서 커밋을 남길 수 없어요. ⚙️에서 닉네임을 바꿔주세요.`;
  const full = type === 'wip' ? `wip: ${msg}` : `${type}: ${msg}`;
  const c: Commit = { hash: randomHash(), name: self.name, msg: full.slice(0, 72), lang: self.lang, at: Date.now() };
  try {
    await net.postCommit(c);
  } catch (e) {
    console.warn(e);
    if (isBlockedWordsError(e)) return `${BLOCKED_WORDS_REASON} 다른 말로 적어주세요.`;
    return '커밋을 저장하지 못했어요. 잠시 후 다시 해주세요.';
  }
  lastCommit = Date.now();
  myCommitHashes.add(c.hash);
  addCommit(c);
  meAvatar().emote('⎇', 'commit!');
  ui.toast(`[main ${c.hash}] ${c.msg}`, 'good');
  return null;
}

function addCommit(c: Commit) {
  if (commits.some((x) => x.hash === c.hash) || store.getReportedCommits(room.slug).has(c.hash)) return;
  commits = [c, ...commits].slice(0, 30);
  world.room.gitlog.draw(commits, room.name);
  ui.setCommits(commits, myCommitHashes);
}

// ── 5. 다른 사람들 ───────────────────────────────
const known = new Map<string, PeerState>();

/** 이번 접속에서 이미 '만남'으로 기록한 사람들 (같은 접속 동안 여러 번 세지 않게) */
const metThisSession = new Set<string>();

/** Broadcast로 받은 가장 최근 이동. Presence는 PRESENCE_LAG_MS까지 늦을 수 있어서, 그 안에는 이쪽이 더 새로워요 */
const lastMoves = new Map<string, { at: number; x: number; z: number; seat: string | null }>();

/** Presence가 최근 이동을 아직 못 따라왔을 수 있어서, 그 사이엔 Broadcast로 받은 위치·자리로 덮어써요 */
function withLatestMove(p: PeerState): PeerState {
  const m = lastMoves.get(p.id);
  if (!m || Date.now() - m.at > PRESENCE_LAG_MS) return p;
  // 자리가 바뀌었으면 Presence의 seatAt은 옛 자리 것이라, 이동 이벤트를 받은 시각으로 대신해요
  let seatAt = p.seatAt;
  if (m.seat !== p.seat) seatAt = m.seat ? m.at : 0;
  return { ...p, x: m.x, z: m.z, seat: m.seat, seatAt };
}

function onPeers(presencePeers: PeerState[]) {
  if (!world || !self) return;
  const peers = presencePeers.map(withLatestMove);
  const ids = new Set(peers.map((p) => p.id));
  for (const p of peers) {
    if (!metThisSession.has(p.id)) {
      metThisSession.add(p.id);
      store.markPeerMet(p.id);
    }
    const prev = known.get(p.id);
    let a = world.avatars.get(p.id);
    if (!a) {
      const fresh = enteredAt && Date.now() - enteredAt > 2500 && p.joinedAt > enteredAt - 1000;
      if (fresh) {
        // 방금 들어온 사람: 문에서 걸어 들어옴
        a = world.addAvatar({ ...p, seat: null, x: SPAWN.x, z: SPAWN.z }, false);
        a.state.seat = p.seat;
        if (p.seat) a.goTo(p.x, p.z, p.seat);
        else if (p.x !== SPAWN.x || p.z !== SPAWN.z) a.goTo(p.x, p.z);
        ui.toast(`👋 ${p.name}님이 모각코에 들어왔어요`);
      } else {
        a = world.addAvatar(p, false);
      }
    } else {
      a.apply(p);
      if (prev && (prev.seat !== p.seat || (!p.seat && (prev.x !== p.x || prev.z !== p.z)))) {
        if (a.seatId !== p.seat || !p.seat) a.goTo(p.x, p.z, p.seat);
      }
    }
    known.set(p.id, { ...p });

    // 같은 자리를 먼저 잡은 사람이 있으면 내가 양보
    if (self.seat && p.seat === self.seat && p.seatAt < self.seatAt) {
      const s = seatById(self.seat)!;
      ui.toast('앗, 누가 먼저 앉았어요. 다른 자리를 골라주세요.');
      moveTo(s.ax, s.az);
    }
  }
  for (const id of [...world.avatars.keys()]) {
    if (id === self.id || ids.has(id)) continue;
    const name = known.get(id)?.name;
    world.removeAvatar(id);
    known.delete(id);
    lastMoves.delete(id);
    if (name) ui.toast(`${name}님이 퇴근했어요`);
  }
  ui.setPeers(peers);
  syncTraceVisibility();
}

function onEvent(e: NetEvent) {
  if (!world) return;
  switch (e.type) {
    case 'move': {
      const a = world.avatars.get(e.id);
      if (!a || a.isSelf) return;
      a.state.seat = e.seat;
      a.state.x = e.x;
      a.state.z = e.z;
      a.goTo(e.x, e.z, e.seat);
      lastMoves.set(e.id, { at: Date.now(), x: e.x, z: e.z, seat: e.seat });
      syncTraceVisibility();
      const k = known.get(e.id);
      if (k) Object.assign(k, { seat: e.seat, x: e.x, z: e.z });
      break;
    }
    case 'emote': {
      const a = world.avatars.get(e.id);
      const em = emoteById(e.emote);
      if (!a || !em) return;
      a.emote(em.emoji, em.label);
      if (e.to && e.to === self?.id) ui.toast(`${a.state.name}님이 손을 흔들었어요 👋`, 'good');
      break;
    }
    case 'act': {
      const a = world.avatars.get(e.id);
      if (!a || a.isSelf) return;
      a.perform(e.act);
      break;
    }
    case 'chat': {
      const a = world.avatars.get(e.id);
      if (!a || a.isSelf) return;
      if (e.to && e.to !== self.id) return; // 나한테 온 귓속말이 아니면 못 본 척해요
      a.say(e.text);
      ui.addChat({ name: a.state.name, lang: a.state.lang, text: e.text, mine: false, whisperWith: e.to ? a.state.name : undefined });
      break;
    }
    case 'deploy':
      triggerDeploy(e.name);
      break;
    case 'commit':
      addCommit(e.commit);
      ui.toast(`⎇ ${e.commit.name}: ${e.commit.msg}`);
      break;
    case 'coffee':
      world.avatars.get(e.id)?.sip();
      break;
    case 'typing':
      world.avatars.get(e.id)?.typeBurst();
      break;
  }
}

// ── 6. 3D 클릭 ───────────────────────────────────
function bindWorld() {
  world.setHandlers({
    onViewState: (state) => ui.setViewState(state),
    onFloor: (x, z) => {
      if (!self) return;
      ui.hidePop();
      moveTo(x, z);
    },
    onSeat: (id) => {
      if (!self) return;
      if (takenSeats().has(id)) {
        ui.toast('누가 앉아 있는 자리예요');
        return;
      }
      sitAt(id);
    },
    onInteract: (d) => {
      if (!self) return;
      interact(d);
    },
    onAvatar: (id, pt) => {
      const a = world.avatars.get(id);
      if (!a) return;
      ui.showPop(a.isSelf ? self : a.state, pt.x, pt.y, a.isSelf);
    },
  });
}

/** 3D 물건을 눌렀을 때. 무엇을 할지는 장소 파일(src/world/places/*)이 물건마다 붙여둔 정보로 정해요 */
function interact(d: InteractData) {
  switch (d.interact) {
    case 'use':
      useItem();
      break;
    case 'deploy':
      void pressDeploy();
      break;
    case 'tv':
      ui.openSheet('commit');
      break;
    case 'pet':
      if (d.sound === 'meow') sound.meow();
      else sound.quack();
      if (d.key) world.room.poke(d.key);
      if (d.lines?.length) ui.toast(d.sound === 'quack' ? `🦆 ${pick(d.lines)}` : pick(d.lines), 'info', 4200);
      break;
    case 'note':
      if (d.lines?.length) ui.toast(fillNote(pick(d.lines)), 'info', 4200);
      break;
  }
}

/** 문구 속 {sleepHours}: 지금 자면 아침 9시(KST)까지 몇 시간 잘 수 있는지 */
function fillNote(line: string) {
  if (!line.includes('{sleepHours}')) return line;
  const kst = new Date(Date.now() + 9 * 3600e3);
  const nine = new Date(kst);
  nine.setUTCHours(9, 0, 0, 0);
  if (nine <= kst) nine.setUTCDate(nine.getUTCDate() + 1);
  const hours = Math.round(((nine.getTime() - kst.getTime()) / 3600e3) * 2) / 2;
  return line.replace('{sleepHours}', String(hours));
}

// ── 7. 매 프레임 / 주기 작업 ───────────────────────
/** 방 사람들에게 알린 기준 시각이 실제 누적과 이만큼 넘게 어긋나면 다시 알려요 (자정이 지났을 때 등) */
const STUDY_SINCE_DRIFT_MS = 30e3;

/**
 * 오늘 누적 시간에 더해요 (studyClock.ts가 실제 시각으로 불러요).
 * 방 사람들에게는 매번 보내지 않아요. 기준 시각(studySince)을 한 번 알면 각자 화면에서 계산해요
 */
function addStudyTime(ms: number) {
  const total = store.addStudyMs(ms);
  store.addSyncMineMs(ms);
  ui.setStudyToday(total);
  const now = Date.now();
  if (Math.abs(studyTodayAt(self.studySince, now) - total) > STUDY_SINCE_DRIFT_MS) shareStudyTime(total, now);
}

/** studyClock이 실제로 흐른 시간을 알려줄 때: 오늘 누적, 정각 세션, 방·자리 기록에 각각 나눠 줘요 */
function onStudyElapsed(ms: number) {
  addStudyTime(ms);
  if (sessionAt(Date.now()).phase === 'focus') focusedThisSession += ms;
  roomTime?.add(ms);
  seatTime?.add(ms, room.slug, self.seat);
}

/** 노트북을 덮었다 연 것처럼 오래 멈췄던 시간은 오늘 누적에도, 이 방에 있은 시간(⏱)에도 넣지 않아요 */
function skipAsleepTime(ms: number) {
  const now = Date.now();
  self.joinedAt = Math.min(now, self.joinedAt + ms);
  shareStudyTime(store.getStudyMsToday(), now);
}

function shareStudyTime(todayMs: number, now: number) {
  self.studySince = studySinceFor(todayMs, now);
  ui.setSelf(self);
  net.updateSelf({ studySince: self.studySince, joinedAt: self.joinedAt });
}

let secT = 0;
let keysT = 3;
let tagT = 0;
function onFrame(dt: number) {
  secT += dt;
  if (secT >= 1) {
    secT = 0;
    ui.tickSince();
  }
  if (!self) return;
  // 멀리서 들리는 다른 사람들 타자 소리
  keysT -= dt;
  if (keysT <= 0) {
    const coders = [...world.avatars.values()].filter((a) => !a.isSelf && a.seated && a.state.status !== 'away' && a.state.status !== 'meal').length;
    if (coders > 0) sound.distantKeys(2 + Math.floor(Math.random() * Math.min(8, coders * 2)));
    keysT = 1.2 + Math.random() * (6 / Math.max(1, coders));
  }
  // 집중 남은 시간 표시 갱신
  tagT += dt;
  if (tagT > 20) {
    tagT = 0;
    for (const a of world.avatars.values()) a.renderTag();
  }
}

// ── 정각 세션 ─────────────────────────────────────
/** 세션 끝 토스트 다음에 안내 토스트를 띄우기까지 */
const NUDGE_DELAY_MS = 2500;

/** 이번 집중 시간에 실제로 있었던 시간(ms). SESSION_DONE_MIN_MS를 넘기면 세션 하나를 끝낸 걸로 쳐요 */
let focusedThisSession = 0;

/** 집중 ↔ 휴식이 바뀔 때: 끝낸 세션을 세고, 알림음과 함께 알려줘요. 입장 전에는 조용히 */
function onSessionPhaseChange(next: SessionState, prev: SessionState) {
  const finished = prev.phase === 'focus' && focusedThisSession >= SESSION_DONE_MIN_MS;
  focusedThisSession = 0;
  if (!self) return;
  sound.chime();
  if (next.phase === 'focus') {
    ui.toast(`${hourLabel(next.hour)} 정각이에요. ${FOCUS_MINUTES}분 동안 같이 집중해요`, 'good', 5000);
    return;
  }
  const nextStart = hourLabel((next.hour + 1) % 24);
  if (finished) {
    const n = store.addSessionDone();
    meAvatar().emote('✅', `${n}칸째`);
    ui.toast(`오늘 ${n}칸째 채웠어요. ${BREAK_MINUTES}분 쉬고 ${nextStart}에 다시 시작해요`, 'good', 6000);
    // 한 칸 채운 직후에 안내를 하나만: 아직 내 시간을 안 정했으면 그것부터, 아니면 이어하기
    if (store.getMyHour() === null && store.takeMyHourNudge()) {
      window.setTimeout(() => ui.toast("내일도 이 시간에 올 거면 왼쪽 위 '집중' 버튼에서 매일 오는 시간을 정해 두세요", 'info', 7000), NUDGE_DELAY_MS);
    } else if (shouldNudgeSync()) {
      window.setTimeout(() => ui.toast('📱 오늘 기록은 이 브라우저에만 남아요. 회사·집, 폰에서도 이어 쓰려면 오른쪽 위 👤에서 이어하기를 켜 두세요', 'info', 8000), NUDGE_DELAY_MS);
    }
    return;
  }
  ui.toast(`쉬는 시간이에요. ${nextStart}에 다시 시작해요`, 'info', 5000);
}

watchSession({ onTick: (s) => ui.setSession(s), onPhaseChange: onSessionPhaseChange });

// 탭을 숨기거나 닫기 직전에 모아 둔 시간을 보내요 (닫히면 1분 미만은 버려져요)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden') return;
  void roomTime?.flush();
  void seatTime?.flush();
});

// 진짜 키보드를 치면 내 아바타도 열심히 침 (무슨 키인지는 안 봐요)
addEventListener('keydown', (e) => {
  if (!self || !world || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target as HTMLElement;
  if (t.closest('input, textarea, select, [contenteditable]')) return;
  const me = meAvatar();
  if (!me.seated) return;
  me.typeBurst();
  sound.key(0.12);
});

// ── 유틸 ─────────────────────────────────────────
function weekdayKST() {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', weekday: 'long' }).format(new Date());
}
function isFridayKST() {
  return weekdayKST() === '금요일';
}

// ── 시작 ─────────────────────────────────────────
ui.bind({
  onEnter: (p) => void enter(p),
  onStatus: setStatus,
  onEmote: (id) => emote(id),
  onAct: act,
  onLook: changeLook,
  onView: (cmd) => world.viewCommand(cmd),
  onLookPreview: async (look) => {
    // 미리보기용 3D 코드는 옷장을 처음 열 때 받아요
    const { LookPreview } = await import('./world/lookPreview');
    return new LookPreview(previewBase(look));
  },
  onCoffee: useItem,
  onCommit: commit,
  onChat: chat,
  onChatPin: (text) => commit(CHAT_PIN_COMMIT_TYPE, text),
  onSound: (on) => {
    store.setSound(on);
    sound.setEnabled(on);
    if (on) sound.start();
  },
  onNoise: pickNoise,
  onShare: async () => {
    try {
      await shareRoom(room.slug, room.name);
      if (room.hasPassword) ui.toast('🔒 받은 사람이 들어오려면 비밀번호도 필요해요. 비밀번호는 따로 알려주세요.', 'info', 5000);
    } catch (e) {
      console.warn(e);
      ui.toast('공유 링크를 만들지 못했어요. 잠시 후 다시 해주세요.', 'bad');
    }
  },
  onPickRoom: (slug) => void pickRoom(slug),
  onCreateRoom: createRoom,
  onUnlockRoom: async () => {
    const unlocked = await unlockRoom(room);
    // 비밀번호 방의 방명록은 열쇠가 있어야 읽혀서, 맞힌 직후에 다시 읽어요
    if (unlocked && room.hasPassword) void loadRoomCommits();
    return unlocked;
  },
  onProfileSave: (p) => {
    store.saveProfile(p);
    Object.assign(self, p);
    meAvatar().apply(self);
    ui.setSelf(self);
    net.updateSelf({ name: p.name, color: p.color, lang: p.lang, hair: p.hair, skin: p.skin, glasses: p.glasses, outfit: p.outfit });
    ui.toast('프로필을 바꿨어요');
  },
  onReportCommit: (c) => void reportCommit(c),
  onSyncCreate: createSyncCode,
  onSyncJoin: joinSyncCode,
  onSyncUnlink: () => void unlinkSync(),
  onSyncErase: () => void eraseSync(),
  onSyncCopy: (what) => void copySync(what),
  onSyncShare: () => void shareSyncLink(),
  onSyncOpenExternal: openSyncExternal,
  onReplayTips: showTips,
  onWave: (id) => {
    emote('wave', id);
    const a = world.avatars.get(id);
    if (a) ui.toast(`${a.state.name}님에게 손을 흔들었어요`);
  },
  onFocusPeer: (id) => {
    const a = world.avatars.get(id);
    if (!a) return;
    const p = world.toScreen(a.position.clone().setY(1.6));
    ui.showPop(a.isSelf ? self : a.state, p.x, p.y, a.isSelf);
  },
});

ui.tickSince();
boot()
  .then(bindWorld)
  .catch((err) => {
    console.error(err);
    ui.toast('3D 화면을 불러오지 못했어요. 새로고침하거나 다른 브라우저로 열어주세요.', 'bad', 10000);
  });

// 디버그용
Object.assign(window, { __mogakco: { get world() { return world; }, get self() { return self; }, statusById, triggerDeploy, emote, interact } });
