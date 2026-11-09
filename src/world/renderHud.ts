import type { WebGLRenderer } from 'three';

/** 진단 표시가 상태를 다시 읽는 간격 */
const HUD_REFRESH_MS = 1000;
/** 화면에 보여줄 오류 메시지의 최대 길이 */
const MAX_ERROR_LENGTH = 160;

/**
 * 주소에 ?diag=1을 붙였을 때만 쓰는 진단 표시예요. 3D가 비었을 때 상태를 스크린샷으로 남기려는 용도예요.
 * 화면 위에 표시를 띄우고, 처리되지 않은 오류도 계속 지켜봐요.
 */
export function startRenderHud(renderer: WebGLRenderer) {
  const box = document.createElement('pre');
  box.className = 'diag-hud';
  document.body.append(box);

  let lastError = '-';
  const remember = (text: string) => {
    lastError = text.slice(0, MAX_ERROR_LENGTH);
  };
  addEventListener('error', (e) => remember(`${e.message} @${e.filename.split('/').pop()}:${e.lineno}`));
  addEventListener('unhandledrejection', (e) => remember(`promise: ${String(e.reason)}`));

  const paint = () => {
    const canvas = renderer.domElement;
    const { calls, triangles } = renderer.info.render;
    box.textContent = [
      `t=${Math.round(performance.now() / 1000)}s vis=${document.visibilityState}`,
      `canvas ${canvas.width}x${canvas.height} (css ${canvas.clientWidth}x${canvas.clientHeight})`,
      `lost=${renderer.getContext().isContextLost()} calls=${calls} tris=${triangles}`,
      `err: ${lastError}`,
    ].join('\n');
  };
  paint();
  setInterval(paint, HUD_REFRESH_MS);
}
