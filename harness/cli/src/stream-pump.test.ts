import { describe, expect, test } from "bun:test";
import { StreamPump } from "./stream-pump";

describe("StreamPump", () => {
  test("coalesces chunks until flush", async () => {
    const flushed: string[] = [];
    const pump = new StreamPump({
      flushIntervalMs: 10_000,
      maxBufferedBytes: 1024,
      onFlush: (text) => {
        flushed.push(text);
      }
    });

    pump.push("a");
    pump.push("b");
    expect(flushed).toEqual([]);

    await pump.flush();
    expect(flushed).toEqual(["ab"]);
  });

  test("flushes when byte cap is reached", async () => {
    const flushed: string[] = [];
    const pump = new StreamPump({
      flushIntervalMs: 10_000,
      maxBufferedBytes: 3,
      onFlush: (text) => {
        flushed.push(text);
      }
    });

    pump.push("abc");
    await pump.flush();
    expect(flushed).toEqual(["abc"]);
  });
});
