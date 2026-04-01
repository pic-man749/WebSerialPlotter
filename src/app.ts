import { SerialService } from './serial/serial-service.js';
import { DataParser } from './serial/data-parser.js';
import { DataStore } from './store/data-store.js';
import { ChartRenderer } from './chart/chart-renderer.js';
import { ConnectionPanel } from './ui/connection-panel.js';
import { SendPanel } from './ui/send-panel.js';
import { ChartControls } from './ui/chart-controls.js';
import { DataTable } from './ui/data-table.js';
import { Toast } from './ui/toast.js';
import { AxisId, SeriesConfig } from './types/index.js';

/** データ系列カラーパレット（CSS変数と同一の8色サイクル） */
const SERIES_COLORS = [
  '#58a6ff', '#3fb950', '#f85149', '#d29922',
  '#bc8cff', '#39d2c0', '#f778ba', '#79c0ff',
];

/**
 * アプリケーション初期化・イベント結合を担当するクラス
 * 全コンポーネントのライフサイクルとデータフローの結合を管理する
 */
export class App {
  private serialService!: SerialService;
  private dataParser!: DataParser;
  private dataStore!: DataStore;
  private chartRenderer!: ChartRenderer;
  private connectionPanel!: ConnectionPanel;
  private sendPanel!: SendPanel;
  private chartControls!: ChartControls;
  private dataTable!: DataTable;
  private toast!: Toast;

  /** 系列設定（キー → 設定）。キー検出順を保持する */
  private seriesConfigMap: Map<string, SeriesConfig> = new Map();

  /** 次に割り当てるカラーパレットのインデックス */
  private nextColorIndex = 0;

  /**
   * Web Serial API のサポートチェックとUI初期化を行う
   */
  init(): void {
    // Web Serial API サポートチェック
    if (!('serial' in navigator)) {
      const overlay = document.getElementById('unsupported-overlay');
      if (overlay) {
        overlay.hidden = false;
      }
      return;
    }

    this.initServices();
    this.initUI();
    this.bindEvents();
  }

  /**
   * サービス層のインスタンスを生成する
   */
  private initServices(): void {
    this.serialService = new SerialService();
    this.dataParser = new DataParser();
    this.dataStore = new DataStore();
  }

  /**
   * UIコンポーネントとChartRendererを初期化する
   */
  private initUI(): void {
    this.connectionPanel = new ConnectionPanel(
      document.getElementById('connection-panel')!,
    );
    this.sendPanel = new SendPanel(
      document.getElementById('send-panel')!,
    );
    this.chartControls = new ChartControls(
      document.getElementById('chart-controls')!,
    );
    this.dataTable = new DataTable(
      document.getElementById('data-table')!,
    );
    this.chartRenderer = new ChartRenderer(
      document.getElementById('chart-area')!,
      this.dataStore,
    );
    this.toast = new Toast(
      document.getElementById('toast-container')!,
    );
  }

  /**
   * 全コンポーネント間のイベント結合を行う
   */
  private bindEvents(): void {
    this.bindDataReceiveFlow();
    this.bindConnectionFlow();
    this.bindSendFlow();
    this.bindChartControlFlow();
    this.bindAxisAssignmentFlow();
  }

  // ─── データ受信フロー ───

  /**
   * SerialService → DataParser → DataStore → DataTable / ChartRenderer のフローを結合する
   */
  private bindDataReceiveFlow(): void {
    // シリアル受信 → パース → ストア蓄積
    this.serialService.onReceive = (chunk: string) => {
      const records = this.dataParser.pushChunk(chunk, Date.now());
      for (const record of records) {
        this.dataStore.addRecord(record);
      }
    };

    // 新規キー検出 → テーブル行追加 + グラフ系列追加
    this.dataStore.onNewKey = (key: string) => {
      const color = SERIES_COLORS[this.nextColorIndex % SERIES_COLORS.length];
      this.nextColorIndex++;

      const config: SeriesConfig = {
        key,
        axis: 'y1',
        color,
        visible: true,
      };
      this.seriesConfigMap.set(key, config);

      this.dataTable.addKey(key, color);
      this.chartRenderer.addSeries(config);
    };

    // データ更新 → テーブルの最新値を更新
    this.dataStore.onDataUpdated = () => {
      const latestValues = this.dataStore.getLatestValues();
      this.dataTable.updateValues(latestValues);
    };
  }

  // ─── 接続操作フロー ───

  /**
   * ConnectionPanel ↔ SerialService の接続・切断フローを結合する
   */
  private bindConnectionFlow(): void {
    // 接続要求
    this.connectionPanel.onConnect = async (config) => {
      try {
        await this.serialService.connect(config);
      } catch (error) {
        // ユーザーキャンセル（NotAllowedError）は無視
        if (error instanceof DOMException && error.name === 'NotAllowedError') {
          return;
        }
        const message = error instanceof Error ? error.message : '不明なエラー';
        this.toast.show(`接続に失敗しました: ${message}`);
        console.error('接続エラー:', error);
      }
    };

    // 切断要求
    this.connectionPanel.onDisconnect = async () => {
      try {
        await this.serialService.disconnect();
      } catch (error) {
        const message = error instanceof Error ? error.message : '不明なエラー';
        this.toast.show(`切断に失敗しました: ${message}`);
        console.error('切断エラー:', error);
      }
    };

    // 接続状態変化 → UI更新
    this.serialService.onStateChange = (state) => {
      this.connectionPanel.updateState(state);
      this.sendPanel.setEnabled(state === 'connected');
    };

    // エラー通知（予期しない切断等）
    this.serialService.onError = (error) => {
      this.toast.show(`シリアル通信エラー: ${error.message}`, 'warning');
      console.error('シリアル通信エラー:', error);
    };
  }

  // ─── 送信フロー ───

  /**
   * SendPanel → SerialService の送信フローを結合する
   */
  private bindSendFlow(): void {
    this.sendPanel.onSend = async (data, displayText) => {
      try {
        await this.serialService.send(data);
        this.sendPanel.addHistory({
          timestamp: Date.now(),
          data: displayText,
          raw: data,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : '不明なエラー';
        this.toast.show(`送信に失敗しました: ${message}`);
        console.error('送信エラー:', error);
      }
    };
  }

  // ─── グラフ制御フロー ───

  /**
   * ChartControls → ChartRenderer の制御フローを結合する
   */
  private bindChartControlFlow(): void {
    // 測定開始/停止
    this.chartControls.onMeasurementToggle = (running) => {
      if (running) {
        this.chartRenderer.start();
      } else {
        this.chartRenderer.stop();
      }
    };

    // グラフ設定変更（FPS、時間幅、軸レンジ）
    this.chartControls.onConfigChange = (config) => {
      this.chartRenderer.updateConfig(config);
    };
  }

  // ─── 軸割り当てフロー ───

  /**
   * DataTable の軸選択変更 → ChartRenderer の系列設定更新フローを結合する
   */
  private bindAxisAssignmentFlow(): void {
    this.dataTable.onAxisChange = (key: string, axis: AxisId) => {
      const config = this.seriesConfigMap.get(key);
      if (!config) return;

      config.axis = axis;
      // 全系列設定を配列として渡して再構築
      const allConfigs = Array.from(this.seriesConfigMap.values());
      this.chartRenderer.updateSeriesConfig(allConfigs);
    };
  }
}
