type StreamPumpOptions = {
  flushIntervalMs: number;
  maxBufferedBytes: number;
  onFlush: (text: string) => void | Promise<void>;
  onOverflow?: (bytes: number) => void;
};

export class StreamPump {
  private buffered = "";
  private bufferedBytes = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly encoder = new TextEncoder();

  constructor(private readonly options: StreamPumpOptions) {
    if (options.flushIntervalMs <= 0 || options.maxBufferedBytes <= 0) {
      throw new Error("StreamPump requires positive flush interval and byte cap");
    }
  }

  push(text: string) {
    if (!text) {
      return;
    }

    const bytes = this.encoder.encode(text).byteLength;
    this.buffered += text;
    this.bufferedBytes += bytes;
    if (this.bufferedBytes >= this.options.maxBufferedBytes) {
      this.options.onOverflow?.(this.bufferedBytes);
      void this.flush();
      return;
    }

    if (!this.timer) {
      this.timer = setTimeout(() => {
        void this.flush();
      }, this.options.flushIntervalMs);
    }
  }

  async flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    const text = this.buffered;
    if (!text) {
      return;
    }

    this.buffered = "";
    this.bufferedBytes = 0;
    await this.options.onFlush(text);
  }

  close() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.buffered = "";
    this.bufferedBytes = 0;
  }
}
