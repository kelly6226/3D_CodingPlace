// 1:1 채팅의 흐름: 요청 → 수락 → 대화
//
//   1) 내가 상대 아바타에게 요청해요 (방 채널로 'dm' req, 내 임시 공개 키를 실어서)
//   2) 상대가 수락하면 자기 공개 키를 알려줘요 (ok). 거절하면 no
//   3) 서로의 공개 키로 둘만 아는 비밀값을 만들고, 거기서 나온 이름의 채널에서 암호문으로 대화해요 (dm/crypto.ts)
//
// 로그인도 서버 규칙도 없어요. 대화가 새지 않는 건 "채널 이름과 암호 키를 둘만 안다"는 사실 하나에 기대요.
// 다만 "방 안의 이 아바타가 그 공개 키 주인"이라는 연결은 닉네임 수준으로만 믿을 수 있어요
// (답하는 척하는 사람이 끼어들 수 있어서, 두 화면에 같은 확인 코드가 뜨는지 비교할 수 있게 해요).
//
// 화면은 DmView(ui/dmPanel.ts), 네트워크는 Net이 맡고 여기서는 상태만 관리해요.
import { DM_MAX_INCOMING, DM_MAX_LENGTH, DM_MAX_OPEN, DM_REQUEST_TTL_MS, DM_SEND_GAP_MS } from '../config';
import { hasBadWord, maskBadWords } from '../net/badwords';
import type { DmCipher, DmEvent, DmHandlers, Net, NetEvent } from '../net/types';
import { text } from '../net/validate';
import * as store from '../store';
import { newKeyPair, openSession, type DmKeyPair, type DmSession } from './crypto';

export type DmState = 'requesting' | 'incoming' | 'open' | 'ended';

export interface DmConv {
  /** 상대 아바타 id. 대화를 가리키는 이름표로 써요 */
  key: string;
  name: string;
  /** 대화 채널 이름. 열려 있는 동안만 있어요 */
  topic: string | null;
  /** 두 화면에 똑같이 떠야 하는 확인 코드. 열려 있는 동안만 있어요 */
  code: string;
  state: DmState;
  /** 상대가 지금 이 대화에 들어와 있는지 */
  online: boolean;
  /** ended일 때 이유 */
  note: string;
}

export interface DmLine {
  mine: boolean;
  text: string;
  at: number;
}

export interface DmView {
  /** 대화를 만들거나 상태를 바꿔서 다시 그려요 */
  show(conv: DmConv): void;
  addLine(key: string, line: DmLine): void;
  /** 시스템 안내 줄 (상대가 나갔어요 등) */
  addNotice(key: string, text: string): void;
  remove(key: string): void;
  /** 이 대화를 화면에 열어요 (채팅 패널을 열고 1:1 탭에서 이 대화로) */
  open(key: string): void;
  setBlockedCount(n: number): void;
}

export interface DmDeps {
  net: Net;
  view: DmView;
  /** 내 아바타 id와 이름 */
  me(): { id: string; name: string };
  /** 방 채널로 이벤트를 보내요 */
  sendEvent(e: NetEvent): void;
  toast(text: string, kind?: 'info' | 'good' | 'bad'): void;
}

const UNAVAILABLE = '지금은 1:1 채팅을 쓸 수 없어요. 잠시 뒤에 다시 해주세요.';
const BAD_PEER_KEY = '상대 정보가 올바르지 않아 연결하지 못했어요.';
const LIMIT_REACHED = `1:1 채팅은 동시에 ${DM_MAX_OPEN}개까지 열 수 있어요. 하나를 닫고 다시 해주세요.`;

export class DmController {
  /** 상대 아바타 id → 대화 */
  private convs = new Map<string, DmConv>();
  /** 대화마다 쓰는 비밀들. 메모리에만 두고, 대화가 끝나면 지워요 */
  private pairs = new Map<string, DmKeyPair>();
  private peerKeys = new Map<string, string>();
  private sessions = new Map<string, DmSession>();
  private keyByTopic = new Map<string, string>();
  /** 채널별로 상대가 와 있는지. 대화가 열리기 전에 온 신호도 놓치지 않으려고 따로 기억해요 */
  private present = new Map<string, boolean>();
  private timers = new Map<string, number>();
  /** 채널을 여는 중인 대화 (같은 대화를 두 번 열지 않으려고) */
  private opening = new Set<string>();
  private blocked = new Set(store.getDmBlocked());
  private lastSendAt = 0;

  constructor(private deps: DmDeps) {
    deps.view.setBlockedCount(this.blocked.size);
  }

  // ── 내가 먼저 요청 ─────────────────────────────
  async start(peer: { id: string; name: string }) {
    const prev = this.convs.get(peer.id);
    if (prev && prev.state !== 'ended') {
      this.deps.view.open(peer.id);
      return;
    }
    if (this.activeCount() >= DM_MAX_OPEN) {
      this.deps.toast(LIMIT_REACHED, 'bad');
      return;
    }
    this.forget(peer.id);
    const pair = await this.makeKeyPair(peer.id);
    if (!pair) return;
    this.set({ key: peer.id, name: peer.name, topic: null, code: '', state: 'requesting', online: false, note: '' });
    const me = this.deps.me();
    this.deps.sendEvent({ type: 'dm', id: me.id, to: peer.id, stage: 'req', key: pair.publicKey, name: me.name });
    this.expireLater(peer.id);
    this.deps.view.open(peer.id);
  }

  // ── 방 채널로 온 요청·응답 ──────────────────────
  onEvent(e: DmEvent) {
    const me = this.deps.me();
    if (e.to !== me.id || e.id === me.id) return;
    if (e.stage === 'req') this.onRequest(e);
    else if (e.stage === 'ok') void this.onAccepted(e);
    else this.onDeclined(e);
  }

  private onRequest(e: DmEvent) {
    if (!e.key || this.blocked.has(e.id)) return;
    const prev = this.convs.get(e.id);
    const name = e.name ?? prev?.name ?? '익명의 개발자';
    if (prev?.state === 'open') return;
    if (prev?.state === 'requesting') {
      // 서로 동시에 요청했으면 물어보지 않고 바로 연결해요
      this.peerKeys.set(e.id, e.key);
      this.set({ ...prev, name });
      void this.accept(e.id);
      return;
    }
    if (prev?.state !== 'incoming' && this.incomingCount() >= DM_MAX_INCOMING) return;
    this.forget(e.id);
    this.peerKeys.set(e.id, e.key);
    this.set({ key: e.id, name, topic: null, code: '', state: 'incoming', online: false, note: '' });
    this.expireLater(e.id);
    this.deps.toast(`💬 ${name}님이 1:1 채팅을 요청했어요`);
  }

  private async onAccepted(e: DmEvent) {
    const c = this.convs.get(e.id);
    if (c?.state !== 'requesting' || !e.key) return;
    if (this.blocked.has(e.id)) {
      this.end(e.id, '차단한 사람이라 연결하지 않았어요.');
      return;
    }
    this.peerKeys.set(e.id, e.key);
    this.set({ ...c, name: e.name ?? c.name });
    await this.connect(e.id, false);
  }

  private onDeclined(e: DmEvent) {
    const c = this.convs.get(e.id);
    if (c?.state === 'requesting') this.end(e.id, '상대가 1:1 채팅을 거절했어요.');
  }

  // ── 받은 요청에 답하기 ─────────────────────────
  async accept(key: string) {
    const c = this.convs.get(key);
    if (!c || (c.state !== 'incoming' && c.state !== 'requesting') || !this.peerKeys.has(key)) return;
    if (this.activeCount(key) >= DM_MAX_OPEN) {
      this.deps.toast(LIMIT_REACHED, 'bad');
      return;
    }
    if (!this.pairs.has(key) && !(await this.makeKeyPair(key))) return;
    await this.connect(key, true);
  }

  /** 거절하면 상대에게 알려주고 대화를 지워요. block이면 이 사람의 요청은 앞으로 무시해요 */
  decline(key: string, block = false) {
    const c = this.convs.get(key);
    if (!c) return;
    if (c.state === 'incoming') this.deps.sendEvent({ type: 'dm', id: this.deps.me().id, to: key, stage: 'no' });
    if (block) this.addBlock(key);
    this.close(key);
  }

  /** 열려 있는 대화에서 나가고 이 사람을 막아요 */
  block(key: string) {
    if (!this.convs.has(key)) return;
    this.addBlock(key);
    this.close(key);
  }

  unblockAll() {
    this.blocked.clear();
    store.clearDmBlocked();
    this.deps.view.setBlockedCount(0);
    this.deps.toast('차단을 모두 풀었어요');
  }

  /** 대화에서 나가요. 상대 쪽에는 "나갔어요"로 보여요 */
  close(key: string) {
    const c = this.convs.get(key);
    if (!c) return;
    if (c.topic) this.deps.net.dmClose(c.topic);
    this.clearTimer(key);
    this.forget(key);
    this.convs.delete(key);
    this.deps.view.remove(key);
  }

  // ── 말 보내기 ──────────────────────────────────
  /** 보낼 수 없으면 이유를 돌려줘요 */
  async send(key: string, raw: string): Promise<string | null> {
    const c = this.convs.get(key);
    const session = this.sessions.get(key);
    if (c?.state !== 'open' || !c.topic || !session) return '아직 대화가 열리지 않았어요.';
    const body = [...raw.trim()].slice(0, DM_MAX_LENGTH).join('');
    if (!body) return null;
    if (DM_SEND_GAP_MS - (Date.now() - this.lastSendAt) > 0) return '조금만 천천히요.';
    if (hasBadWord(body)) return '욕설이 들어 있어서 보낼 수 없어요. 다른 말로 적어주세요.';
    // 암호화를 기다리는 사이에 또 눌러도 한 번만 나가게 먼저 시각을 적어 둬요
    const at = Date.now();
    this.lastSendAt = at;
    const cipher = await session.encrypt(body, at);
    if (!this.deps.net.dmSend(c.topic, cipher)) return '보내지 못했어요. 연결이 끊겼을 수 있어요.';
    this.deps.view.addLine(key, { mine: true, text: body, at });
    return null;
  }

  // ── 채널 연결 ──────────────────────────────────
  /**
   * 내가 먼저 채널에 들어가 있어야 상대가 들어오자마자 보낸 말을 놓치지 않아서, ok는 들어간 뒤에 보내요.
   * announce: 상대가 내 공개 키를 아직 모르면(내가 수락하는 쪽) ok로 알려줘요
   */
  private async connect(key: string, announce: boolean) {
    const pair = this.pairs.get(key);
    const peerKey = this.peerKeys.get(key);
    if (!this.convs.has(key) || !pair || !peerKey || this.opening.has(key)) return;
    this.opening.add(key);
    const session = await openSession(pair, peerKey);
    if (!session) {
      this.opening.delete(key);
      this.end(key, BAD_PEER_KEY);
      return;
    }
    this.sessions.set(key, session);
    this.keyByTopic.set(session.topic, key);
    const ok = await this.deps.net.dmOpen(session.topic, this.handlers);
    this.opening.delete(key);
    const c = this.convs.get(key);
    if (!c) {
      // 기다리는 사이에 대화를 닫았어요
      if (ok) this.deps.net.dmClose(session.topic);
      return;
    }
    if (!ok) {
      this.end(key, UNAVAILABLE);
      return;
    }
    this.clearTimer(key);
    this.set({ ...c, topic: session.topic, code: session.code, state: 'open', online: this.present.get(session.topic) ?? false, note: '' });
    if (announce) {
      const me = this.deps.me();
      this.deps.sendEvent({ type: 'dm', id: me.id, to: key, stage: 'ok', key: pair.publicKey, name: me.name });
    }
    this.deps.view.open(key);
  }

  private handlers: DmHandlers = {
    onMessage: (topic, cipher) => void this.onMessage(topic, cipher),
    onPresence: (topic, online) => this.onPresence(topic, online),
    onClosed: (topic) => {
      const c = this.byTopic(topic);
      if (c) this.end(c.key, '연결이 끊겼어요.');
    },
  };

  private async onMessage(topic: string, cipher: DmCipher) {
    const c = this.byTopic(topic);
    const session = c && this.sessions.get(c.key);
    if (c?.state !== 'open' || !session) return;
    const m = await session.decrypt(cipher);
    if (!m) return; // 못 푸는 건 버려요 (깨졌거나, 이 대화 키로 만든 게 아니에요)
    const body = maskBadWords(text(m.text, DM_MAX_LENGTH));
    if (!body) return;
    const now = Date.now();
    this.deps.view.addLine(c.key, { mine: false, text: body, at: Number.isFinite(m.at) ? Math.min(Math.max(m.at, 0), now) : now });
  }

  private onPresence(topic: string, online: boolean) {
    this.present.set(topic, online);
    const c = this.byTopic(topic);
    if (c?.state !== 'open' || c.online === online) return;
    this.set({ ...c, online });
    this.deps.view.addNotice(c.key, online ? '상대가 들어왔어요.' : '상대가 대화에서 나갔어요. 지금 보내는 말은 전달되지 않아요.');
  }

  // ── 도우미 ─────────────────────────────────────
  private set(conv: DmConv) {
    this.convs.set(conv.key, conv);
    this.deps.view.show(conv);
  }

  private byTopic(topic: string): DmConv | undefined {
    const key = this.keyByTopic.get(topic);
    return key ? this.convs.get(key) : undefined;
  }

  /** 이 대화의 키 쌍을 만들어 둬요. 브라우저가 암호화를 못 쓰면(https가 아닌 주소 등) 안내하고 null */
  private async makeKeyPair(key: string): Promise<DmKeyPair | null> {
    try {
      const pair = await newKeyPair();
      this.pairs.set(key, pair);
      return pair;
    } catch (e) {
      console.warn('[dm] 키를 만들지 못했어요', e);
      this.deps.toast(UNAVAILABLE, 'bad');
      return null;
    }
  }

  /** 이 대화에 쓰던 키와 채널 정보를 지워요 */
  private forget(key: string) {
    const topic = this.sessions.get(key)?.topic;
    if (topic) {
      this.keyByTopic.delete(topic);
      this.present.delete(topic);
    }
    this.pairs.delete(key);
    this.peerKeys.delete(key);
    this.sessions.delete(key);
  }

  /** 대화를 끝난 상태로 두고 이유를 보여줘요 (기록은 남기고, 키는 지워요) */
  private end(key: string, note: string) {
    const c = this.convs.get(key);
    if (!c) return;
    if (c.topic) this.deps.net.dmClose(c.topic);
    this.clearTimer(key);
    this.forget(key);
    this.set({ ...c, topic: null, code: '', state: 'ended', online: false, note });
  }

  private addBlock(key: string) {
    this.blocked.add(key);
    store.addDmBlocked(key);
    this.deps.view.setBlockedCount(this.blocked.size);
  }

  /** 열려 있거나 답을 기다리는 대화 수. except는 세지 않을 대화 */
  private activeCount(except?: string) {
    let n = 0;
    for (const c of this.convs.values()) if (c.key !== except && (c.state === 'open' || c.state === 'requesting')) n++;
    return n;
  }

  private incomingCount() {
    let n = 0;
    for (const c of this.convs.values()) if (c.state === 'incoming') n++;
    return n;
  }

  /** 답이 없으면 요청을 접어요 */
  private expireLater(key: string) {
    this.clearTimer(key);
    this.timers.set(
      key,
      window.setTimeout(() => {
        this.timers.delete(key);
        const c = this.convs.get(key);
        if (c?.state === 'requesting') this.end(key, '답이 없어서 요청을 접었어요.');
        else if (c?.state === 'incoming') this.close(key);
      }, DM_REQUEST_TTL_MS),
    );
  }

  private clearTimer(key: string) {
    window.clearTimeout(this.timers.get(key));
    this.timers.delete(key);
  }
}
