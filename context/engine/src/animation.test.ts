import { expect, test } from "bun:test";
import { createTextureAtlas, createTexturePackerAtlas } from "./atlas.ts";
import { createAnimationClip, createAnimationPlayer, createAtlasClip } from "./animation.ts";

test("animation player advances by elapsed time over atlas frame names", () => {
  const atlas = createTextureAtlas({
    frames: {
      idle_0: { frame: { x: 0, y: 0, w: 8, h: 8 } },
      idle_1: { frame: { x: 8, y: 0, w: 8, h: 8 } },
      idle_2: { frame: { x: 16, y: 0, w: 8, h: 8 } }
    }
  });
  const clip = createAnimationClip({
    id: "idle",
    frames: ["idle_0", "idle_1", "idle_2"],
    frameDurationMs: 100,
    loop: "loop"
  });
  const player = createAnimationPlayer(clip, atlas).play();

  expect(player.getCurrentFrame()).toEqual({ frame: "idle_0", durationMs: 100 });

  player.update(100);
  expect(player.getCurrentFrame()).toEqual({ frame: "idle_1", durationMs: 100 });
  const atlasFrame = player.getCurrentAtlasFrame();
  expect(atlasFrame?.name).toBe("idle_1");
  expect(atlasFrame?.x).toBe(8);
  expect(atlasFrame?.y).toBe(0);
  expect(atlasFrame?.w).toBe(8);
  expect(atlasFrame?.h).toBe(8);
  expect(atlasFrame?.sourceX).toBe(0);
  expect(atlasFrame?.sourceY).toBe(0);
  expect(atlasFrame?.sourceWidth).toBe(8);
  expect(atlasFrame?.sourceHeight).toBe(8);
  expect(atlasFrame?.pivotX).toBe(0.5);
  expect(atlasFrame?.pivotY).toBe(0.5);

  player.update(200);
  expect(player.getCurrentFrame()).toEqual({ frame: "idle_0", durationMs: 100 });
});

test("animation player finishes once clips and ping-pongs through the return path", () => {
  const clip = createAnimationClip({
    id: "blink",
    frames: [
      { frame: "a", durationMs: 50 },
      { frame: "b", durationMs: 50 },
      { frame: "c", durationMs: 50 }
    ],
    loop: "once",
    pingPong: true
  });
  const player = createAnimationPlayer(clip).play();

  player.update(50);
  expect(player.getCurrentFrame()).toEqual({ frame: "b", durationMs: 50 });
  player.update(50);
  expect(player.getCurrentFrame()).toEqual({ frame: "c", durationMs: 50 });
  player.update(50);
  expect(player.getCurrentFrame()).toEqual({ frame: "b", durationMs: 50 });
  player.update(50);
  expect(player.getCurrentFrame()).toEqual({ frame: "a", durationMs: 50 });
  player.update(50);
  expect(player.isFinished()).toBe(true);

  player.reset();
  expect(player.getCurrentFrame()).toEqual({ frame: "a", durationMs: 50 });
  expect(player.isFinished()).toBe(false);
});

test("atlas clip resolves current atlas frames and keeps exact names", () => {
  const atlas = createTexturePackerAtlas({
    frames: {
      "Idle 1": { frame: { x: 0, y: 0, w: 16, h: 16 } },
      "Idle 2": { frame: { x: 16, y: 0, w: 16, h: 16 } },
      "Idle 3": { frame: { x: 32, y: 0, w: 16, h: 16 } }
    }
  });
  const clip = createAtlasClip(atlas, ["Idle 1", "Idle 2", "Idle 3"], { framesPerSecond: 1 });

  expect(clip.currentFrameName()).toBe("Idle 1");
  expect(clip.currentFrame()).toBe(atlas.requireFrame("Idle 1"));
  expect(clip.update(1).name).toBe("Idle 2");
  expect(clip.update(1).name).toBe("Idle 3");
  expect(clip.update(1).name).toBe("Idle 1");
});

test("atlas clip stops on the last frame when loop is off and speed scales playback", () => {
  const atlas = createTexturePackerAtlas({
    frames: {
      "Idle 1": { frame: { x: 0, y: 0, w: 16, h: 16 } },
      "Idle 2": { frame: { x: 16, y: 0, w: 16, h: 16 } }
    }
  });
  const clip = createAtlasClip(atlas, ["Idle 1", "Idle 2"], { framesPerSecond: 1, loop: false, speed: 2 });

  expect(clip.update(0.5).name).toBe("Idle 2");
  expect(clip.update(0.5).name).toBe("Idle 2");
  expect(clip.done).toBe(true);
});

test("atlas clip rejects missing atlas frames at creation", () => {
  const atlas = createTextureAtlas({
    frames: {
      idle_0: { frame: { x: 0, y: 0, w: 8, h: 8 } }
    }
  });

  expect(() => createAtlasClip(atlas, ["idle_0", "idle_1"])).toThrow(
    "Texture atlas frame not found: idle_1"
  );
});
