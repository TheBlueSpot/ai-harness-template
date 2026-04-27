import { describe, expect, test } from "bun:test";
import { runCli } from "./cli-entry";
import { CliUsageError } from "./cli-options";

describe("runCli", () => {
  test("reports startup failure and exits non-zero when main load fails", async () => {
    const reported: Array<{ origin: string; error: unknown }> = [];
    const exitCodes: number[] = [];

    await runCli({
      registerFatalHandlers: false,
      loadMain: async () => {
        throw new Error("DOMMatrix is not defined");
      },
      reportFatalError(error, origin) {
        reported.push({ error, origin });
        return {
          origin,
          message: error instanceof Error ? error.message : String(error)
        };
      },
      exit(code) {
        exitCodes.push(code);
      }
    });

    expect(reported).toHaveLength(1);
    expect(reported[0]).toMatchObject({
      origin: "startup"
    });
    expect(reported[0]?.error).toBeInstanceOf(Error);
    expect((reported[0]?.error as Error).message).toBe("DOMMatrix is not defined");
    expect(exitCodes).toEqual([1]);
  });

  test("registers fatal process handlers by default", async () => {
    const registeredEvents: string[] = [];

    await runCli({
      addProcessListener(event) {
        registeredEvents.push(event);
      },
      loadMain: async () => ({
        async main() {}
      }),
      reportFatalError() {
        return {
          origin: "startup",
          message: "unused"
        };
      },
      exit() {
        throw new Error("exit should not run");
      }
    });

    expect(registeredEvents).toEqual(["uncaughtException", "unhandledRejection"]);
  });

  test("usage errors exit with code 2 without fatal startup report", async () => {
    const exitCodes: number[] = [];
    const reported: unknown[] = [];

    await runCli({
      registerFatalHandlers: false,
      loadMain: async () => ({
        async main() {
          throw new CliUsageError("Unknown option: --wat");
        }
      }),
      reportFatalError(error) {
        reported.push(error);
        return {
          origin: "startup",
          message: "unused"
        };
      },
      exit(code) {
        exitCodes.push(code);
      }
    });

    expect(exitCodes).toEqual([2]);
    expect(reported).toHaveLength(0);
  });
});
