// 이어하기 링크를 보내고 여는 환경 확인

/** 이 브라우저에 공유 창(Web Share API)이 있는지. 파이어폭스 등은 없어서 링크 복사로 대신해요 */
export function canShareLink(): boolean {
  return typeof navigator.share === 'function';
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
