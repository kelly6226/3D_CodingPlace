/**
 * 모바일에서 키보드가 올라오면, 화면에서 실제로 보이는 영역(visualViewport)에 맞춰 #app을 줄여요.
 * 아래쪽에 붙어 있는 채팅 입력란과 방명록 시트가 키보드 뒤에 가려지지 않고 키보드 바로 위로 올라와요.
 * 키보드가 열려 있는 동안엔 <html>에 kb-open 클래스를 붙여서, 하단 바처럼 지금 필요 없는 것을 CSS에서 숨겨요.
 */

/** 보이는 영역이 이보다 많이 줄었을 때만 키보드로 봐요 (주소창이 접히는 정도는 키보드가 아님) */
const KEYBOARD_MIN_HEIGHT_PX = 120;
/** 확대 배율이 1에서 이만큼 벗어나면 손가락 확대로 봐요 (소수점 오차는 무시) */
const PINCH_ZOOM_TOLERANCE = 0.01;

export function followVisualViewport() {
  const viewport = window.visualViewport;
  if (!viewport) return;
  const root = document.documentElement;
  let frame = 0;

  const apply = () => {
    frame = 0;
    // 손가락으로 확대한 상태에선 보이는 영역이 줄어드는 게 키보드 때문이 아니라서 건드리지 않아요
    if (Math.abs(viewport.scale - 1) > PINCH_ZOOM_TOLERANCE) return;
    const keyboardOpen = window.innerHeight - viewport.height > KEYBOARD_MIN_HEIGHT_PX;
    root.classList.toggle('kb-open', keyboardOpen);
    if (keyboardOpen) {
      root.style.setProperty('--vv-top', `${viewport.offsetTop}px`);
      root.style.setProperty('--vv-h', `${viewport.height}px`);
    } else {
      root.style.removeProperty('--vv-top');
      root.style.removeProperty('--vv-h');
    }
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(apply);
  };

  viewport.addEventListener('resize', schedule);
  // iOS는 입력칸을 보여주려고 화면을 위로 밀어서(offsetTop), 그만큼도 따라가야 해요
  viewport.addEventListener('scroll', schedule);
}
