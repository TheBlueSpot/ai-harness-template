import { describe, expect, test } from "bun:test";
import { parseClientCommand } from "../../shared/protocol";

describe("client command validation", () => {
  test("rejects malformed websocket commands", () => {
    expect(() =>
      parseClientCommand({
        type: "chat.send",
        requestId: "req-1",
        payload: {
          sessionId: "session-1",
          modelId: "bad model id",
          content: "hello"
        }
      })
    ).toThrow();
  });
});

