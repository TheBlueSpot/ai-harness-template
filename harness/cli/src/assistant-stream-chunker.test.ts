import { describe, expect, test } from "bun:test";
import { AssistantStreamChunker } from "./assistant-stream-chunker";

describe("AssistantStreamChunker", () => {
  test("splits around target interval at sentence boundary", () => {
    const chunker = new AssistantStreamChunker({ targetIntervalMs: 5000, maxWaitMs: 10000 });
    chunker.append("First sentence.", 0);
    chunker.append(" Second sentence.", 5000);

    expect(chunker.getChunks().map((chunk) => chunk.content)).toEqual(["First sentence.", "Second sentence."]);
  });

  test("does not split mid-sentence before max wait", () => {
    const chunker = new AssistantStreamChunker({ targetIntervalMs: 5000, maxWaitMs: 10000 });
    chunker.append("This is not done", 0);
    chunker.append(" yet", 5000);

    expect(chunker.getChunks()).toHaveLength(1);
    expect(chunker.getChunks()[0]?.closed).toBe(false);
  });

  test("splits at paragraph, list, and closed code fence boundaries", () => {
    const paragraph = new AssistantStreamChunker({ targetIntervalMs: 5000, maxWaitMs: 10000 });
    paragraph.append("Para one.\n\nPara two.", 0);
    paragraph.append(" More.", 5000);
    expect(paragraph.getChunks()[0]?.content).toBe("Para one.");

    const list = new AssistantStreamChunker({ targetIntervalMs: 5000, maxWaitMs: 10000 });
    list.append("- item one\nNext.", 0);
    list.append(" More.", 5000);
    expect(list.getChunks()[0]?.content).toBe("- item one\nNext.");

    const code = new AssistantStreamChunker({ targetIntervalMs: 5000, maxWaitMs: 10000 });
    code.append("```ts\nconst x = 1;\n```\nDone.", 0);
    code.append(" More.", 5000);
    expect(code.getChunks()[0]?.content).toBe("```ts\nconst x = 1;\n```");
  });

  test("force-splits after max wait at whitespace", () => {
    const chunker = new AssistantStreamChunker({ targetIntervalMs: 5000, maxWaitMs: 10000 });
    chunker.append("long concept without punctuation", 0);
    chunker.append(" still going", 10000);

    expect(chunker.getChunks()[0]?.closed).toBe(true);
    expect(chunker.getChunks()[0]?.content).toContain("still");
  });

  test("flushes final remainder", () => {
    const chunker = new AssistantStreamChunker({ targetIntervalMs: 5000, maxWaitMs: 10000 });
    chunker.append("Final partial", 0);
    chunker.flush(1000);

    expect(chunker.getChunks()).toEqual([
      {
        index: 0,
        content: "Final partial",
        startedAt: "1970-01-01T00:00:00.000Z",
        updatedAt: "1970-01-01T00:00:00.000Z",
        closed: true
      }
    ]);
  });
});
