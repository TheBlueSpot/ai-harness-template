import { expect, test } from "bun:test";
import { createTextureAtlas } from "../atlas.ts";
import { createAtlasAnimation } from "./animation.ts";

const atlas = createTextureAtlas({
  frames: {
    "run-0.png": {
      frame: { x: 0, y: 0, w: 8, h: 8 },
      spriteSourceSize: { x: 0, y: 0, w: 8, h: 8 },
      sourceSize: { w: 8, h: 8 }
    },
    "run-1.png": {
      frame: { x: 8, y: 0, w: 8, h: 8 },
      spriteSourceSize: { x: 0, y: 0, w: 8, h: 8 },
      sourceSize: { w: 8, h: 8 }
    }
  }
});

test("atlas animation resolves frames by exact atlas name", () => {
  const animation = createAtlasAnimation(
    atlas,
    [
      { name: "run-0.png", duration: 50 },
      { name: "run-1.png", duration: 50 }
    ],
    { frameDuration: 100 }
  );

  expect(animation.currentFrameName()).toBe("run-0.png");
  expect(animation.currentFrame().frame).toEqual({ x: 0, y: 0, w: 8, h: 8 });
  expect(animation.advance(51).name).toBe("run-1.png");
  expect(animation.reset().name).toBe("run-0.png");
});
