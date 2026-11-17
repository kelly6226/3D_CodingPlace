// 채팅 칸이 화면 어디에 뜨는지. style.css .chat의 @media와 같은 기준이라 둘을 같이 고쳐야 해요
//
// - docked: 넓은 화면. 왼쪽 아래에 붙어 있어서 시트(가운데)와 같이 열 수 있어요
// - centered: 중간 화면. 하단 바 위 가운데에 떠요. 시트와 같은 자리라 둘 중 하나만 열어요
// - full-width: 좁은 화면. 좌우를 꽉 채워 하단 바 위에 떠요. 시트와는 둘 중 하나만 열어요

/** 이 폭부터 채팅 칸을 왼쪽 아래에 붙여요. 가운데 하단 바(약 500px)와 시트(440px)를 피할 자리가 남는 폭이에요 */
const DOCKED_CHAT_QUERY = '(min-width: 1180px)';
const FULL_WIDTH_CHAT_QUERY = '(max-width: 640px)';

export type ChatLayout = 'docked' | 'centered' | 'full-width';

export function currentChatLayout(): ChatLayout {
  if (window.matchMedia(DOCKED_CHAT_QUERY).matches) return 'docked';
  if (window.matchMedia(FULL_WIDTH_CHAT_QUERY).matches) return 'full-width';
  return 'centered';
}

/** 창 크기가 바뀌어 채팅 칸 자리가 달라질 때 불러요 */
export function onChatLayoutChange(listener: () => void) {
  for (const query of [DOCKED_CHAT_QUERY, FULL_WIDTH_CHAT_QUERY]) {
    window.matchMedia(query).addEventListener('change', listener);
  }
}
