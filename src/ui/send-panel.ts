import { SendHistoryEntry, InputMode, LineEnding } from '../types/index.js';

/** 送信履歴の保持上限 */
const MAX_HISTORY = 50;

/** 改行コードのバイト列マッピング */
const LINE_ENDING_BYTES: Record<LineEnding, Uint8Array> = {
  none: new Uint8Array(0),
  cr: new Uint8Array([0x0D]),
  lf: new Uint8Array([0x0A]),
  crlf: new Uint8Array([0x0D, 0x0A]),
};

/**
 * データ送信パネル
 * テキスト/バイナリ入力、改行コード選択、送信履歴表示を提供する
 */
export class SendPanel {
  private container: HTMLElement;

  // フォーム要素
  private inputModeSelect!: HTMLSelectElement;
  private lineEndingSelect!: HTMLSelectElement;
  private inputField!: HTMLInputElement;
  private sendBtn!: HTMLButtonElement;
  private historyList!: HTMLElement;
  private errorText!: HTMLElement;

  /** 送信要求時のコールバック */
  onSend: ((data: Uint8Array, displayText: string) => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.buildDOM();
    this.bindEvents();
  }

  /**
   * 送信履歴にエントリを追加する
   */
  addHistory(entry: SendHistoryEntry): void {
    const time = new Date(entry.timestamp);
    const timeStr = time.toLocaleTimeString('ja-JP', { hour12: false });

    const item = document.createElement('div');
    item.className = 'scroll-list__item';
    item.textContent = `${timeStr} > ${entry.data}`;

    // 先頭に挿入（新しい順）
    this.historyList.prepend(item);

    // 上限を超えたら末尾を削除
    while (this.historyList.children.length > MAX_HISTORY) {
      this.historyList.removeChild(this.historyList.lastChild!);
    }
  }

  /**
   * 送信ボタンの有効/無効状態を制御する
   */
  setEnabled(enabled: boolean): void {
    this.sendBtn.disabled = !enabled;
    this.inputField.disabled = !enabled;
  }

  /**
   * DOM構造を構築する
   */
  private buildDOM(): void {
    this.container.innerHTML = `
      <h2 class="panel__title">送受信</h2>
      <div class="form-row" style="margin-bottom: var(--spacing-md);">
        <div class="form-group">
          <label class="form-group__label" for="input-mode">入力形式</label>
          <select class="select" id="input-mode">
            <option value="text" selected>テキスト</option>
            <option value="binary">バイナリ (HEX)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-group__label" for="line-ending">改行</label>
          <select class="select" id="line-ending">
            <option value="none">なし</option>
            <option value="cr">CR (\\r)</option>
            <option value="lf" selected>LF (\\n)</option>
            <option value="crlf">CRLF (\\r\\n)</option>
          </select>
        </div>
      </div>
      <div class="form-row" style="margin-bottom: var(--spacing-sm);">
        <input class="input" id="send-input" type="text"
               placeholder="送信データを入力..." style="flex: 1;" disabled />
        <button class="btn" id="send-btn" disabled>送信</button>
      </div>
      <div class="error-text" id="send-error" style="margin-bottom: var(--spacing-sm); min-height: 1em;"></div>
      <div class="panel__title" style="font-size: var(--font-size-base); margin-bottom: var(--spacing-sm);">送信履歴</div>
      <div class="scroll-list" id="send-history"></div>
    `;

    this.inputModeSelect = this.container.querySelector('#input-mode') as HTMLSelectElement;
    this.lineEndingSelect = this.container.querySelector('#line-ending') as HTMLSelectElement;
    this.inputField = this.container.querySelector('#send-input') as HTMLInputElement;
    this.sendBtn = this.container.querySelector('#send-btn') as HTMLButtonElement;
    this.historyList = this.container.querySelector('#send-history') as HTMLElement;
    this.errorText = this.container.querySelector('#send-error') as HTMLElement;
  }

  /**
   * イベントリスナーを登録する
   */
  private bindEvents(): void {
    // 入力形式変更時にプレースホルダーを切替
    this.inputModeSelect.addEventListener('change', () => {
      const mode = this.inputModeSelect.value as InputMode;
      this.inputField.placeholder = mode === 'text'
        ? '送信データを入力...'
        : 'スペース区切り16進数 例: 48 65 6C 6C 6F';
      this.inputField.value = '';
      this.clearError();
    });

    // 入力値のリアルタイムバリデーション（バイナリモード時）
    this.inputField.addEventListener('input', () => {
      if (this.inputModeSelect.value === 'binary') {
        this.validateBinaryInput();
      } else {
        this.clearError();
      }
    });

    // 送信ボタン
    this.sendBtn.addEventListener('click', () => {
      this.doSend();
    });

    // Enterキーで送信
    this.inputField.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !this.sendBtn.disabled) {
        this.doSend();
      }
    });
  }

  /**
   * 送信を実行する
   */
  private doSend(): void {
    const mode = this.inputModeSelect.value as InputMode;
    const input = this.inputField.value;

    if (input.length === 0) return;

    let payload: Uint8Array;
    let displayText: string;

    if (mode === 'binary') {
      const parsed = this.parseBinaryInput(input);
      if (!parsed) return;
      payload = parsed;
      displayText = `[HEX] ${input.trim()}`;
    } else {
      const encoder = new TextEncoder();
      payload = encoder.encode(input);
      displayText = input;
    }

    // 改行コードを付与
    const lineEnding = this.lineEndingSelect.value as LineEnding;
    const suffix = LINE_ENDING_BYTES[lineEnding];
    if (suffix.length > 0) {
      const combined = new Uint8Array(payload.length + suffix.length);
      combined.set(payload);
      combined.set(suffix, payload.length);
      payload = combined;
    }

    this.onSend?.(payload, displayText);
    this.inputField.value = '';
    this.clearError();
  }

  /**
   * バイナリ入力をバリデーションする
   * @returns バリデーションが成功した場合 true
   */
  private validateBinaryInput(): boolean {
    const input = this.inputField.value.trim();
    if (input.length === 0) {
      this.clearError();
      return true;
    }

    // 有効な16進数文字とスペースのみ許可
    if (!/^[0-9a-fA-F\s]+$/.test(input)) {
      this.showError('有効な16進数文字（0-9, A-F）とスペースのみ使用できます');
      return false;
    }

    // 各トークンが2文字以下の16進数であること
    const tokens = input.split(/\s+/).filter(t => t.length > 0);
    for (const token of tokens) {
      if (token.length > 2) {
        this.showError('各バイトは2桁以下の16進数で入力してください（例: 48 65 6C）');
        return false;
      }
    }

    this.clearError();
    return true;
  }

  /**
   * バイナリ入力をパースしてバイト列に変換する
   * @returns 変換成功時は Uint8Array、失敗時は null
   */
  private parseBinaryInput(input: string): Uint8Array | null {
    if (!this.validateBinaryInput()) return null;

    const tokens = input.trim().split(/\s+/).filter(t => t.length > 0);
    if (tokens.length === 0) return null;

    const bytes = new Uint8Array(tokens.length);
    for (let i = 0; i < tokens.length; i++) {
      bytes[i] = parseInt(tokens[i], 16);
    }
    return bytes;
  }

  /**
   * エラーメッセージを表示する
   */
  private showError(message: string): void {
    this.errorText.textContent = message;
    this.inputField.classList.add('input--error');
  }

  /**
   * エラーメッセージをクリアする
   */
  private clearError(): void {
    this.errorText.textContent = '';
    this.inputField.classList.remove('input--error');
  }
}
