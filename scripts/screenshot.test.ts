import { afterAll, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import path from "node:path";
import {
  parseScreenshotArgs,
  resolveViewport,
  runScreenshotCapture,
  slugifyRoute,
  type BranchfsLike,
  type CaptureDeps,
  type ScreenshotArtifact
} from "./screenshot";

const fixedNow = () => 42;

afterAll(async () => {
  const scratch = path.join(process.cwd(), ".local", "screenshots", "screenshot-42");
  await rm(scratch, { recursive: true, force: true }).catch(() => undefined);
});

describe("parseScreenshotArgs", () => {
  test("defaults to / and desktop+mobile when no flags", () => {
    const opts = parseScreenshotArgs([], fixedNow);
    expect(opts.routes).toEqual(["/"]);
    expect(opts.viewports.map((viewport) => viewport.name)).toEqual(["desktop", "mobile"]);
    expect(opts.runId).toBe("screenshot-42");
    expect(opts.outDir.endsWith(`${opts.runId}`)).toBe(true);
  });

  test("accepts repeated --route and --viewport flags", () => {
    const opts = parseScreenshotArgs(
      ["--route", "/", "--route", "/chat/foo", "--viewport", "desktop"],
      fixedNow
    );
    expect(opts.routes).toEqual(["/", "/chat/foo"]);
    expect(opts.viewports.map((viewport) => viewport.name)).toEqual(["desktop"]);
  });

  test("accepts custom WxH viewport spec", () => {
    const opts = parseScreenshotArgs(["--viewport", "1280x720"], fixedNow);
    expect(opts.viewports).toEqual([{ name: "1280x720", width: 1280, height: 720 }]);
  });

  test("captures --base-url override", () => {
    const opts = parseScreenshotArgs(["--base-url", "http://localhost:8787"], fixedNow);
    expect(opts.baseUrlOverride).toBe("http://localhost:8787");
  });

  test("throws on unknown argument", () => {
    expect(() => parseScreenshotArgs(["--bogus"], fixedNow)).toThrow(/Unknown argument/);
  });

  test("throws when --route value missing", () => {
    expect(() => parseScreenshotArgs(["--route"], fixedNow)).toThrow(/--route requires a value/);
  });

  test("throws on unknown viewport preset", () => {
    expect(() => resolveViewport("potato")).toThrow(/Unknown viewport/);
  });
});

describe("slugifyRoute", () => {
  test("root route becomes home", () => {
    expect(slugifyRoute("/")).toBe("home");
  });

  test("nested route with punctuation becomes dashed slug", () => {
    expect(slugifyRoute("/chat/foo_bar?q=1")).toBe("chat-foo-bar-q-1");
  });

  test("trailing slashes trimmed", () => {
    expect(slugifyRoute("/foo/")).toBe("foo");
  });

  test("empty fragments collapse to home", () => {
    expect(slugifyRoute("///")).toBe("home");
  });
});

type FakeManagerTrace = {
  calls: string[];
  manager: BranchfsLike;
};

function createFakeManager(calls: string[], mountPath = "/tmp/mount"): FakeManagerTrace {
  const manager: BranchfsLike = {
    prepareExperimentLease: async () => {
      calls.push("prepare");
      return { projectMountPath: mountPath };
    },
    discardExperiment: async () => {
      calls.push("discard");
    }
  };
  return { calls, manager };
}

describe("runScreenshotCapture", () => {
  test("runs prepare, startServer, capture, stop, discard in order", async () => {
    const calls: string[] = [];
    const { manager } = createFakeManager(calls);
    const opts = parseScreenshotArgs(["--route", "/", "--viewport", "desktop"], fixedNow);

    const deps: CaptureDeps = {
      createManager: () => manager,
      startDevServer: async (mountPath) => {
        calls.push(`startServer:${mountPath}`);
        return {
          baseUrl: "http://localhost:1234",
          stop: async () => {
            calls.push("stop");
          }
        };
      },
      capturePages: async (baseUrl, capOpts) => {
        calls.push(`capture:${baseUrl}:${capOpts.routes.join(",")}`);
        const artifact: ScreenshotArtifact = {
          route: "/",
          viewport: "desktop",
          width: 1440,
          height: 900,
          path: `${capOpts.outDir}/home-desktop.png`
        };
        return [artifact];
      }
    };

    const result = await runScreenshotCapture(opts, deps);

    expect(calls).toEqual([
      "prepare",
      "startServer:/tmp/mount",
      "capture:http://localhost:1234:/",
      "stop",
      "discard"
    ]);
    expect(result.runId).toBe(opts.runId);
    expect(result.screenshots).toHaveLength(1);
  });

  test("still stops server and discards lease when capture throws", async () => {
    const calls: string[] = [];
    const { manager } = createFakeManager(calls);
    const opts = parseScreenshotArgs([], fixedNow);

    const deps: CaptureDeps = {
      createManager: () => manager,
      startDevServer: async () => ({
        baseUrl: "http://x",
        stop: async () => {
          calls.push("stop");
        }
      }),
      capturePages: async () => {
        throw new Error("boom");
      }
    };

    await expect(runScreenshotCapture(opts, deps)).rejects.toThrow(/boom/);
    expect(calls).toEqual(["prepare", "stop", "discard"]);
  });

  test("skips BranchFS when --base-url provided", async () => {
    const calls: string[] = [];
    const opts = parseScreenshotArgs(["--base-url", "http://localhost:8787", "--route", "/"], fixedNow);

    const deps: CaptureDeps = {
      createManager: () => {
        throw new Error("createManager should not be called when --base-url is set");
      },
      startDevServer: async () => {
        throw new Error("startDevServer should not be called when --base-url is set");
      },
      capturePages: async (baseUrl, capOpts) => {
        calls.push(`capture:${baseUrl}`);
        return [
          {
            route: "/",
            viewport: "desktop",
            width: 1440,
            height: 900,
            path: `${capOpts.outDir}/home-desktop.png`
          }
        ];
      }
    };

    const result = await runScreenshotCapture(opts, deps);
    expect(calls).toEqual(["capture:http://localhost:8787"]);
    expect(result.runId).toBe(opts.runId);
  });
});
