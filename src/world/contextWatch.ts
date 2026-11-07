/** 3D 컨텍스트가 유실·복구되는 순간을 알려줘요. 복구 자체는 three.js가 해요 */
export function watchContextLoss(canvas: HTMLCanvasElement, on: { lost: () => void; restored: () => void }) {
  canvas.addEventListener('webglcontextlost', on.lost);
  canvas.addEventListener('webglcontextrestored', on.restored);
}
