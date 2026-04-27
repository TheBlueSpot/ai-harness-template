import { describe, expect, test } from "bun:test";
import { BoundedOutputBuffer } from "./bounded-output-buffer";

describe("BoundedOutputBuffer", () => {
  test("retains only bounded tail after cap exceeded", () => {
    const buffer = new BoundedOutputBuffer(6);
    buffer.append("hello");
    const snapshot = buffer.append(" world");

    expect(snapshot.exceeded).toBe(true);
    expect(snapshot.bytesSeen).toBe(11);
    expect(snapshot.bytesDropped).toBe(5);
    expect(snapshot.text).toBe(" world");
  });
});
