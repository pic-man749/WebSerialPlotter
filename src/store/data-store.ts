import { ParsedRecord } from '../types/index.js';

/** データ保持期間（ミリ秒）: 最大表示範囲60秒の2倍 */
const RETENTION_MS = 120_000;

/** プルーニング実行間隔（addRecord 呼び出し回数） */
const PRUNE_INTERVAL = 100;

/**
 * 時系列データの中央ストア
 * 列指向（columnar）データ構造で保持し、uPlot への効率的なデータ供給を実現する
 */
export class DataStore {
  /** タイムスタンプ配列（ミリ秒単位） */
  private timestamps: number[] = [];

  /** 系列データ（キー → 値配列、timestamps と同じ長さ） */
  private seriesData: Map<string, (number | null)[]> = new Map();

  /** プルーニングカウンター */
  private addCount = 0;

  /** 新しいキーが検出された時のコールバック */
  onNewKey: ((key: string) => void) | null = null;

  /** データが追加された時のコールバック */
  onDataUpdated: (() => void) | null = null;

  /**
   * データレコードを追加する
   */
  addRecord(record: ParsedRecord): void {
    this.timestamps.push(record.timestamp);

    // 既存の全系列について値を追加
    for (const [key, values] of this.seriesData) {
      const value = record.values.get(key);
      values.push(value ?? null);
    }

    // 新しいキーの検出と追加
    for (const [key, value] of record.values) {
      if (!this.seriesData.has(key)) {
        // 既存タイムスタンプ分は null で埋め、最後の1つだけ実際の値を設定
        const values: (number | null)[] = new Array(this.timestamps.length).fill(null);
        values[values.length - 1] = value;
        this.seriesData.set(key, values);
        this.onNewKey?.(key);
      }
    }

    // 遅延プルーニング
    this.addCount++;
    if (this.addCount >= PRUNE_INTERVAL) {
      this.addCount = 0;
      this.prune();
    }

    this.onDataUpdated?.();
  }

  /**
   * 登録済みの全キーを取得する
   */
  getKeys(): string[] {
    return Array.from(this.seriesData.keys());
  }

  /**
   * 全キーの最新値を取得する
   */
  getLatestValues(): Map<string, number> {
    const result = new Map<string, number>();
    for (const [key, values] of this.seriesData) {
      // 末尾から最初の非null値を探す
      for (let i = values.length - 1; i >= 0; i--) {
        if (values[i] !== null) {
          result.set(key, values[i] as number);
          break;
        }
      }
    }
    return result;
  }

  /**
   * uPlot用の列指向データを取得する
   * タイムスタンプは秒単位に変換済み
   * @param seriesKeys 取得する系列のキー配列（描画順）
   * @returns [timestamps[], series1[], series2[], ...]
   */
  getChartData(seriesKeys: string[]): [number[], ...(number | null)[][]] {
    // タイムスタンプをミリ秒→秒に変換
    const timestamps = this.timestamps.map(t => t / 1000);

    const result: [number[], ...(number | null)[][]] = [timestamps];

    for (const key of seriesKeys) {
      const values = this.seriesData.get(key);
      result.push(values ? [...values] : new Array(timestamps.length).fill(null));
    }

    return result;
  }

  /**
   * 全データをクリアする
   */
  clear(): void {
    this.timestamps = [];
    this.seriesData.clear();
    this.addCount = 0;
  }

  /**
   * 保持期間外の古いデータを一括削除する
   */
  private prune(): void {
    if (this.timestamps.length === 0) {
      return;
    }

    const cutoff = Date.now() - RETENTION_MS;

    // カットオフより新しい最初のインデックスを二分探索で求める
    let lo = 0;
    let hi = this.timestamps.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.timestamps[mid] < cutoff) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    if (lo === 0) {
      // 削除対象なし
      return;
    }

    // 配列先頭から一括削除
    this.timestamps = this.timestamps.slice(lo);
    for (const [key, values] of this.seriesData) {
      this.seriesData.set(key, values.slice(lo));
    }
  }
}
