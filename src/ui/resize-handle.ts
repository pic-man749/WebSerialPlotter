/**
 * グラフ表示部と下部パネル群の間のドラッグによる高さ調整を管理するクラス
 *
 * ハンドル要素をマウス/タッチでドラッグすることで、
 * 上部ペイン（グラフ表示）と下部ペイン（操作・データ）の高さ比率を動的に変更する。
 */
export class ResizeHandle {
  private readonly handle: HTMLElement;
  private readonly paneTop: HTMLElement;
  private readonly container: HTMLElement;

  private isDragging = false;
  private startY = 0;
  private startHeight = 0;

  /** 上部ペインの最小高さ（px） */
  private static readonly MIN_TOP_HEIGHT = 100;

  /** 下部ペインの最小高さ（px） */
  private static readonly MIN_BOTTOM_HEIGHT = 80;

  constructor(
    handleEl: HTMLElement,
    paneTopEl: HTMLElement,
    containerEl: HTMLElement,
  ) {
    this.handle = handleEl;
    this.paneTop = paneTopEl;
    this.container = containerEl;
    this.bindEvents();
  }

  private bindEvents(): void {
    this.handle.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mouseup', this.onMouseUp);
    // タッチデバイス対応
    this.handle.addEventListener('touchstart', this.onTouchStart, { passive: false });
    document.addEventListener('touchmove', this.onTouchMove, { passive: false });
    document.addEventListener('touchend', this.onTouchEnd);
  }

  private onMouseDown = (e: MouseEvent): void => {
    this.startDrag(e.clientY);
    e.preventDefault();
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.isDragging) return;
    this.updateHeight(e.clientY);
  };

  private onMouseUp = (): void => {
    this.endDrag();
  };

  private onTouchStart = (e: TouchEvent): void => {
    this.startDrag(e.touches[0].clientY);
    e.preventDefault();
  };

  private onTouchMove = (e: TouchEvent): void => {
    if (!this.isDragging) return;
    this.updateHeight(e.touches[0].clientY);
    e.preventDefault();
  };

  private onTouchEnd = (): void => {
    this.endDrag();
  };

  private startDrag(clientY: number): void {
    this.isDragging = true;
    this.startY = clientY;
    this.startHeight = this.paneTop.offsetHeight;
    this.handle.classList.add('resize-handle--dragging');
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  }

  private endDrag(): void {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.handle.classList.remove('resize-handle--dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  private updateHeight(clientY: number): void {
    const delta = clientY - this.startY;
    const newHeight = this.startHeight + delta;
    const handleHeight = this.handle.offsetHeight;
    const containerHeight = this.container.offsetHeight;
    const maxHeight =
      containerHeight - handleHeight - ResizeHandle.MIN_BOTTOM_HEIGHT;
    const clamped = Math.min(
      Math.max(newHeight, ResizeHandle.MIN_TOP_HEIGHT),
      maxHeight,
    );
    this.paneTop.style.height = `${clamped}px`;
  }
}
