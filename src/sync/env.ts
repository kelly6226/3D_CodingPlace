// 이어하기 링크를 보내고 여는 환경 확인

/** 공유 창이 있는지. 토스 앱은 토스 공유 시트(toss.ts shareText)가 늘 있어요 */
export function canShareLink(): boolean {
  return true;
}

/**
 * 카카오톡 안의 브라우저인지. 여기서 연 사이트는 사파리·크롬과 저장 공간이 따로라서,
 * 이어하기를 켜도 카톡 안에서만 기억돼요 (카카오 데브톡 답변 기준)
 */
export function isKakaoInApp(): boolean {
  return /KAKAOTALK/i.test(navigator.userAgent);
}

/** 카카오톡 안의 브라우저에서 이 주소를 기본 브라우저로 여는 주소 (카카오가 문서로 보장한 방식은 아니에요) */
export function kakaoExternalUrl(url: string): string {
  return `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;
}
