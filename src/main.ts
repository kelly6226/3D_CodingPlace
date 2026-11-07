import './style.css';
import {
  CHAT_MAX_LENGTH,
  CHAT_SEND_GAP_MS,
  CONTEXT_LOSS_TOAST_MS,
  DEFAULT_ROOM,
  PRESENCE_LAG_MS,
  PRIVATE_ROOMS_ENABLED,
  ROOM_SLUG_RE,
  builtinRoom,
  emoteById,
  isPlaceId,
  pageTitle,
  placeMeta,
  roomAddress,
  statusById,
  type ActionId,
  type PlaceId,
  type RoomInfo,
} from './config';
import { entryRoomParam, shareRoom } from './toss';
import type { Look } from './look';
import { sound } from './audio';
import { hasBadWord } from './net/badwords';
import { DemoNet, randomHash } from './net/demo';
import type { Commit, Net, NetEvent, PeerState } from './net/types';
import * as store from './store';
import { UI } from './ui/ui';
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

// ── 1. 폰트 → 3D 장면 준비 ─────────────────────────
async function boot() {
  ui.setProgress(0.1);
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

  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;
  if (url && key && params.get('demo') !== '1') {
    const { OnlineNet } = await import('./net/online');
    net = new OnlineNet(url, key, profile.id);
  } else {
    net = new DemoNet();
  }
  ui.setMode(net.mode);

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
  net.watchCounts((c) => ui.setCounts(c));
  await loadRoomCommits();
  ui.ready();
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
  commits = list;
  world.room.gitlog.draw(commits, room.name);
  ui.setCommits(commits);
  document.title = pageTitle(room);
}

// ── 2. 입장 ──────────────────────────────────────
async function enter(p: store.Profile) {
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
  };
  world.addAvatar(self, true);
  ui.setSelf(self);

  const connecting = net.connect(
    self,
    {
      onPeers,
      onEvent,
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
        ui.clearChat();
        ui.toast(`자리가 꽉 차서 ${n}호점으로 안내했어요`);
      },
    },
    room,
    startInstance,
  );
  // 연결이 늦어도 방 구경은 먼저 할 수 있게
  await Promise.race([connecting, wait(8000)]);
  if (room.slug !== DEFAULT_ROOM || roomFromUrl().slug) history.replaceState(null, '', roomAddress(room.slug));

  await wait(700);
  autoSeat(true);
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

// ── 방 고르기 · 옮기기 · 만들기 ─────────────────────
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
    ui.setCurrentRoom(r, false);
    ui.setRoom(1);
    history.replaceState(null, '', roomAddress(r.slug));
    await loadRoomCommits();
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
  ui.clearChat();
  ui.setPeers([]);
  // 장소가 다르면 3D 장면을 갈아끼움. 배치도가 바뀌니 연결(검사)보다 먼저
  applyPlace(r);
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
  ui.toast(`🚪 ${r.name}에 들어왔어요`, 'good');
  await wait(600);
  autoSeat(false);
}

let lastRoomCreate = 0;
async function createRoom(name: string, tags: string[], isPublic: boolean, place: PlaceId): Promise<string | null> {
  const nm = name.trim().slice(0, 24);
  if (!nm) return '방 이름을 적어주세요.';
  if (hasBadWord(nm)) return '욕설이 들어 있어서 쓸 수 없어요. 다른 이름으로 적어주세요.';
  if (!isPlaceId(place)) return '장소를 골라주세요.';
  if (Date.now() - lastRoomCreate < 30e3) return '방은 30초에 하나씩 만들 수 있어요.';
  let r: RoomInfo;
  try {
    // 비공개 방이 꺼져 있으면 화면과 상관없이 항상 공개 방으로 만듦
    r = await net.createRoom({ name: nm, tags: tags.slice(0, 3), isPublic: isPublic || !PRIVATE_ROOMS_ENABLED, place, creator: self?.name ?? profile.name });
  } catch (e) {
    console.warn(e);
    return '방을 만들지 못했어요. 잠시 후 다시 해주세요.';
  }
  lastRoomCreate = Date.now();
  roomsCache = [r, ...roomsCache];
  ui.setRooms(roomsCache);
  ui.closeSheet();
  if (self) await switchRoom(r);
  else await pickRoom(r.slug);
  ui.toast(`"${r.name}" 방을 만들었어요. 🔗 버튼으로 친구에게 보내면 바로 이 방으로 들어와요.`, 'good', 6000);
  return null;
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
  return { id: 'preview', name: '', lang: store.getProfile().lang, status: 'coding', seat: null, seatAt: 0, x: 0, z: 0, coffee: 0, joinedAt: 0, ...look };
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
/** 방 사람들에게 한마디(말풍선). 보낼 수 없으면 이유를 돌려줘요. 커밋 입력과 같은 방식이에요 */
function chat(text: string): string | null {
  const waitMs = CHAT_SEND_GAP_MS - (Date.now() - lastChat);
  if (waitMs > 0) return `조금만 천천히요. ${Math.ceil(waitMs / 1000)}초 뒤에 보낼 수 있어요.`;
  if (hasBadWord(text)) return '욕설이 들어 있어서 보낼 수 없어요. 다른 말로 적어주세요.';
  const msg = text.slice(0, CHAT_MAX_LENGTH);
  lastChat = Date.now();
  meAvatar().say(msg);
  sound.pop();
  ui.addChat({ name: self.name, lang: self.lang, text: msg, mine: true });
  net.send({ type: 'chat', id: self.id, text: msg });
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
async function commit(type: string, msg: string): Promise<string | null> {
  if (Date.now() - lastCommit < 30e3) return `커밋은 30초에 한 번씩 남길 수 있어요. ${Math.ceil((30e3 - (Date.now() - lastCommit)) / 1000)}초 남았어요.`;
  if (hasBadWord(msg)) return '욕설이 들어 있어서 남길 수 없어요. 다른 말로 적어주세요.';
  const full = type === 'wip' ? `wip: ${msg}` : `${type}: ${msg}`;
  const c: Commit = { hash: randomHash(), name: self.name, msg: full.slice(0, 72), lang: self.lang, at: Date.now() };
  try {
    await net.postCommit(c);
  } catch (e) {
    console.warn(e);
    return '커밋을 저장하지 못했어요. 잠시 후 다시 해주세요.';
  }
  lastCommit = Date.now();
  addCommit(c);
  meAvatar().emote('⎇', 'commit!');
  ui.toast(`[main ${c.hash}] ${c.msg}`, 'good');
  return null;
}

function addCommit(c: Commit) {
  if (commits.some((x) => x.hash === c.hash)) return;
  commits = [c, ...commits].slice(0, 30);
  world.room.gitlog.draw(commits, room.name);
  ui.setCommits(commits);
}

// ── 5. 다른 사람들 ───────────────────────────────
const known = new Map<string, PeerState>();

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
      a.say(e.text);
      ui.addChat({ name: a.state.name, lang: a.state.lang, text: e.text, mine: false });
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
  onShare: async () => {
    try {
      await shareRoom(room.slug, room.name);
    } catch (e) {
      console.warn(e);
      ui.toast('공유 링크를 만들지 못했어요. 잠시 후 다시 해주세요.', 'bad');
    }
  },
  onPickRoom: (slug) => void pickRoom(slug),
  onCreateRoom: createRoom,
  onProfileSave: (p) => {
    store.saveProfile(p);
    Object.assign(self, p);
    meAvatar().apply(self);
    ui.setSelf(self);
    net.updateSelf({ name: p.name, color: p.color, lang: p.lang, hair: p.hair, skin: p.skin, glasses: p.glasses, outfit: p.outfit });
    ui.toast('프로필을 바꿨어요');
  },
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
