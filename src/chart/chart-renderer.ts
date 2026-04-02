import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { ChartConfig, AxisConfig, SeriesConfig } from '../types/index.js';
import { DataStore } from '../store/data-store.js';

/** デフォルトのグラフ設定 */
const DEFAULT_CONFIG: ChartConfig = {
  fps: 60,
  timeRangeSec: 10,
  y1: { mode: 'auto', min: 0, max: 100 },
  y2: { mode: 'auto', min: 0, max: 100 },
};

/** グリッド・軸の色定義 */
const GRID_COLOR = 'rgba(255, 255, 255, 0.07)';
const AXIS_STROKE = 'rgba(139, 148, 158, 0.8)';
const AXIS_FONT = '14px system-ui, -apple-system, sans-serif';

/**
 * uPlot を使用したリアルタイムグラフ描画エンジン
 * FPS制御付きアニメーションループで時間軸を自動スクロールしながら描画する
 */
export class ChartRenderer {
  private container: HTMLElement;
  private dataStore: DataStore;

  /** uPlot インスタンス */
  private plot: uPlot | null = null;

  /** 現在のグラフ設定 */
  private config: ChartConfig = { ...DEFAULT_CONFIG };

  /** 系列設定の配列（描画順） */
  private seriesConfigs: SeriesConfig[] = [];

  /** アニメーションループのID */
  private animFrameId: number | null = null;

  /** 前回の描画時刻（ミリ秒） */
  private lastFrameTime = 0;

  /** 測定実行中フラグ */
  private _isRunning = false;

  /** コンテナサイズ監視用 */
  private resizeObserver: ResizeObserver;

  constructor(container: HTMLElement, dataStore: DataStore) {
    this.container = container;
    this.dataStore = dataStore;

    // コンテナのリサイズを監視
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);

    this.initPlot();
  }

  /** 測定実行中かどうか */
  get isRunning(): boolean {
    return this._isRunning;
  }

  /**
   * 測定開始（アニメーションループ開始）
   */
  start(): void {
    if (this._isRunning) return;
    this._isRunning = true;
    this.lastFrameTime = 0;
    this.scheduleFrame();
  }

  /**
   * 測定停止（アニメーションループ停止）
   */
  stop(): void {
    this._isRunning = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  /**
   * グラフ設定を更新する
   */
  updateConfig(partial: Partial<ChartConfig>): void {
    if (partial.fps !== undefined) {
      this.config.fps = partial.fps;
    }
    if (partial.timeRangeSec !== undefined) {
      this.config.timeRangeSec = partial.timeRangeSec;
    }
    if (partial.y1 !== undefined) {
      this.config.y1 = { ...this.config.y1, ...partial.y1 };
    }
    if (partial.y2 !== undefined) {
      this.config.y2 = { ...this.config.y2, ...partial.y2 };
    }

    // 軸レンジの設定を即座に反映
    this.applyAxisConfig();
  }

  /**
   * 系列設定を更新する（軸割り当て変更時など）
   */
  updateSeriesConfig(configs: SeriesConfig[]): void {
    this.seriesConfigs = configs;
    // uPlot を再構築して系列を反映
    this.rebuildPlot();
  }

  /**
   * 新しい系列を追加する
   */
  addSeries(config: SeriesConfig): void {
    this.seriesConfigs.push(config);
    this.rebuildPlot();
  }

  /**
   * コンテナリサイズ時に uPlot のサイズを更新する
   */
  resize(): void {
    if (!this.plot) return;
    const { width, height } = this.getPlotSize();
    this.plot.setSize({ width, height });
  }

  /**
   * リソースを解放する
   */
  destroy(): void {
    this.stop();
    this.resizeObserver.disconnect();
    if (this.plot) {
      this.plot.destroy();
      this.plot = null;
    }
  }

  /**
   * uPlot インスタンスを初期化する
   */
  private initPlot(): void {
    const { width, height } = this.getPlotSize();

    const opts: uPlot.Options = {
      width,
      height,
      ...this.buildScalesConfig(),
      axes: this.buildAxesConfig(),
      series: this.buildSeriesConfig(),
      cursor: {
        show: true,
        drag: { x: false, y: false },
      },
      legend: { show: false },
    };

    // 空データで初期化
    const data = this.buildEmptyData();
    this.plot = new uPlot(opts, data, this.container);
  }

  /**
   * uPlot を再構築する（系列変更時）
   */
  private rebuildPlot(): void {
    // 既存インスタンスを破棄
    if (this.plot) {
      this.plot.destroy();
      this.plot = null;
    }

    const { width, height } = this.getPlotSize();

    const opts: uPlot.Options = {
      width,
      height,
      ...this.buildScalesConfig(),
      axes: this.buildAxesConfig(),
      series: this.buildSeriesConfig(),
      cursor: {
        show: true,
        drag: { x: false, y: false },
      },
      legend: { show: false },
    };

    // DataStore から現在のデータを取得
    const keys = this.seriesConfigs.map(c => c.key);
    const data = keys.length > 0
      ? this.dataStore.getChartData(keys)
      : this.buildEmptyData();

    this.plot = new uPlot(opts, data, this.container);
  }

  /**
   * スケール設定を構築する
   */
  private buildScalesConfig(): { scales: uPlot.Scales } {
    return {
      scales: {
        x: { time: true },
        y1: {
          auto: this.config.y1.mode === 'auto',
          range: this.config.y1.mode === 'manual'
            ? [this.config.y1.min, this.config.y1.max]
            : undefined,
        },
        y2: {
          auto: this.config.y2.mode === 'auto',
          range: this.config.y2.mode === 'manual'
            ? [this.config.y2.min, this.config.y2.max]
            : undefined,
        },
      },
    };
  }

  /**
   * 軸設定を構築する
   */
  private buildAxesConfig(): uPlot.Axis[] {
    return [
      // X軸（時間軸 下部）：時刻のみ表示
      {
        stroke: AXIS_STROKE,
        font: AXIS_FONT,
        grid: { stroke: GRID_COLOR, width: 1 },
        ticks: { stroke: GRID_COLOR, width: 1 },
        values: (_u, splits) =>
          splits.map(ts => {
            const d = new Date(ts * 1000);
            const hh = String(d.getHours()).padStart(2, '0');
            const mm = String(d.getMinutes()).padStart(2, '0');
            const ss = String(d.getSeconds()).padStart(2, '0');
            return `${hh}:${mm}:${ss}`;
          }),
      },
      // Y1軸（左側）
      {
        scale: 'y1',
        side: 3,
        stroke: AXIS_STROKE,
        font: AXIS_FONT,
        grid: { stroke: GRID_COLOR, width: 1 },
        ticks: { stroke: GRID_COLOR, width: 1 },
        size: 60,
      },
      // Y2軸（右側）
      {
        scale: 'y2',
        side: 1,
        stroke: AXIS_STROKE,
        font: AXIS_FONT,
        grid: { show: false },
        ticks: { stroke: GRID_COLOR, width: 1 },
        size: 60,
      },
    ];
  }

  /**
   * uPlot の系列設定を構築する
   * 先頭の要素はX軸（時間軸）用の空オブジェクト
   */
  private buildSeriesConfig(): uPlot.Series[] {
    const series: uPlot.Series[] = [{}]; // X軸用

    for (const config of this.seriesConfigs) {
      series.push({
        label: config.key,
        scale: config.axis,
        stroke: config.color,
        width: 2,
        show: config.visible,
        spanGaps: true,
      });
    }

    return series;
  }

  /**
   * 空データ配列を生成する
   */
  private buildEmptyData(): uPlot.AlignedData {
    const arrays: number[][] = [[]]; // timestamps
    for (let i = 0; i < this.seriesConfigs.length; i++) {
      arrays.push([]);
    }
    return arrays as uPlot.AlignedData;
  }

  /**
   * コンテナから描画サイズを取得する
   */
  private getPlotSize(): { width: number; height: number } {
    const rect = this.container.getBoundingClientRect();
    // パネルのパディング分を考慮
    const width = Math.max(rect.width - 32, 200);
    const height = Math.max(rect.height - 32, 150);
    return { width, height };
  }

  /**
   * 軸レンジ設定を uPlot に即座に適用する
   */
  private applyAxisConfig(): void {
    if (!this.plot) return;

    this.plot.batch(() => {
      this.applyAxisRange('y1', this.config.y1);
      this.applyAxisRange('y2', this.config.y2);
    });
  }

  /**
   * 個別の軸レンジを適用する
   * uPlot は初期化時に auto を関数へ変換するため、直接ブーリアンを代入してはならない
   */
  private applyAxisRange(scaleKey: string, axisConfig: AxisConfig): void {
    if (!this.plot) return;

    if (axisConfig.mode === 'manual') {
      // uPlot の accScale は auto を関数として呼び出すため、ブール値ではなく関数を設定する
      this.plot.scales[scaleKey].auto = (_u: uPlot, _found: boolean) => false;
      this.plot.setScale(scaleKey, { min: axisConfig.min, max: axisConfig.max });
    } else {
      // auto モードへの切り替えは常に true を返す関数として設定する
      this.plot.scales[scaleKey].auto = () => true;
    }
  }

  /**
   * アニメーションフレームをスケジュールする
   */
  private scheduleFrame(): void {
    this.animFrameId = requestAnimationFrame((time) => this.renderFrame(time));
  }

  /**
   * 1フレームの描画処理
   * FPS制御に基づき、十分な時間が経過している場合のみ実際の描画を行う
   */
  private renderFrame(time: number): void {
    if (!this._isRunning) return;

    const frameInterval = 1000 / this.config.fps;

    if (time - this.lastFrameTime >= frameInterval) {
      this.lastFrameTime = time;
      this.drawChart();
    }

    this.scheduleFrame();
  }

  /**
   * グラフの描画を実行する
   * DataStore から最新データを取得し、時間軸を自動スクロールして描画する
   */
  private drawChart(): void {
    if (!this.plot) return;

    const nowSec = Date.now() / 1000;
    const minTime = nowSec - this.config.timeRangeSec;
    const maxTime = nowSec;

    // DataStore から系列キー順でデータを取得
    const keys = this.seriesConfigs.map(c => c.key);
    const data = keys.length > 0
      ? this.dataStore.getChartData(keys)
      : this.buildEmptyData();

    this.plot.batch(() => {
      // データ更新（true でスケール再計算を許可し、auto Y軸が反映される）
      this.plot!.setData(data, true);

      // 時間軸を自動スクロール（setData の x 自動計算を上書き）
      this.plot!.setScale('x', { min: minTime, max: maxTime });

      // 手動レンジの場合は軸を明示的に設定
      if (this.config.y1.mode === 'manual') {
        this.plot!.setScale('y1', { min: this.config.y1.min, max: this.config.y1.max });
      }
      if (this.config.y2.mode === 'manual') {
        this.plot!.setScale('y2', { min: this.config.y2.min, max: this.config.y2.max });
      }
    });
  }
}
