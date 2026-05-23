import { expect, test } from "bun:test";
import { createFixedStepLoop } from "./loop.ts";

test("fixed step loop exposes pause and resume aliases", () => {
  const queuedFrames: FrameRequestCallback[] = [];
  const canceledFrames: number[] = [];
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;

  globalThis.requestAnimationFrame = (callback) => {
    queuedFrames.push(callback);
    return queuedFrames.length;
  };
  globalThis.cancelAnimationFrame = (id) => {
    canceledFrames.push(id);
  };

  try {
    let updates = 0;
    let renders = 0;
    let clock = 1000;
    const loop = createFixedStepLoop({
      step: 0.1,
      maxFrame: 1,
      update: () => {
        updates += 1;
      },
      render: () => {
        renders += 1;
      },
      now: () => clock
    });

    expect(loop.isRunning()).toBe(false);
    loop.resume();
    expect(loop.isRunning()).toBe(true);
    expect(queuedFrames).toHaveLength(1);

    queuedFrames[0](1100);
    expect(updates).toBe(1);
    expect(renders).toBe(1);

    loop.pause();
    expect(loop.isRunning()).toBe(false);
    expect(canceledFrames).toEqual([2]);
  } finally {
    globalThis.requestAnimationFrame = originalRequest;
    globalThis.cancelAnimationFrame = originalCancel;
  }
});

test("fixed step loop clears stale accumulator when restarted", () => {
  const queuedFrames: FrameRequestCallback[] = [];
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;

  globalThis.requestAnimationFrame = (callback) => {
    queuedFrames.push(callback);
    return queuedFrames.length;
  };
  globalThis.cancelAnimationFrame = () => {};

  try {
    let updates = 0;
    let alpha = 0;
    let clock = 0;
    const loop = createFixedStepLoop({
      step: 1,
      maxFrame: 10,
      update: () => {
        updates += 1;
      },
      render: (value) => {
        alpha = value;
      },
      now: () => clock
    });

    loop.start();
    queuedFrames[0](500);
    expect(updates).toBe(0);
    expect(alpha).toBe(0.5);

    loop.stop();
    clock = 500;
    loop.start();
    queuedFrames[2](1000);

    expect(updates).toBe(0);
    expect(alpha).toBe(0.5);
  } finally {
    globalThis.requestAnimationFrame = originalRequest;
    globalThis.cancelAnimationFrame = originalCancel;
  }
});
