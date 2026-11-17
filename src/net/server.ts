// 실시간 서버(Supabase) 주소와 키. 방(main.ts)과 게임만 따로 연 페이지(games/main.ts)가 같이 써요

export interface ServerConfig {
  url: string;
  /** publishable 키 (예전 이름 anon 키도 받아요) */
  key: string;
}

/** 키가 없거나 주소에 ?demo=1이 붙어 있으면 null이라 서버 없이(데모 모드) 움직여요 */
export function serverConfig(params: URLSearchParams): ServerConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;
  if (!url || !key || params.get('demo') === '1') return null;
  return { url, key };
}
