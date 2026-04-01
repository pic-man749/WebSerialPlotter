import { ConnectionState, SerialConfig } from '../types/index.js';

/**
 * Web Serial API のラッパーサービス
 * シリアルポートの選択・接続・切断・送受信を管理する
 */
export class SerialService {
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<string> | null = null;
  private readableStreamClosed: Promise<void> | null = null;
  private _state: ConnectionState = 'disconnected';

  /** テキストチャンク受信時コールバック */
  onReceive: ((chunk: string) => void) | null = null;

  /** 接続状態変化時コールバック */
  onStateChange: ((state: ConnectionState) => void) | null = null;

  /** エラー発生時コールバック */
  onError: ((error: Error) => void) | null = null;

  /** 現在の接続状態 */
  get state(): ConnectionState {
    return this._state;
  }

  private setState(state: ConnectionState): void {
    this._state = state;
    this.onStateChange?.(state);
  }

  /**
   * ポート選択ダイアログを表示し接続する
   * ブラウザのユーザージェスチャ内で呼び出す必要がある
   */
  async connect(config: SerialConfig): Promise<void> {
    if (this._state !== 'disconnected') {
      throw new Error('既に接続中または接続処理中です');
    }

    this.setState('connecting');

    try {
      // ポート選択ダイアログを表示
      this.port = await navigator.serial.requestPort();

      // ポートを開く
      await this.port.open({
        baudRate: config.baudRate,
        dataBits: config.dataBits,
        stopBits: config.stopBits,
        parity: config.parity,
        flowControl: config.flowControl,
      });

      // 予期しない切断イベントの監視
      navigator.serial.addEventListener('disconnect', this.handleDisconnect);

      this.setState('connected');

      // 読み取りループを開始
      this.startReadLoop();
    } catch (error) {
      // ユーザーがダイアログをキャンセルした場合も含む
      this.port = null;
      this.setState('disconnected');
      throw error;
    }
  }

  /**
   * 接続中のポートを切断する
   */
  async disconnect(): Promise<void> {
    if (this._state !== 'connected') {
      return;
    }

    try {
      // 読み取りループを停止
      await this.stopReadLoop();

      // ポートを閉じる
      if (this.port) {
        await this.port.close();
      }
    } finally {
      this.cleanup();
      this.setState('disconnected');
    }
  }

  /**
   * データを送信する
   */
  async send(data: Uint8Array): Promise<void> {
    if (this._state !== 'connected' || !this.port?.writable) {
      throw new Error('シリアルポートが接続されていません');
    }

    const writer = this.port.writable.getWriter();
    try {
      await writer.write(data);
    } finally {
      writer.releaseLock();
    }
  }

  /**
   * TextDecoderStream を使用した受信データの読み取りループ
   */
  private async startReadLoop(): Promise<void> {
    if (!this.port?.readable) {
      return;
    }

    const textDecoder = new TextDecoderStream();
    this.readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable as unknown as WritableStream<Uint8Array>);
    this.reader = textDecoder.readable.getReader();

    try {
      while (true) {
        const { value, done } = await this.reader.read();
        if (done) {
          break;
        }
        if (value) {
          this.onReceive?.(value);
        }
      }
    } catch (error) {
      // 予期しない切断またはキャンセルによる例外
      if (this._state === 'connected') {
        const err = error instanceof Error ? error : new Error('読み取りエラー');
        this.onError?.(err);
        this.cleanup();
        this.setState('disconnected');
      }
    }
  }

  /**
   * 読み取りループを正常に停止する
   */
  private async stopReadLoop(): Promise<void> {
    if (this.reader) {
      try {
        await this.reader.cancel();
      } catch {
        // キャンセル失敗は無視
      }
      this.reader.releaseLock();
      this.reader = null;
    }

    if (this.readableStreamClosed) {
      try {
        await this.readableStreamClosed;
      } catch {
        // パイプ終了エラーは無視
      }
      this.readableStreamClosed = null;
    }
  }

  /**
   * 予期しない切断イベントハンドラ
   */
  private handleDisconnect = (event: Event): void => {
    const disconnectedPort = (event as Event & { target: SerialPort }).target;
    if (disconnectedPort === this.port) {
      this.onError?.(new Error('シリアルポートが予期せず切断されました'));
      this.cleanup();
      this.setState('disconnected');
    }
  };

  /**
   * 内部リソースをクリーンアップする
   */
  private cleanup(): void {
    navigator.serial.removeEventListener('disconnect', this.handleDisconnect);
    this.reader = null;
    this.readableStreamClosed = null;
    this.port = null;
  }
}
