// 가로로 넘치는 칩 줄을 마우스로 끌어서 넘기기
//
// 터치는 브라우저가 원래 손가락으로 넘겨줘서 마우스일 때만 처리해요.
// DRAG_THRESHOLD_PX보다 많이 끌었으면 손을 뗄 때 생기는 클릭은 버려서, 끌다가 칩이 눌리지 않게 해요.

/** 이만큼 움직여야 클릭이 아니라 끌기로 봐요 */
const DRAG_THRESHOLD_PX = 5;

export function enableDragScroll(el: HTMLElement) {
  let pressed = false;
  let dragged = false;
  let startX = 0;
  let startLeft = 0;

  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    pressed = true;
    dragged = false;
    startX = e.clientX;
    startLeft = el.scrollLeft;
  });

  el.addEventListener('pointermove', (e) => {
    if (!pressed) return;
    const dx = e.clientX - startX;
    if (!dragged) {
      if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
      dragged = true;
      el.setPointerCapture(e.pointerId);
      el.classList.add('dragging');
    }
    el.scrollLeft = startLeft - dx;
  });

  const release = () => {
    pressed = false;
    el.classList.remove('dragging');
  };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);

  // 끌기가 끝난 직후의 클릭만 막고, 그다음 클릭부터는 평소대로
  el.addEventListener(
    'click',
    (e) => {
      if (!dragged) return;
      dragged = false;
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );
}
