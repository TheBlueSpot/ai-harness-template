import { afterEach, describe, expect, test } from "bun:test";
import { startHarnessServer } from "./server";

describe("harness server", () => {
  const server = startHarnessServer({ port: 8790 });

  afterEach(() => {
    // Keep the test server short-lived so the suite can run cleanly.
    server.stop();
  });

  test("accepts websocket commands and rejects malformed payloads", async () => {
    const socket = new WebSocket("ws://localhost:8790");

    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => {
        socket.send("not-json");
      });

      socket.addEventListener("message", (event) => {
        const payload = JSON.parse(event.data as string);

        if (payload.type === "command.rejected") {
          expect(payload.payload.message).toBe("Invalid websocket command");
          socket.close();
          resolve();
        }
      });

      socket.addEventListener("error", () => reject(new Error("websocket failed")));
    });
  });
});

