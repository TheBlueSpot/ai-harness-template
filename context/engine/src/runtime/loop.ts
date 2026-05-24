import { updateGamepads } from "../input/gamepad.ts";
import { updateInputFrame } from "../../input.ts";

export type FixedStepLoopOptions = {
  step?: number;
  maxFrame?: number;
  advanceGlobalInput?: boolean;
  update: (step: number) => void;
  render: (alpha: number) => void;
  now?: () => number;
};

export function createFixedStepLoop({
  step = 1 / 60,
  maxFrame = 0.05,
  advanceGlobalInput = true,
  update,
  render,
  now = () => performance.now()
}: FixedStepLoopOptions) {
  let running = false;
  let last = now();
  let accumulator = 0;
  let frameId = 0;

  function frame(time: number) {
    if (!running) return;
    const delta = Math.min(maxFrame, (time - last) / 1000);
    last = time;
    accumulator += delta;

    while (accumulator >= step) {
      updateGamepads();
      update(step);
      if (advanceGlobalInput) updateInputFrame();
      accumulator -= step;
    }

    render(accumulator / step);
    frameId = requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    last = now();
    accumulator = 0;
    frameId = requestAnimationFrame(frame);
  }

  function stop() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(frameId);
    frameId = 0;
    accumulator = 0;
  }

  return {
    start,
    resume: start,
    stop,
    pause: stop,
    isRunning() {
      return running;
    }
  };
}
