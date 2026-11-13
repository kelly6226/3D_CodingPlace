// 다른 기기에서 이어하기
// 로그인 대신 이어하기 코드 하나로, 프로필·설정·날짜별 모각코 시간을 여러 기기에서 이어 써요.
//
// 맞추는 규칙
// - 프로필·설정: 마지막에 바꾼 기기의 것이 남아요. 다른 기기에서 바꾼 건 이 기기를 다시 열 때 받아와요.
// - 날짜별 시간: 기기마다 따로 더해서 서버가 합쳐요. 그래서 두 기기를 같이 켜 두면 그 시간은 두 번 세요.
import { newSyncCode, parseSyncCode } from './code';
import { SyncApi, SyncError, type SyncFailure } from './api';
import { DAY_MS, cleanDays, cleanProfile, cleanRemote, type Remote, type SyncedProfile, type SyncedSettings } from './clean';
import * as store from '../store';

/** 화면이 알아야 하는 상태. 서버가 없으면(데모 모드) 'off' */
export type SyncState =
  | { kind: 'off' }
  | { kind: 'unlinked' }
  /** shared: 링크나 코드를 나에게 보내 둔 적 있는지 (없으면 다른 기기에서 이어갈 방법이 없어요) */
  | { kind: 'linked'; code: string; shared: boolean };

/** 버튼을 누른 결과. 실패하면 화면에 그대로 보여줄 문구 */
export type SyncOutcome = { ok: true } | { ok: false; reason: string };

/** 시작할 때 서버와 맞춘 결과 */
export type SyncStart =
  | 'off'
  /** 다른 기기에서 바꾼 프로필·설정을 받아왔어요 (입장 화면을 다시 그려야 해요) */
  | 'applied'
  | 'same'
  /** 다른 기기에서 기록을 지워서 이 기기도 연결을 끊었어요 */
  | 'gone'
  /** 서버에 닿지 못했어요 (다음에 다시 맞춰요) */
  | 'failed';

/**
 * 시작할 때 서버를 기다리는 시간. 넘으면 이번에는 받아오지 않아요
 * (늦게 받아서 이미 입장한 뒤에 프로필이 바뀌는 일이 없게)
 */
const START_TIMEOUT_MS = 4000;
/** 시간 기록을 서버에 알리는 간격 */
const FLUSH_INTERVAL_MS = 5 * 60e3;
/** 평소에는 최근 이틀(어제·오늘)만 보내요. 자정을 넘겨 켜 둔 경우 어제 몫까지 */
const RECENT_DAYS = 2;

const FAILURE_TEXT: Record<SyncFailure, string> = {
  offline: '서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 해 주세요.',
  busy: '지금 요청이 많아서 잠깐 막혔어요. 1분 뒤에 다시 해 주세요.',
  not_found: '이 코드로 저장된 기록이 없어요. 코드를 다시 확인해 주세요.',
  server: '서버에서 문제가 생겼어요. 잠시 뒤에 다시 해 주세요.',
};

function failureText(e: unknown): string {
  return e instanceof SyncError ? FAILURE_TEXT[e.reason] : FAILURE_TEXT.server;
}

interface Synced {
  profile: SyncedProfile;
  settings: SyncedSettings;
}

/** 이 기기의 지금 프로필·설정 */
function localSynced(): Synced {
  const { id: _id, ...profile } = store.getProfile();
  return { profile: cleanProfile(profile, profile), settings: { myHour: store.getMyHour(), noise: store.getNoiseChoices() } };
}

/** 비교용 글자. 칸 순서를 고정해서 같은 값이면 같은 글자가 돼요 */
function snapshotOf({ profile: p, settings: s }: Synced): string {
  const noise = Object.fromEntries(Object.entries(s.noise).sort(([a], [b]) => a.localeCompare(b)));
  return JSON.stringify({
    profile: { name: p.name, color: p.color, lang: p.lang, hair: p.hair, skin: p.skin, glasses: p.glasses, outfit: p.outfit },
    settings: { myHour: s.myHour, noise },
  });
}

function applyToLocal(remote: Remote) {
  store.saveProfile({ ...store.getProfile(), ...remote.profile });
  store.setMyHour(remote.settings.myHour);
  store.setNoiseChoices(remote.settings.noise);
}

/** 다른 기기들 + 이 기기 = 화면에 보여줄 날짜별 시간 */
function mergeDays(others: Record<string, number>, mine: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = { ...others };
  for (const [day, ms] of Object.entries(mine)) out[day] = Math.min(DAY_MS, (out[day] ?? 0) + ms);
  return out;
}

function recentDays(mine: Record<string, number>): Record<string, number> {
  const recent = Object.keys(mine).sort().slice(-RECENT_DAYS);
  return Object.fromEntries(recent.map((day) => [day, mine[day]]));
}

export class DeviceSync {
  /** 지금 서버에 알리는 중이면 그 작업 (겹쳐 부르면 기다렸다 같이 끝나요) */
  private flushing: Promise<void> | null = null;

  constructor(private api: SyncApi) {}

  state(): SyncState {
    const link = store.getSyncLink();
    return link ? { kind: 'linked', code: link.code, shared: link.shared } : { kind: 'unlinked' };
  }

  /**
   * 페이지를 열 때 한 번. 입장 화면이 열려 있는 동안 불러요.
   * 지난번 맞춘 뒤로 이 기기에서 바꾼 게 없을 때만 다른 기기의 프로필·설정을 받아와요
   * (이 기기에서 바꾼 게 있으면 그걸 올려요. 둘 다 바꿨으면 이 기기 것이 남아요)
   */
  async start(): Promise<SyncStart> {
    const link = store.getSyncLink();
    if (!link) return 'off';
    let result: SyncStart = 'same';
    try {
      const raw = await Promise.race([
        this.api.pull(link.code, link.device),
        new Promise<never>((_, reject) => window.setTimeout(() => reject(new SyncError('offline', 'timeout')), START_TIMEOUT_MS)),
      ]);
      if (!raw) {
        store.clearSyncLink();
        return 'gone';
      }
      const remote = cleanRemote(raw, localSynced().profile);
      const localUnchanged = snapshotOf(localSynced()) === link.snapshot;
      if (localUnchanged && remote.updatedAt !== link.at) {
        applyToLocal(remote);
        store.saveSyncLink({ ...link, at: remote.updatedAt, snapshot: snapshotOf(remote) });
        result = 'applied';
      }
      store.replaceStudyHistory(mergeDays(cleanDays(raw.others), link.mine));
    } catch (e) {
      console.warn('[sync] 시작할 때 받아오지 못했어요', e);
      result = 'failed';
    }
    // 이 기기에서 바꾼 것과 시간 기록은 기다리지 않고 올려요
    void this.flush();
    return result;
  }

  /** 페이지가 열려 있는 동안 5분마다, 그리고 화면을 벗어날 때 서버에 알려요 */
  startAutoFlush() {
    window.setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void this.flush();
    });
  }

  /** 이 기기에서 바꾼 프로필·설정과 이 기기의 시간을 서버에 알려요. 실패하면 다음에 다시 해요 */
  flush(): Promise<void> {
    this.flushing ??= this.flushOnce().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private async flushOnce() {
    const link = store.getSyncLink();
    if (!link) return;
    try {
      const local = localSynced();
      const localSnapshot = snapshotOf(local);
      if (localSnapshot !== link.snapshot) {
        const res = await this.api.push(link.code, local.profile, local.settings);
        store.saveSyncLink({ ...(store.getSyncLink() ?? link), at: String(res.updated_at), snapshot: localSnapshot });
      }
      const days = link.sendAllDays ? link.mine : recentDays(link.mine);
      const { others } = await this.api.study(link.code, link.device, days);
      // 기다리는 사이에도 시간이 쌓여서, 이 기기 몫은 지금 값으로 다시 읽어요
      const now = store.getSyncLink();
      if (!now || now.code !== link.code) return;
      if (link.sendAllDays) store.saveSyncLink({ ...now, sendAllDays: false });
      store.replaceStudyHistory(mergeDays(cleanDays(others), now.mine));
    } catch (e) {
      // 코드가 지워졌으면(다른 기기에서 기록 지우기) 다음에 열 때 start()가 연결을 끊어요
      console.warn('[sync] 서버에 알리지 못했어요', e);
    }
  }

  /** 새 코드를 만들어 지금 이 기기의 기록을 올려요 */
  async create(): Promise<SyncOutcome> {
    if (store.getSyncLink()) return { ok: false, reason: '이미 이어하기 코드로 연결돼 있어요.' };
    const code = newSyncCode();
    const local = localSynced();
    try {
      const res = await this.api.create(code, local.profile, local.settings);
      store.saveSyncLink({
        code,
        device: store.randomId(),
        at: String(res.updated_at),
        snapshot: snapshotOf(local),
        mine: store.getStudyHistory(),
        sendAllDays: true,
        shared: false,
      });
    } catch (e) {
      return { ok: false, reason: failureText(e) };
    }
    await this.flush();
    return { ok: true };
  }

  /**
   * 다른 기기에서 받은 코드로 이어해요. 이 기기의 프로필·설정은 그 코드의 것으로 바뀌고,
   * 이 기기에 있던 날짜별 시간은 그 코드의 기록에 더해져요
   */
  async join(input: string): Promise<SyncOutcome> {
    if (store.getSyncLink()) return { ok: false, reason: '이미 이어하기 코드로 연결돼 있어요. 연결을 끊고 다시 해 주세요.' };
    const code = parseSyncCode(input);
    if (!code) return { ok: false, reason: '코드는 20글자예요. 빠진 글자가 없는지 확인해 주세요.' };
    const device = store.randomId();
    try {
      const raw = await this.api.pull(code, device);
      if (!raw) return { ok: false, reason: FAILURE_TEXT.not_found };
      const remote = cleanRemote(raw, localSynced().profile);
      const mine = store.getStudyHistory();
      applyToLocal(remote);
      // 받은 링크나 코드로 이어한 기기는 이미 어딘가에 링크를 갖고 있어서 '보냈다'로 봐요
      store.saveSyncLink({ code, device, at: remote.updatedAt, snapshot: snapshotOf(remote), mine, sendAllDays: true, shared: true });
      store.replaceStudyHistory(mergeDays(cleanDays(raw.others), mine));
    } catch (e) {
      return { ok: false, reason: failureText(e) };
    }
    await this.flush();
    return { ok: true };
  }

  /** 이 기기에서만 연결을 끊어요. 서버 기록과 이 기기의 기록은 그대로예요 */
  unlink() {
    store.clearSyncLink();
  }

  /** 서버에 남은 이 코드의 기록을 지우고 연결을 끊어요. 다른 기기들은 다음에 열 때 끊겨요 */
  async erase(): Promise<SyncOutcome> {
    const link = store.getSyncLink();
    if (!link) return { ok: true };
    try {
      await this.api.erase(link.code);
    } catch (e) {
      return { ok: false, reason: failureText(e) };
    }
    store.clearSyncLink();
    return { ok: true };
  }
}
