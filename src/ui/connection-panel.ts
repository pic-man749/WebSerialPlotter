import { SerialConfig, ConnectionState } from '../types/index.js';

/** ボーレートプリセット値 */
const BAUD_RATE_PRESETS = [9600, 19200, 38400, 57600, 115200];

/**
 * シリアル接続設定パネル
 * ボーレート・データビット・ストップビット・パリティ・フロー制御の設定UIと接続/切断操作を提供する
 */
export class ConnectionPanel {
  private container: HTMLElement;

  // フォーム要素
  private baudRateSelect!: HTMLSelectElement;
  private baudRateCustomInput!: HTMLInputElement;
  private dataBitsSelect!: HTMLSelectElement;
  private stopBitsSelect!: HTMLSelectElement;
  private paritySelect!: HTMLSelectElement;
  private flowControlSelect!: HTMLSelectElement;
  private connectBtn!: HTMLButtonElement;
  private disconnectBtn!: HTMLButtonElement;

  /** 接続要求時のコールバック */
  onConnect: ((config: SerialConfig) => void) | null = null;

  /** 切断要求時のコールバック */
  onDisconnect: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.buildDOM();
    this.bindEvents();
  }

  /**
   * 接続状態の表示を更新する
   */
  updateState(state: ConnectionState): void {
    const isConnected = state === 'connected';
    const isConnecting = state === 'connecting';

    // ボタン有効/無効の制御
    this.connectBtn.disabled = isConnected || isConnecting;
    this.disconnectBtn.disabled = !isConnected;

    // 接続中はフォーム要素を無効化
    const formDisabled = isConnected || isConnecting;
    this.baudRateSelect.disabled = formDisabled;
    this.baudRateCustomInput.disabled = formDisabled;
    this.dataBitsSelect.disabled = formDisabled;
    this.stopBitsSelect.disabled = formDisabled;
    this.paritySelect.disabled = formDisabled;
    this.flowControlSelect.disabled = formDisabled;

    // ヘッダー上の接続状態インジケータを更新
    const indicator = document.querySelector('.status-indicator');
    const statusText = document.querySelector('.status-text');
    if (indicator) {
      indicator.className = 'status-indicator';
      if (isConnected) indicator.classList.add('status-indicator--connected');
      if (isConnecting) indicator.classList.add('status-indicator--connecting');
    }
    if (statusText) {
      statusText.textContent = isConnected ? '接続中' : isConnecting ? '接続処理中...' : '未接続';
    }
  }

  /**
   * フォームから現在の設定値を読み取る
   */
  private getConfig(): SerialConfig {
    const baudRate = this.baudRateSelect.value === 'custom'
      ? parseInt(this.baudRateCustomInput.value, 10)
      : parseInt(this.baudRateSelect.value, 10);

    return {
      baudRate: isNaN(baudRate) ? 115200 : baudRate,
      dataBits: parseInt(this.dataBitsSelect.value, 10) as 7 | 8,
      stopBits: parseInt(this.stopBitsSelect.value, 10) as 1 | 2,
      parity: this.paritySelect.value as 'none' | 'even' | 'odd',
      flowControl: this.flowControlSelect.value as 'none' | 'hardware',
    };
  }

  /**
   * DOM構造を構築する
   */
  private buildDOM(): void {
    this.container.innerHTML = `
      <h2 class="panel__title">接続設定</h2>
      <div class="form-row">
        <div class="form-group">
          <label class="form-group__label" for="baud-rate">ボーレート</label>
          <select class="select" id="baud-rate">
            ${BAUD_RATE_PRESETS.map(rate =>
              `<option value="${rate}" ${rate === 115200 ? 'selected' : ''}>${rate}</option>`
            ).join('')}
            <option value="custom">カスタム</option>
          </select>
          <input class="input" id="baud-rate-custom" type="number"
                 placeholder="カスタム値" style="display: none; width: 120px;" min="1" />
        </div>
        <div class="form-group">
          <label class="form-group__label" for="data-bits">データビット</label>
          <select class="select" id="data-bits">
            <option value="8" selected>8</option>
            <option value="7">7</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-group__label" for="stop-bits">ストップビット</label>
          <select class="select" id="stop-bits">
            <option value="1" selected>1</option>
            <option value="2">2</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-group__label" for="parity">パリティ</label>
          <select class="select" id="parity">
            <option value="none" selected>none</option>
            <option value="even">even</option>
            <option value="odd">odd</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-group__label" for="flow-control">フロー制御</label>
          <select class="select" id="flow-control">
            <option value="none" selected>none</option>
            <option value="hardware">hardware</option>
          </select>
        </div>
        <div class="form-group">
          <button class="btn" id="connect-btn">接続</button>
          <button class="btn btn--danger" id="disconnect-btn" disabled>切断</button>
        </div>
      </div>
    `;

    // DOM要素の参照を保持
    this.baudRateSelect = this.container.querySelector('#baud-rate') as HTMLSelectElement;
    this.baudRateCustomInput = this.container.querySelector('#baud-rate-custom') as HTMLInputElement;
    this.dataBitsSelect = this.container.querySelector('#data-bits') as HTMLSelectElement;
    this.stopBitsSelect = this.container.querySelector('#stop-bits') as HTMLSelectElement;
    this.paritySelect = this.container.querySelector('#parity') as HTMLSelectElement;
    this.flowControlSelect = this.container.querySelector('#flow-control') as HTMLSelectElement;
    this.connectBtn = this.container.querySelector('#connect-btn') as HTMLButtonElement;
    this.disconnectBtn = this.container.querySelector('#disconnect-btn') as HTMLButtonElement;
  }

  /**
   * イベントリスナーを登録する
   */
  private bindEvents(): void {
    // ボーレート「カスタム」選択時にカスタム入力欄を表示
    this.baudRateSelect.addEventListener('change', () => {
      const isCustom = this.baudRateSelect.value === 'custom';
      this.baudRateCustomInput.style.display = isCustom ? '' : 'none';
      if (isCustom) {
        this.baudRateCustomInput.focus();
      }
    });

    // 接続ボタン
    this.connectBtn.addEventListener('click', () => {
      this.onConnect?.(this.getConfig());
    });

    // 切断ボタン
    this.disconnectBtn.addEventListener('click', () => {
      this.onDisconnect?.();
    });
  }
}
