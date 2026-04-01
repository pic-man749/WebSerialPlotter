import { ChartConfig, AxisRangeMode } from '../types/index.js';

/**
 * グラフ操作パネル
 * 測定開始/停止、FPS、時間幅、縦軸レンジの設定UIを提供する
 */
export class ChartControls {
  private container: HTMLElement;

  // フォーム要素
  private measureBtn!: HTMLButtonElement;
  private fpsSlider!: HTMLInputElement;
  private fpsValue!: HTMLElement;
  private timeRangeSlider!: HTMLInputElement;
  private timeRangeValue!: HTMLElement;
  private y1AutoRadio!: HTMLInputElement;
  private y1ManualRadio!: HTMLInputElement;
  private y1MinInput!: HTMLInputElement;
  private y1MaxInput!: HTMLInputElement;
  private y2AutoRadio!: HTMLInputElement;
  private y2ManualRadio!: HTMLInputElement;
  private y2MinInput!: HTMLInputElement;
  private y2MaxInput!: HTMLInputElement;

  /** 現在の測定実行状態 */
  private running = false;

  /** 測定開始/停止トグル時のコールバック */
  onMeasurementToggle: ((running: boolean) => void) | null = null;

  /** グラフ設定変更時のコールバック */
  onConfigChange: ((config: Partial<ChartConfig>) => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.buildDOM();
    this.bindEvents();
    this.updateAxisInputState();
  }

  /**
   * DOM構造を構築する
   */
  private buildDOM(): void {
    this.container.innerHTML = `
      <h2 class="panel__title">グラフ操作</h2>

      <!-- 1行目: 測定ボタン・FPS・時間幅 -->
      <div class="form-row" style="margin-bottom: var(--spacing-xs);">
        <button class="btn btn--success" id="measure-btn">● 測定開始</button>

        <div class="form-group" style="flex: 1;">
          <label class="form-group__label" for="fps-slider">FPS</label>
          <input class="slider" id="fps-slider" type="range" min="1" max="60" step="1" value="30" />
          <span class="form-group__label" id="fps-value" style="min-width: 2.5em; text-align: right;">30</span>
        </div>

        <div class="form-group" style="flex: 1;">
          <label class="form-group__label" for="time-range-slider">時間幅</label>
          <input class="slider" id="time-range-slider" type="range" min="1" max="60" step="1" value="10" />
          <span class="form-group__label" id="time-range-value" style="min-width: 3.5em; text-align: right;">10秒</span>
        </div>
      </div>

      <!-- 2行目: Y1軸設定 -->
      <div class="form-row" style="margin-bottom: var(--spacing-xs);">
        <span class="form-group__label" style="min-width: 3em;">Y1軸</span>
        <label class="radio-label">
          <input type="radio" name="y1-mode" value="auto" checked id="y1-auto" />
          自動
        </label>
        <label class="radio-label">
          <input type="radio" name="y1-mode" value="manual" id="y1-manual" />
          手動
        </label>
        <div class="form-group">
          <label class="form-group__label" for="y1-min">Min</label>
          <input class="input" id="y1-min" type="number" style="width: 80px;" value="0" disabled />
        </div>
        <div class="form-group">
          <label class="form-group__label" for="y1-max">Max</label>
          <input class="input" id="y1-max" type="number" style="width: 80px;" value="100" disabled />
        </div>
      </div>

      <!-- 3行目: Y2軸設定 -->
      <div class="form-row">
        <span class="form-group__label" style="min-width: 3em;">Y2軸</span>
        <label class="radio-label">
          <input type="radio" name="y2-mode" value="auto" checked id="y2-auto" />
          自動
        </label>
        <label class="radio-label">
          <input type="radio" name="y2-mode" value="manual" id="y2-manual" />
          手動
        </label>
        <div class="form-group">
          <label class="form-group__label" for="y2-min">Min</label>
          <input class="input" id="y2-min" type="number" style="width: 80px;" value="0" disabled />
        </div>
        <div class="form-group">
          <label class="form-group__label" for="y2-max">Max</label>
          <input class="input" id="y2-max" type="number" style="width: 80px;" value="100" disabled />
        </div>
      </div>
    `;

    // DOM要素の参照を保持
    this.measureBtn = this.container.querySelector('#measure-btn') as HTMLButtonElement;
    this.fpsSlider = this.container.querySelector('#fps-slider') as HTMLInputElement;
    this.fpsValue = this.container.querySelector('#fps-value') as HTMLElement;
    this.timeRangeSlider = this.container.querySelector('#time-range-slider') as HTMLInputElement;
    this.timeRangeValue = this.container.querySelector('#time-range-value') as HTMLElement;
    this.y1AutoRadio = this.container.querySelector('#y1-auto') as HTMLInputElement;
    this.y1ManualRadio = this.container.querySelector('#y1-manual') as HTMLInputElement;
    this.y1MinInput = this.container.querySelector('#y1-min') as HTMLInputElement;
    this.y1MaxInput = this.container.querySelector('#y1-max') as HTMLInputElement;
    this.y2AutoRadio = this.container.querySelector('#y2-auto') as HTMLInputElement;
    this.y2ManualRadio = this.container.querySelector('#y2-manual') as HTMLInputElement;
    this.y2MinInput = this.container.querySelector('#y2-min') as HTMLInputElement;
    this.y2MaxInput = this.container.querySelector('#y2-max') as HTMLInputElement;
  }

  /**
   * イベントリスナーを登録する
   */
  private bindEvents(): void {
    // 測定開始/停止トグル
    this.measureBtn.addEventListener('click', () => {
      this.running = !this.running;
      this.updateMeasureButton();
      this.onMeasurementToggle?.(this.running);
    });

    // FPSスライダー
    this.fpsSlider.addEventListener('input', () => {
      const fps = parseInt(this.fpsSlider.value, 10);
      this.fpsValue.textContent = String(fps);
      this.onConfigChange?.({ fps });
    });

    // 時間幅スライダー
    this.timeRangeSlider.addEventListener('input', () => {
      const timeRangeSec = parseInt(this.timeRangeSlider.value, 10);
      this.timeRangeValue.textContent = `${timeRangeSec}秒`;
      this.onConfigChange?.({ timeRangeSec });
    });

    // Y1軸モード変更
    this.y1AutoRadio.addEventListener('change', () => this.handleAxisModeChange('y1'));
    this.y1ManualRadio.addEventListener('change', () => this.handleAxisModeChange('y1'));

    // Y2軸モード変更
    this.y2AutoRadio.addEventListener('change', () => this.handleAxisModeChange('y2'));
    this.y2ManualRadio.addEventListener('change', () => this.handleAxisModeChange('y2'));

    // Y1軸手動値変更
    this.y1MinInput.addEventListener('change', () => this.emitAxisConfig('y1'));
    this.y1MaxInput.addEventListener('change', () => this.emitAxisConfig('y1'));

    // Y2軸手動値変更
    this.y2MinInput.addEventListener('change', () => this.emitAxisConfig('y2'));
    this.y2MaxInput.addEventListener('change', () => this.emitAxisConfig('y2'));
  }

  /**
   * 測定ボタンの表示を更新する
   */
  private updateMeasureButton(): void {
    if (this.running) {
      this.measureBtn.textContent = '■ 測定停止';
      this.measureBtn.classList.remove('btn--success');
      this.measureBtn.classList.add('btn--danger');
    } else {
      this.measureBtn.textContent = '● 測定開始';
      this.measureBtn.classList.remove('btn--danger');
      this.measureBtn.classList.add('btn--success');
    }
  }

  /**
   * 軸モード変更を処理する
   */
  private handleAxisModeChange(axis: 'y1' | 'y2'): void {
    this.updateAxisInputState();
    this.emitAxisConfig(axis);
  }

  /**
   * 軸の手動入力欄の有効/無効を更新する
   */
  private updateAxisInputState(): void {
    const y1Manual = this.y1ManualRadio.checked;
    this.y1MinInput.disabled = !y1Manual;
    this.y1MaxInput.disabled = !y1Manual;

    const y2Manual = this.y2ManualRadio.checked;
    this.y2MinInput.disabled = !y2Manual;
    this.y2MaxInput.disabled = !y2Manual;
  }

  /**
   * 軸設定のコールバックを発火する
   */
  private emitAxisConfig(axis: 'y1' | 'y2'): void {
    const isY1 = axis === 'y1';
    const mode: AxisRangeMode = isY1
      ? (this.y1ManualRadio.checked ? 'manual' : 'auto')
      : (this.y2ManualRadio.checked ? 'manual' : 'auto');
    const minInput = isY1 ? this.y1MinInput : this.y2MinInput;
    const maxInput = isY1 ? this.y1MaxInput : this.y2MaxInput;

    const config: Partial<ChartConfig> = {
      [axis]: {
        mode,
        min: parseFloat(minInput.value) || 0,
        max: parseFloat(maxInput.value) || 100,
      },
    };

    this.onConfigChange?.(config);
  }
}
