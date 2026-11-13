// 이어하기 서버 함수 부르기 (supabase/schema.sql 8번)
// 방 접속(net/online.ts)과는 따로 움직여서, Supabase 클라이언트를 하나 더 만들지 않고 RPC 주소를 바로 불러요.

/** 실패 이유. 화면 문구는 부르는 쪽(deviceSync.ts)이 정해요 */
export type SyncFailure = 'not_found' | 'offline' | 'busy' | 'server';

export class SyncError extends Error {
  constructor(readonly reason: SyncFailure, detail: string) {
    super(detail);
  }
}

/** 서버에서 받은 그대로의 값. 모양 확인은 clean.ts가 해요 */
export interface RemoteSnapshot {
  profile: unknown;
  settings: unknown;
  updated_at: unknown;
  others: unknown;
}

export class SyncApi {
  constructor(
    private url: string,
    private key: string,
  ) {}

  /** 코드로 읽기. 없는 코드면 null */
  pull(code: string, device: string): Promise<RemoteSnapshot | null> {
    return this.rpc('sync_pull', { p_code: code, p_device: device });
  }

  create(code: string, profile: object, settings: object): Promise<{ updated_at: unknown }> {
    return this.rpc('sync_create', { p_code: code, p_profile: profile, p_settings: settings });
  }

  push(code: string, profile: object, settings: object): Promise<{ updated_at: unknown }> {
    return this.rpc('sync_push', { p_code: code, p_profile: profile, p_settings: settings });
  }

  /** 이 기기의 날짜별 시간을 알리고, 다른 기기들의 날짜별 합계를 받아요 */
  study(code: string, device: string, days: Record<string, number>): Promise<{ others: unknown }> {
    return this.rpc('sync_study', { p_code: code, p_device: device, p_days: days });
  }

  /** 서버에 남은 기록 지우기. 이미 없었으면 false */
  erase(code: string): Promise<boolean> {
    return this.rpc('sync_delete', { p_code: code });
  }

  private async rpc<T>(fn: string, args: object): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.url}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        // supabase-js와 같은 머리글 (publishable 키로 anon 역할이 돼요)
        headers: { apikey: this.key, Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      });
    } catch (e) {
      throw new SyncError('offline', String(e));
    }
    if (res.ok) return (await res.json()) as T;
    const detail = await res.text().catch(() => '');
    throw new SyncError(failureOf(detail), `${fn} ${res.status} ${detail}`);
  }
}

/** schema.sql에서 raise exception 하는 문구로 이유를 나눠요 */
function failureOf(detail: string): SyncFailure {
  if (detail.includes('no such code')) return 'not_found';
  if (detail.includes('too many')) return 'busy';
  return 'server';
}
