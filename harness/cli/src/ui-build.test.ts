import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { buildUiBundle, createUiAssetManager } from "./ui-build";

class FakeClock {
  private nextTimerId = 1;
  private readonly timers = new Map<number, { runAt: number; callback: () => void }>();
  nowMs = 0;

  setTimeout = ((callback: TimerHandler, delay?: number) => {
    const timerId = this.nextTimerId++;
    this.timers.set(timerId, {
      runAt: this.nowMs + Number(delay ?? 0),
      callback: () => {
        if (typeof callback !== "function") {
          throw new Error("String timer callbacks are not supported in tests");
        }

        callback();
      }
    });
    return timerId as unknown as ReturnType<typeof setTimeout>;
  }) as unknown as typeof globalThis.setTimeout;

  clearTimeout = ((timerId: ReturnType<typeof setTimeout>) => {
    this.timers.delete(Number(timerId));
  }) as unknown as typeof globalThis.clearTimeout;

  advanceBy(durationMs: number) {
    const targetMs = this.nowMs + durationMs;
    while (true) {
      const nextTimer = [...this.timers.entries()].sort((left, right) => left[1].runAt - right[1].runAt)[0];
      if (!nextTimer || nextTimer[1].runAt > targetMs) {
        break;
      }

      this.nowMs = nextTimer[1].runAt;
      this.timers.delete(nextTimer[0]);
      nextTimer[1].callback();
    }

    this.nowMs = targetMs;
  }
}

const flushMicrotasks = () => Promise.resolve().then(() => Promise.resolve());

setDefaultTimeout(15000);

describe("ui build", () => {
  test("emits external source maps in development build", async () => {
    await buildUiBundle();

    const uiOutDir = path.resolve(process.cwd(), "dist/ui");
    const jsPath = path.join(uiOutDir, "main.js");
    const mapPath = path.join(uiOutDir, "main.js.map");
    const sourceMap = JSON.parse(readFileSync(mapPath, "utf8")) as { sources?: string[] };

    expect(existsSync(jsPath)).toBe(true);
    expect(existsSync(mapPath)).toBe(true);
    expect(readFileSync(jsPath, "utf8")).toContain("//# sourceMappingURL=main.js.map");
    expect(sourceMap.sources?.some((source) => source.includes("harness\\ui\\src\\app.tsx"))).toBe(true);
  });

  test("omits source maps in production build", async () => {
    await buildUiBundle({ minify: true });

    const uiOutDir = path.resolve(process.cwd(), "dist/ui");
    const jsPath = path.join(uiOutDir, "main.js");
    const mapPath = path.join(uiOutDir, "main.js.map");

    expect(existsSync(jsPath)).toBe(true);
    expect(existsSync(mapPath)).toBe(false);
    expect(readFileSync(jsPath, "utf8")).not.toContain("sourceMappingURL");
  });

  test("debounces watch storms and publishes live reload revision only after successful rebuild", async () => {
    const clock = new FakeClock();
    const buildCalls: string[] = [];
    let watcherListener: ((changedPath?: string) => void) | undefined;
    let failNextBuild = false;
    const originalConsoleError = console.error;
    console.error = () => {};

    try {
      const manager = createUiAssetManager({
        debounceMs: 30_000,
        timerApi: {
          setTimeout: clock.setTimeout,
          clearTimeout: clock.clearTimeout
        },
        async buildUiBundle() {
          if (failNextBuild) {
            failNextBuild = false;
            throw new Error("broken intermediate edit");
          }

          buildCalls.push(`build-${buildCalls.length + 1}`);
        },
        watchSourceDir(_sourceDir, listener) {
          watcherListener = listener;
          return {
            close() {}
          };
        }
      });

      manager.startWatching();
      watcherListener?.();
      watcherListener?.();
      watcherListener?.();

      expect(buildCalls).toEqual([]);
      expect(manager.getLiveReloadState()).toEqual({
        revision: 0,
        building: false,
        pending: true
      });

      clock.advanceBy(29_999);
      await flushMicrotasks();
      expect(buildCalls).toEqual([]);

      clock.advanceBy(1);
      await flushMicrotasks();
      expect(buildCalls).toEqual(["build-1"]);
      expect(manager.getLiveReloadState()).toEqual({
        revision: 1,
        building: false,
        pending: false
      });

      failNextBuild = true;
      watcherListener?.();
      clock.advanceBy(30_000);
      await flushMicrotasks();
      expect(buildCalls).toEqual(["build-1"]);
      expect(manager.getLiveReloadState()).toEqual({
        revision: 1,
        building: false,
        pending: false
      });
      manager.dispose();
    } finally {
      console.error = originalConsoleError;
    }
  });

  test("ignores context and agent metadata watch events", async () => {
    const buildCalls: string[] = [];
    let watcherListener: ((changedPath?: string) => void) | undefined;
    const manager = createUiAssetManager({
      async buildUiBundle() {
        buildCalls.push(`build-${buildCalls.length + 1}`);
      },
      watchSourceDir(_sourceDir, listener) {
        watcherListener = listener;
        return {
          close() {}
        };
      }
    });

    manager.startWatching();
    watcherListener?.(path.resolve(process.cwd(), "context/notes.md"));
    watcherListener?.(path.resolve(process.cwd(), ".agent/runtime.json"));
    watcherListener?.(path.resolve(process.cwd(), ".agents/skills/caveman/SKILL.md"));
    watcherListener?.(path.resolve(process.cwd(), "AGENTS.md"));
    watcherListener?.(path.resolve(process.cwd(), "nested/agents.md"));
    await flushMicrotasks();
    expect(buildCalls).toEqual([]);

    watcherListener?.(path.resolve(process.cwd(), "harness/ui/src/app.tsx"));
    await flushMicrotasks();
    expect(buildCalls).toEqual(["build-1"]);
    manager.dispose();
  });
});
