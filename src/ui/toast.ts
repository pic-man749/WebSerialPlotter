/** トースト通知の種別 */
type ToastType = 'error' | 'warning';

/** 自動非表示までの時間（ミリ秒） */
const AUTO_DISMISS_MS = 3000;

/** フェードアウトアニメーションの時間（ミリ秒） */
const FADE_OUT_MS = 200;

/**
 * トースト通知コンポーネント
 * 画面右上に一時的なメッセージを表示する
 */
export class Toast {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  /**
   * トースト通知を表示する
   * @param message 表示メッセージ
   * @param type 通知種別（error / warning）
   */
  show(message: string, type: ToastType = 'error'): void {
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.textContent = message;
    this.container.appendChild(el);

    // 自動非表示タイマー
    const timerId = window.setTimeout(() => {
      this.dismiss(el);
    }, AUTO_DISMISS_MS);

    // クリックで即時非表示
    el.addEventListener('click', () => {
      window.clearTimeout(timerId);
      this.dismiss(el);
    }, { once: true });
  }

  /**
   * フェードアウトアニメーション後にDOM要素を除去する
   */
  private dismiss(el: HTMLElement): void {
    el.classList.add('toast--fade-out');
    el.addEventListener('animationend', () => {
      el.remove();
    }, { once: true });

    // アニメーション未発火時のフォールバック
    window.setTimeout(() => {
      if (el.parentNode) {
        el.remove();
      }
    }, FADE_OUT_MS + 50);
  }
}
