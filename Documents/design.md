# 設計書: Web Serial Plotter

## 1. 技術スタック

| カテゴリ | 技術 | バージョン | 選定理由 |
|---------|------|-----------|---------|
| 言語 | TypeScript | 5.x | 型安全性による開発効率・保守性向上 |
| ビルドツール | Vite | 6.x | 高速ビルド、TypeScript標準対応、設定が最小限 |
| パッケージ管理 | npm | - | 標準的なパッケージマネージャ |
| グラフライブラリ | uPlot | 1.x | Canvasベース高速時系列描画、軽量（~35KB）、2軸対応 |
| CSS | CSS Custom Properties | - | ライブラリ不使用、軽量、テーマ管理が容易 |
| フレームワーク | なし（Vanilla TypeScript） | - | 静的サイト要件に合致、依存最小化 |

## 2. アーキテクチャ概要

### 2.1 設計方針

- レイヤードアーキテクチャを採用し、関心の分離を実現する
- シリアル通信・データ管理・UI描画を独立したモジュールとして構成する
- モジュール間の結合はコールバックベースで疎結合に保つ
- フレームワークは使用せず、Vanilla TypeScript + DOM API で構成する

### 2.2 レイヤー構成

```
┌─────────────────────────────────────────────┐
│             UIコンポーネント層                │
│  ConnectionPanel / SendPanel /              │
│  ChartControls / DataTable                  │
├─────────────────────────────────────────────┤
│             アプリケーション層               │
│  App（コンポーネント初期化・イベント結合）     │
├─────────────────────────────────────────────┤
│             ドメイン層                       │
│  DataStore / DataParser                     │
├─────────────────────────────────────────────┤
│             インフラ層                       │
│  SerialService（Web Serial API）            │
│  ChartRenderer（uPlot）                     │
└─────────────────────────────────────────────┘
```

- **UIコンポーネント層**: DOM構築・ユーザー操作の受付・表示更新を担当
- **アプリケーション層**: 各コンポーネントの初期化とイベント結合を担当
- **ドメイン層**: データの解析・蓄積・加工のビジネスロジックを担当
- **インフラ層**: 外部API（Web Serial API）やライブラリ（uPlot）とのインターフェースを担当

## 3. ディレクトリ構成

```
WebSerialPlotter/
├── Documents/
│   ├── requirement.md
│   ├── design.md
│   └── tasks.md
├── src/
│   ├── index.html                  # HTMLエントリポイント
│   ├── main.ts                     # JSエントリポイント
│   ├── app.ts                      # アプリケーション初期化・結合
│   ├── types/
│   │   └── index.ts                # 型定義
│   ├── serial/
│   │   ├── serial-service.ts       # Web Serial API ラッパー
│   │   └── data-parser.ts          # 受信データパーサー
│   ├── store/
│   │   └── data-store.ts           # 時系列データストア
│   ├── chart/
│   │   └── chart-renderer.ts       # uPlot ラッパー・アニメーション制御
│   ├── ui/
│   │   ├── connection-panel.ts     # 接続設定パネル
│   │   ├── send-panel.ts           # 送信パネル
│   │   ├── chart-controls.ts       # グラフ操作パネル
│   │   └── data-table.ts           # データ一覧テーブル
│   └── styles/
│       ├── variables.css            # CSS変数定義（カラー・スペーシング）
│       ├── base.css                 # リセット・ベーススタイル
│       ├── layout.css               # 全体レイアウト
│       └── components.css           # コンポーネント個別スタイル
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## 4. モジュール設計

### 4.1 型定義 (`types/index.ts`)

```typescript
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
  timestamp: number;           // Date.now() ミリ秒
  values: Map<string, number>; // key → value
}

/** 送信履歴エントリ */
export interface SendHistoryEntry {
  timestamp: number;           // Date.now() ミリ秒
  data: string;                // 表示用テキスト
  raw: Uint8Array;             // 実際に送信したバイト列
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
  fps: number;            // 1〜60
  timeRangeSec: number;   // 1〜60
  y1: AxisConfig;
  y2: AxisConfig;
}

/** 接続状態 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected';

/** 入力形式 */
export type InputMode = 'text' | 'binary';

/** 改行コード */
export type LineEnding = 'none' | 'cr' | 'lf' | 'crlf';
```

### 4.2 シリアル通信層

#### 4.2.1 SerialService (`serial/serial-service.ts`)

Web Serial API のラッパーサービス。

**責務:**
- シリアルポートの選択・接続・切断
- 受信データの読み取り（ReadableStream + TextDecoderStream）
- データ送信（WritableStream）
- 接続状態の管理・通知

**公開インターフェース:**

```typescript
class SerialService {
  /** 現在の接続状態 */
  readonly state: ConnectionState;

  /** ポート選択ダイアログを表示し接続する */
  async connect(config: SerialConfig): Promise<void>;

  /** 接続中のポートを切断する */
  async disconnect(): Promise<void>;

  /** データを送信する */
  async send(data: Uint8Array): Promise<void>;

  /** コールバック: テキストチャンク受信時 */
  onReceive: ((chunk: string) => void) | null;

  /** コールバック: 接続状態変化時 */
  onStateChange: ((state: ConnectionState) => void) | null;

  /** コールバック: エラー発生時 */
  onError: ((error: Error) => void) | null;
}
```

**内部動作:**

1. `connect()` 呼び出し時:
   - `navigator.serial.requestPort()` でブラウザのポート選択ダイアログを表示
   - ユーザーが選択したポートに対し `port.open(config)` で接続
   - 接続成功後、非同期の読み取りループを開始
   - 読み取りループは `port.readable` から `TextDecoderStream` を経由してテキストチャンクを取得し `onReceive` に通知

2. `disconnect()` 呼び出し時:
   - 読み取りループのリーダーを `cancel()` → `releaseLock()`
   - `port.close()` でポートを閉じる
   - 接続状態を `disconnected` に更新

3. `send()` 呼び出し時:
   - `port.writable` から `WritableStream` のライターを取得
   - `writer.write(data)` でバイト列を送信
   - ライターを `releaseLock()`

**予期しない切断の検出:**
- 読み取りループ内の例外をキャッチ
- `navigator.serial` の `disconnect` イベントを監視
- いずれの場合も接続状態を `disconnected` に更新し `onError` で通知

#### 4.2.2 DataParser (`serial/data-parser.ts`)

受信テキストチャンクを行単位で解析し、構造化データに変換する。

**責務:**
- テキストチャンクのバッファリングと行分割
- `key:value,key:value,...` 形式のパース
- 数値バリデーション

**公開インターフェース:**

```typescript
class DataParser {
  /** テキストチャンクを追加し、完成した行をパースして返す */
  pushChunk(chunk: string, timestamp: number): ParsedRecord[];

  /** 内部バッファをリセットする */
  reset(): void;
}
```

**パース処理フロー:**

```
受信チャンク → バッファに追記
              → '\n' で分割
              → 完成行ごとに:
                  1. '\r' を除去
                  2. 空行はスキップ
                  3. ',' で項目分割
                  4. 各項目を ':' で key/value に分割
                  5. value を parseFloat() で数値変換
                  6. NaN の場合はその項目をスキップ
              → 末尾の不完全行はバッファに残す
```

### 4.3 データ管理層

#### DataStore (`store/data-store.ts`)

時系列データの中央ストア。列指向（columnar）データ構造で保持し、uPlot への効率的なデータ供給を実現する。

**責務:**
- 受信データの蓄積
- 系列（キー）ごとの管理
- uPlot 用の列指向データ構造の生成
- 古いデータの自動削除（プルーニング）
- 新規キー検出の通知

**公開インターフェース:**

```typescript
class DataStore {
  /** データレコードを追加する */
  addRecord(record: ParsedRecord): void;

  /** 登録済みの全キーを取得する */
  getKeys(): string[];

  /** 全キーの最新値を取得する */
  getLatestValues(): Map<string, number>;

  /** uPlot用の列指向データを取得する（timestampは秒単位に変換済み） */
  getChartData(seriesKeys: string[]): [number[], ...(number | null)[][]];

  /** 全データをクリアする */
  clear(): void;

  /** コールバック: 新しいキーが検出された時 */
  onNewKey: ((key: string) => void) | null;

  /** コールバック: データが追加された時 */
  onDataUpdated: (() => void) | null;
}
```

**内部データ構造:**

```typescript
// タイムスタンプ配列（ミリ秒単位で保持、uPlot出力時に秒単位へ変換）
private timestamps: number[] = [];

// 系列データ（キー → 値配列、timestampsと同じ長さ）
private seriesData: Map<string, (number | null)[]> = new Map();
```

**データ追加処理:**

1. `timestamps` 配列に受信時刻を追加
2. 既存の全系列について:
   - 受信データにキーが含まれていれば値を追加
   - 含まれていなければ `null` を追加
3. 受信データに新しいキーが含まれていれば:
   - 新しい値配列を作成（既存タイムスタンプ分は `null` で埋める）
   - `onNewKey` コールバックで通知

**データ保持ポリシー:**

| 項目 | 値 |
|------|-----|
| 保持期間 | 120秒（最大表示範囲60秒の2倍） |
| プルーニング頻度 | データ追加100回ごと |
| プルーニング方法 | 保持期間外のデータを配列先頭から一括削除 |

### 4.4 グラフ描画層

#### ChartRenderer (`chart/chart-renderer.ts`)

uPlot を使用したリアルタイムグラフ描画エンジン。

**責務:**
- uPlot インスタンスの生成・管理
- FPS制御付きアニメーションループの実行
- 時間軸の自動スクロール
- 系列の動的追加・設定変更
- 縦軸設定の反映

**公開インターフェース:**

```typescript
class ChartRenderer {
  constructor(container: HTMLElement, dataStore: DataStore);

  /** 測定開始（アニメーションループ開始） */
  start(): void;

  /** 測定停止（アニメーションループ停止） */
  stop(): void;

  /** 動作中かどうか */
  readonly isRunning: boolean;

  /** グラフ設定を更新する */
  updateConfig(config: Partial<ChartConfig>): void;

  /** 系列設定を更新する（軸割り当て、表示/非表示、色） */
  updateSeriesConfig(configs: SeriesConfig[]): void;

  /** 系列を追加する（新しいキー検出時に呼び出す） */
  addSeries(config: SeriesConfig): void;

  /** コンテナリサイズ時の再描画 */
  resize(): void;

  /** リソースを解放する */
  destroy(): void;
}
```

**アニメーションループ:**

```
requestAnimationFrame ──┐
         │              │
         ▼              │
  経過時間チェック        │
  (1000/fps ms 未満?)    │
    YES → スキップ ──────┘
    NO  ↓
  現在時刻を取得 (now)
  表示範囲を算出: [now - timeRangeSec, now]  ※秒単位
  DataStore.getChartData() で表示データを取得
  uPlot.setData() でデータ更新
  uPlot.setScale('x', {min, max}) で時間軸更新
         │
         └→ requestAnimationFrame ──→ ループ継続
```

**uPlot 構成:**

| 設定項目 | 値 |
|---------|-----|
| X軸スケール | `time: true`、UNIXタイムスタンプ（秒単位） |
| Y1軸（左） | scale名 `'y1'`、`side: 3`（左側） |
| Y2軸（右） | scale名 `'y2'`、side: `1`（右側） |
| 系列 | 動的追加（新キー検出時に `addSeries()` で追加） |

**uPlot タイムスタンプ形式:**
- uPlot は X軸の時刻をUNIX秒（小数点以下あり）で扱う
- DataStore 内部はミリ秒で保持し、`getChartData()` で秒単位に変換して返す

**縦軸の自動レンジ算出:**
- `auto` モード時: uPlot 組み込みの `auto` スケーリングを使用
- `manual` モード時: `uPlot.setScale()` でユーザー指定の min/max を設定

### 4.5 UIコンポーネント層

各UIコンポーネントは以下の共通パターンに従う:
- コンストラクタで親 `HTMLElement` を受け取り、自身のDOM構造を構築・追加する
- ユーザー操作はコールバックプロパティで外部に通知する
- 外部からの状態更新は公開メソッドで受け付ける

#### 4.5.1 ConnectionPanel (`ui/connection-panel.ts`)

**責務:** シリアル接続の設定操作UI

**UI要素:**

| 要素 | 種類 | 詳細 |
|------|------|------|
| ボーレート | セレクト + カスタム入力 | プリセット: 9600 / 19200 / 38400 / 57600 / 115200、カスタム値入力可 |
| データビット | セレクト | 7 / 8（デフォルト: 8） |
| ストップビット | セレクト | 1 / 2（デフォルト: 1） |
| パリティ | セレクト | none / even / odd（デフォルト: none） |
| フロー制御 | セレクト | none / hardware（デフォルト: none） |
| 接続ボタン | ボタン | クリックでポート選択ダイアログ→接続 |
| 切断ボタン | ボタン | クリックで切断 |
| 接続状態 | テキスト + アイコン | 色による視覚的フィードバック（緑: 接続中、灰: 切断中） |

**コールバック:**
```typescript
onConnect: ((config: SerialConfig) => void) | null;
onDisconnect: (() => void) | null;
```

**公開メソッド:**
```typescript
/** 接続状態の表示を更新する */
updateState(state: ConnectionState): void;
```

#### 4.5.2 SendPanel (`ui/send-panel.ts`)

**責務:** データ送信と送信履歴表示

**UI要素:**

| 要素 | 種類 | 詳細 |
|------|------|------|
| 入力形式 | セレクト | テキスト / バイナリ（16進数） |
| 入力欄 | テキストインプット | テキストモード: 任意文字列、バイナリモード: スペース区切り16進数（例: `48 65 6C 6C 6F`） |
| 改行コード | セレクト | なし / CR (`\r`) / LF (`\n`) / CRLF (`\r\n`) |
| 送信ボタン | ボタン | クリックまたはEnterキーで送信 |
| 送信履歴 | スクロールリスト | 新しい順に表示、各行に送信時刻（HH:MM:SS）と送信内容を表示 |

**送信履歴の保持上限:** 最新50件

**コールバック:**
```typescript
onSend: ((data: Uint8Array, displayText: string) => void) | null;
```

**公開メソッド:**
```typescript
/** 送信履歴にエントリを追加する */
addHistory(entry: SendHistoryEntry): void;

/** 送信ボタンの有効/無効状態を制御する */
setEnabled(enabled: boolean): void;
```

**バイナリ入力のバリデーション:**
- 有効な16進数文字（0-9, A-F, a-f）とスペースのみ許可
- 各トークンが2文字以下の16進数であること
- 不正入力時はインラインでエラーメッセージを表示

#### 4.5.3 ChartControls (`ui/chart-controls.ts`)

**責務:** グラフ描画の制御UI

**UI要素:**

| 要素 | 種類 | 詳細 |
|------|------|------|
| 測定開始/停止 | トグルボタン | 状態に応じてラベル・色が切り替わる |
| FPSスライダー | レンジスライダー | min: 1、max: 60、step: 1、初期値: 30、右側に現在値ラベル |
| 時間幅スライダー | レンジスライダー | min: 1、max: 60、step: 1、初期値: 10、右側に現在値ラベル（単位: 秒） |
| Y1軸モード | ラジオボタン | 自動 / 手動 |
| Y1軸 最小値 | 数値入力 | 手動モード時のみ有効 |
| Y1軸 最大値 | 数値入力 | 手動モード時のみ有効 |
| Y2軸モード | ラジオボタン | 自動 / 手動 |
| Y2軸 最小値 | 数値入力 | 手動モード時のみ有効 |
| Y2軸 最大値 | 数値入力 | 手動モード時のみ有効 |

**コールバック:**
```typescript
onMeasurementToggle: ((running: boolean) => void) | null;
onConfigChange: ((config: Partial<ChartConfig>) => void) | null;
```

#### 4.5.4 DataTable (`ui/data-table.ts`)

**責務:** 受信データキーの一覧と最新値の表示、軸割り当て管理

**UI要素:**

| 列 | 内容 |
|----|------|
| 色 | 該当系列のグラフ描画色を示す小さな色付き矩形（カラーインジケータ） |
| キー名 | 受信データのキー文字列 |
| 最新値 | 該当キーの最新の値（数値テキスト） |
| 軸選択 | ドロップダウン（Y1 / Y2）、デフォルトは Y1 |

**コールバック:**
```typescript
onAxisChange: ((key: string, axis: AxisId) => void) | null;
```

**公開メソッド:**
```typescript
/** 新しいキーの行を追加する */
addKey(key: string, color: string): void;

/** 最新値を更新する */
updateValues(values: Map<string, number>): void;
```

**動作:**
- 新しいキーが検出されると自動的にテーブルに行が追加される
- 最新値は `textContent` の差分更新のみ行い、DOM操作を最小化する

### 4.6 アプリケーション初期化 (`app.ts`)

**責務:** 全コンポーネントの初期化、イベント結合、アプリケーションライフサイクル管理

```typescript
class App {
  private serialService: SerialService;
  private dataParser: DataParser;
  private dataStore: DataStore;
  private chartRenderer: ChartRenderer;
  private connectionPanel: ConnectionPanel;
  private sendPanel: SendPanel;
  private chartControls: ChartControls;
  private dataTable: DataTable;

  constructor();
  /** Web Serial API のサポートチェックとUI初期化 */
  init(): void;
}
```

**初期化手順:**

1. Web Serial API サポートチェック（非対応時はエラー画面を表示し終了）
2. サービス層インスタンスの生成（SerialService, DataParser, DataStore）
3. UIコンポーネントの生成（各コンポーネントに対応するDOM要素を渡す）
4. ChartRenderer の生成
5. イベント結合（後述）

**イベント結合:**

```
[データ受信フロー]
SerialService.onReceive(chunk)
  → DataParser.pushChunk(chunk, Date.now())
    → 各 ParsedRecord について DataStore.addRecord(record)
      → DataStore.onNewKey → DataTable.addKey() + ChartRenderer.addSeries()
      → DataStore.onDataUpdated → DataTable.updateValues()

[接続操作フロー]
ConnectionPanel.onConnect(config) → SerialService.connect(config)
ConnectionPanel.onDisconnect()    → SerialService.disconnect()
SerialService.onStateChange(state) → ConnectionPanel.updateState(state)
                                   → SendPanel.setEnabled(state === 'connected')

[送信フロー]
SendPanel.onSend(data, displayText) → SerialService.send(data)
                                    → SendPanel.addHistory(entry)

[グラフ制御フロー]
ChartControls.onMeasurementToggle(running)
  → running ? ChartRenderer.start() : ChartRenderer.stop()
ChartControls.onConfigChange(config)
  → ChartRenderer.updateConfig(config)

[軸割り当てフロー]
DataTable.onAxisChange(key, axis) → ChartRenderer.updateSeriesConfig()
```

### 4.7 エントリポイント (`main.ts`)

```typescript
import { App } from './app';

document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
});
```

## 5. データフロー図

```
┌─────────────┐   テキストチャンク   ┌──────────────┐   ParsedRecord[]   ┌─────────────┐
│   Serial    │ ─────────────────→ │  DataParser  │ ────────────────→ │  DataStore  │
│   Service   │                    └──────────────┘                   └──────┬──────┘
└──────┬──────┘                                                             │
       ↑ send()                                            onNewKey /      │
       │                                                  onDataUpdated    │
┌──────┴──────┐                                                ↓           │
│    Send     │                                         ┌────────────┐     │
│    Panel    │                                         │ DataTable  │     │
└─────────────┘                                         └────────────┘     │
                                                                           │
┌─────────────┐   config変更                                               │
│    Chart    │ ──────────────→ ┌───────────────┐  getChartData()          │
│   Controls  │                 │    Chart      │ ◀────────────────────────┘
└─────────────┘                 │   Renderer    │
                                │ (animation    │
                                │  loop @FPS)   │
                                └───────────────┘
```

**ポイント:**
- ChartRenderer は自身のアニメーションループ内で DataStore からデータを pull する
- DataTable は DataStore のコールバックで push 通知を受けて更新する
- シリアル接続の有無とグラフ描画の開始/停止は独立して制御される
  - シリアルポートが接続中であればデータ受信は常時行われる
  - グラフ描画の開始/停止はアニメーションループの動作のみを制御する
  - 測定停止中に受信したデータも DataStore に蓄積され、測定再開時に表示範囲内であればグラフに反映される

## 6. UI設計

### 6.1 カラースキーム（ダークテーマ）

```css
/* 背景色 */
--color-bg-primary:   #0d1117;   /* 最背面 */
--color-bg-secondary: #161b22;   /* パネル背景 */
--color-bg-input:     #0d1117;   /* 入力欄背景 */
--color-bg-hover:     #1c2333;   /* ホバー時 */

/* ボーダー・区切り線 */
--color-border:       #30363d;

/* テキスト */
--color-text-primary:   #e6edf3; /* 主テキスト */
--color-text-secondary: #8b949e; /* 副テキスト */

/* 機能色 */
--color-accent:  #58a6ff;        /* アクセント */
--color-success: #3fb950;        /* 成功・接続中 */
--color-warning: #d29922;        /* 警告 */
--color-danger:  #f85149;        /* エラー・切断 */
```

### 6.2 データ系列カラーパレット

新しいキーの検出順に以下の色を巡回的に割り当てる（8色サイクル）:

| 順番 | カラーコード | 用途イメージ |
|------|-------------|-------------|
| 1 | `#58a6ff` | 青 |
| 2 | `#3fb950` | 緑 |
| 3 | `#f85149` | 赤 |
| 4 | `#d29922` | 黄 |
| 5 | `#bc8cff` | 紫 |
| 6 | `#39d2c0` | シアン |
| 7 | `#f778ba` | ピンク |
| 8 | `#79c0ff` | 水色 |

### 6.3 レイアウト構成

CSS Grid を使用した構成。グラフ表示領域を最も広く確保する。

```
+----------------------------------------------------------------------+
|  ヘッダー: アプリ名                               [接続状態]          |
+----------------------------------------------------------------------+
|  接続設定パネル                                                       |
|  ボーレート[115200▼] データビット[8▼] ストップビット[1▼]              |
|  パリティ[none▼] フロー制御[none▼]          [接続] [切断]             |
+----------------------------------------------------------------------+
|                                                                       |
|  グラフ表示領域（幅いっぱい）                                          |
|  Y1軸 |          uPlot Canvas          | Y2軸                        |
|       |                                |                              |
|       |          時間軸 →               |                              |
+----------------------------------------------------------------------+
|  グラフ操作パネル                                                     |
|  [● 測定開始]  FPS: ====●====== [30]  時間幅: ====●==== [10秒]       |
|  Y1軸: ○自動 ○手動 min[    ] max[    ]                               |
|  Y2軸: ○自動 ○手動 min[    ] max[    ]                               |
+----------------------------------------------------------------------+
|  データ一覧テーブル               |  送受信パネル                       |
|  ┌────┬──────┬───────┬──────┐    |  入力形式[Text▼] 改行[LF▼]        |
|  │ ■  │ Key  │ Value │ Axis │    |  [                    ] [送信]     |
|  ├────┼──────┼───────┼──────┤    |  ─── 送信履歴 ───                 |
|  │ 🔵 │ temp │ 25.6  │ Y1 ▼│    |  12:00:01 > hello                 |
|  │ 🟢 │ humi │ 43.0  │ Y2 ▼│    |  12:00:05 > test data             |
|  └────┴──────┴───────┴──────┘    |                                   |
+----------------------------------------------------------------------+
```

**レイアウトの CSS Grid 定義:**

```css
.app-layout {
  display: grid;
  grid-template-rows: auto auto 1fr auto auto;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 16px;
  height: 100vh;
}

/* ヘッダー・接続設定・グラフ・グラフ操作は全幅 */
.header, .connection-panel, .chart-area, .chart-controls {
  grid-column: 1 / -1;
}

/* データテーブルと送受信パネルは2カラム */
.data-table  { grid-column: 1; }
.send-panel  { grid-column: 2; }
```

### 6.4 コンポーネント外観仕様

| 要素 | スタイル |
|------|---------|
| パネル | 背景: `--color-bg-secondary`、ボーダー: `--color-border` 1px solid、角丸: 8px、パディング: 16px |
| ボタン | 背景: `--color-accent`、テキスト: 白、角丸: 4px、ホバー時: 明度+10%、active時: scale(0.98) |
| 危険ボタン | 背景: `--color-danger`（切断ボタン等） |
| スライダー | トラック: `--color-border`、サム: `--color-accent`、高さ: 4px |
| 入力欄 | 背景: `--color-bg-input`、ボーダー: `--color-border`、フォーカス時: `--color-accent` ボーダー、角丸: 4px |
| テーブル | ヘッダー: `--color-bg-primary` 背景、行: 偶数行に `--color-bg-hover` のストライプ |
| フォント | `system-ui, -apple-system, 'Segoe UI', sans-serif`、基本サイズ: 14px |

## 7. エラーハンドリング

| エラー種別 | 検出箇所 | 処理 |
|-----------|---------|------|
| Web Serial API 非対応 | `App.init()` で `navigator.serial` の存在チェック | 操作UIを非表示にし、非対応メッセージを全画面表示 |
| ポート選択キャンセル | `SerialService.connect()` 内で `DOMException (NotAllowedError)` をキャッチ | 何もしない（ユーザーの意図的キャンセル） |
| 接続失敗 | `SerialService.connect()` 内で `port.open()` の例外をキャッチ | 状態を `disconnected` に戻し、エラーメッセージをトースト通知 |
| 予期しない切断 | 読み取りループの例外 / `disconnect` イベント | 状態を `disconnected` に更新、トースト通知 |
| データパースエラー | `DataParser.pushChunk()` 内 | 該当行をスキップ（コンソールに警告ログ出力、UIには通知しない） |
| 送信失敗 | `SerialService.send()` 内で例外をキャッチ | エラーメッセージをトースト通知 |
| バイナリ入力不正 | `SendPanel` のバリデーション | 送信ボタンを無効化し、入力欄にインラインエラー表示 |

**トースト通知の仕様:**
- 画面右上に表示
- 3秒後に自動で非表示
- エラー種別に応じた背景色（ `--color-danger` / `--color-warning` ）

## 8. パフォーマンス設計

### 8.1 グラフ描画最適化

| 方針 | 詳細 |
|------|------|
| Canvas描画 | uPlot はCanvasベースのため、DOM操作による描画コストが発生しない |
| FPS制御 | `requestAnimationFrame` + 経過時間判定により、設定FPS以上の描画を抑制 |
| データ範囲限定 | uPlot に渡すデータは全蓄積データを渡し、表示範囲はスケール設定で制御（配列コピーを回避） |

### 8.2 データ管理最適化

| 方針 | 詳細 |
|------|------|
| 列指向構造 | uPlot のデータフォーマット（`AlignedData`）に合わせた配列構造で保持し、変換コストを削減 |
| 遅延プルーニング | データ追加100回ごとに保持期間（120秒）外のデータを先頭から一括削除 |
| タイムスタンプ変換 | `getChartData()` 呼び出し時にミリ秒→秒変換を行う（`map` で新配列生成） |

### 8.3 UI更新最適化

| 方針 | 詳細 |
|------|------|
| DataTable差分更新 | `textContent` の差分比較を行い、変更があったセルのみ更新 |
| 送信履歴件数制限 | 最新50件のみDOMに保持し、超過分は末尾から削除 |
| イベントバッチ化 | 高頻度の受信データに対し、DataTable の更新は `requestAnimationFrame` でバッチ化 |
