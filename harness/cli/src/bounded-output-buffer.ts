export type BoundedOutputSnapshot = {
  text: string;
  bytesSeen: number;
  bytesDropped: number;
  exceeded: boolean;
};

export class BoundedOutputBuffer {
  private chunks: Uint8Array[] = [];
  private retainedBytes = 0;
  private seenBytes = 0;
  private droppedBytes = 0;
  private readonly decoder = new TextDecoder();

  constructor(private readonly maxBytes: number) {
    if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
      throw new Error("Bounded output maxBytes must be positive");
    }
  }

  append(chunk: Uint8Array | string) {
    const bytes = typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk;
    this.seenBytes += bytes.byteLength;
    this.chunks.push(bytes);
    this.retainedBytes += bytes.byteLength;
    this.trim();
    return this.snapshot();
  }

  text() {
    return this.decoder.decode(this.bytes());
  }

  bytes() {
    const output = new Uint8Array(this.retainedBytes);
    let offset = 0;
    for (const chunk of this.chunks) {
      output.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return output;
  }

  snapshot(): BoundedOutputSnapshot {
    return {
      text: this.text(),
      bytesSeen: this.seenBytes,
      bytesDropped: this.droppedBytes,
      exceeded: this.droppedBytes > 0
    };
  }

  private trim() {
    while (this.retainedBytes > this.maxBytes && this.chunks.length > 0) {
      const overflow = this.retainedBytes - this.maxBytes;
      const first = this.chunks[0];
      if (first.byteLength <= overflow) {
        this.chunks.shift();
        this.retainedBytes -= first.byteLength;
        this.droppedBytes += first.byteLength;
        continue;
      }

      this.chunks[0] = first.slice(overflow);
      this.retainedBytes -= overflow;
      this.droppedBytes += overflow;
    }
  }
}

export function formatOutputCapExceeded(label: string, snapshot: Pick<BoundedOutputSnapshot, "bytesSeen" | "bytesDropped">) {
  return `${label} output exceeded cap; retained tail after dropping ${snapshot.bytesDropped} of ${snapshot.bytesSeen} bytes.`;
}
