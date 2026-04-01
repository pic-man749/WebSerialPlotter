# WebSerialPlotter

ブラウザ上で動作するシリアル通信データのリアルタイムプロッタ。  
[Web Serial API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API) を使用し、バックエンドサーバなしのスタティックサイトとして動作します。

こちらで使うことができます: [WebSerialPlotter](https://pic-man749.github.io/WebSerialPlotter/)

## 機能

- **シリアル接続** : ボーレートはもちろん、データビット、ストップビット、パリティ、フロー制御を UI から設定可能
- **リアルタイムグラフ描画**
  - 受信した時系列データをリアルタイムにストリーミング表示
  - FPS（1〜60）および時間幅（1〜60 秒）をスライダーで調整可能
  - 第1軸（左）・第2軸（右）の2軸構成。各軸は自動 / 手動で表示範囲を設定可能
  - 測定開始 / 停止ボタンでグラフ更新を制御
- **データ一覧テーブル** : 受信データのキー名・最新値を一覧表示し、各キーを第1軸 / 第2軸へ割り当て可能
- **データ送信** : テキスト / HEX 入力切替、改行コード選択（なし / CR / LF / CR+LF）、送信履歴表示

## 受信データ形式

`{key1}:{value1},{key2}:{value2},...\n` のフォーマットで受信します。

```
temperature:25.6,humidity:43
```

上記の場合、`temperature` = `25.6`、`humidity` = `43` として解析されます。

## 対応ブラウザ

| ブラウザ | バージョン |
|----------|-----------|
| Google Chrome | 89+ |
| Microsoft Edge | 89+ |
| Opera | 75+ |

**注**: HTTPS または localhost 上でのみ動作します。

## セットアップ

```bash
npm install
```

## 開発

```bash
npm run dev
```

`http://localhost:5173` で開発サーバが起動します。

## ビルド

```bash
npm run build
```

`dist/` にプロダクションビルドが出力されます。

```bash
npm run preview
```

ビルド成果物のプレビューサーバが起動します。

## ディレクトリ構成

```
src/
├── index.html                  # HTMLエントリポイント
├── main.ts                     # JSエントリポイント（API対応チェック・起動）
├── app.ts                      # アプリケーション初期化・コンポーネント結合
├── types/
│   └── index.ts                # 型定義
├── serial/
│   ├── serial-service.ts       # Web Serial API ラッパー
│   └── data-parser.ts          # 受信データパーサー
├── store/
│   └── data-store.ts           # 時系列データストア
├── chart/
│   └── chart-renderer.ts       # uPlot ラッパー・アニメーション制御
├── ui/
│   ├── connection-panel.ts     # 接続設定パネル
│   ├── send-panel.ts           # 送信パネル
│   ├── chart-controls.ts       # グラフ操作パネル
│   ├── data-table.ts           # データ一覧テーブル
│   ├── resize-handle.ts        # リサイズハンドル
│   └── toast.ts                # トースト通知
└── styles/
    ├── variables.css            # CSS変数定義（カラー・スペーシング）
    ├── base.css                 # リセット・ベーススタイル
    ├── layout.css               # 全体レイアウト
    └── components.css           # コンポーネント個別スタイル
```

## 技術スタック

| 項目 | 技術 |
|------|------|
| 言語 | TypeScript |
| ビルド | Vite |
| グラフ描画 | uPlot |
| ランタイム依存 | uPlot のみ（Vanilla TS + ES Modules） |
| スタイリング | CSS Custom Properties |
| シリアル通信 | Web Serial API |

## ライセンス

MIT
