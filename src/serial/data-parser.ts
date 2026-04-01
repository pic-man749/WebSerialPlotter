import { ParsedRecord } from '../types/index.js';

/**
 * 受信テキストチャンクを行単位で解析し、構造化データに変換するパーサー
 * 不完全な行はバッファに保持し、次のチャンク到着時に結合して処理する
 */
export class DataParser {
  /** 不完全行のバッファ */
  private buffer = '';

  /**
   * テキストチャンクを追加し、完成した行をパースして返す
   * @param chunk 受信テキストチャンク
   * @param timestamp 受信時刻（Date.now() ミリ秒）
   * @returns パース済みレコードの配列
   */
  pushChunk(chunk: string, timestamp: number): ParsedRecord[] {
    this.buffer += chunk;

    // 改行で分割
    const lines = this.buffer.split('\n');

    // 最後の要素は不完全行としてバッファに残す
    this.buffer = lines.pop() ?? '';

    const records: ParsedRecord[] = [];

    for (const rawLine of lines) {
      const record = this.parseLine(rawLine, timestamp);
      if (record) {
        records.push(record);
      }
    }

    return records;
  }

  /**
   * 内部バッファをリセットする
   */
  reset(): void {
    this.buffer = '';
  }

  /**
   * 1行分のテキストをパースする
   * 形式: key1:value1,key2:value2,...
   * @returns パース成功時は ParsedRecord、失敗時は null
   */
  private parseLine(rawLine: string, timestamp: number): ParsedRecord | null {
    // '\r' を除去
    const line = rawLine.replace(/\r/g, '');

    // 空行はスキップ
    if (line.length === 0) {
      return null;
    }

    const values = new Map<string, number>();

    // ',' で項目分割
    const items = line.split(',');
    for (const item of items) {
      // ':' で key/value に分割
      const colonIndex = item.indexOf(':');
      if (colonIndex === -1) {
        // コロンがない項目はスキップ
        continue;
      }

      const key = item.substring(0, colonIndex).trim();
      const valueStr = item.substring(colonIndex + 1).trim();

      if (key.length === 0) {
        continue;
      }

      const value = parseFloat(valueStr);
      if (Number.isNaN(value)) {
        // 数値変換に失敗した項目はスキップ
        continue;
      }

      values.set(key, value);
    }

    // 有効なキーが1つもなければレコードとして扱わない
    if (values.size === 0) {
      return null;
    }

    return { timestamp, values };
  }
}
