/** シリアル接続設定 */
export interface SerialConfig {
  baudRate: number;
  dataBits: 7 | 8;
  stopBits: 1 | 2;
  parity: 'none' | 'even' | 'odd';
  flowControl: 'none' | 'hardware';
}

/** パース済み受信データ（1行分） */
export interface ParsedRecord {
  timestamp: number;
  values: Map<string, number>;
}

/** 送信履歴エントリ */
export interface SendHistoryEntry {
  timestamp: number;
  data: string;
  raw: Uint8Array;
}

/** 縦軸種別 */
export type AxisId = 'y1' | 'y2';

/** 縦軸表示範囲モード */
export type AxisRangeMode = 'auto' | 'manual';

/** 縦軸設定 */
export interface AxisConfig {
  mode: AxisRangeMode;
  min: number;
  max: number;
}

/** データ系列の表示設定 */
export interface SeriesConfig {
  key: string;
  axis: AxisId;
  color: string;
  visible: boolean;
}

/** グラフ設定 */
export interface ChartConfig {
  fps: number;
  timeRangeSec: number;
  y1: AxisConfig;
  y2: AxisConfig;
}

/** 接続状態 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected';

/** 入力形式 */
export type InputMode = 'text' | 'binary';

/** 改行コード */
export type LineEnding = 'none' | 'cr' | 'lf' | 'crlf';
