import { expect, test } from "bun:test";
import {
  brightness,
  checkPostProcessBudget,
  colorLut,
  colorFringe,
  createPostProcessStack,
  digitalNoise,
  getPostProcessEffectCost,
  grayscale,
  invert,
  posterize,
  postProcessApiProfileNames,
  postProcessApiProfiles,
  radialBlur,
  screenShake,
  summarizePostProcessCost,
  threshold,
  vignette
} from "./post-processing.ts";

test("post process stack keeps effect order and removal explicit", () => {
  const stack = createPostProcessStack([grayscale(), invert()]);

  expect(stack.effects().map((effect) => effect.name)).toEqual(["grayscale", "invert"]);
  expect(stack.remove("grayscale")).toBe(true);
  expect(stack.remove("missing")).toBe(false);
  expect(stack.effects().map((effect) => effect.name)).toEqual(["invert"]);
});

test("pixel effects are deterministic and composable", () => {
  let pixel = brightness(0.1).apply([100, 120, 140, 255], 0, 0, { width: 1, height: 1 });
  pixel = threshold(140).apply(pixel, 0, 0, { width: 1, height: 1 });

  expect(pixel).toEqual([255, 255, 255, 255]);
  expect(posterize(4).apply([130, 10, 250, 255], 0, 0, { width: 1, height: 1 })).toEqual([170, 0, 255, 255]);
});

test("vignette darkens edges more than center", () => {
  const effect = vignette(0.5, 0.8);
  const context = { width: 100, height: 100, centerX: 50, centerY: 50 };
  const center = effect.apply([200, 200, 200, 255], 50, 50, context);
  const edge = effect.apply([200, 200, 200, 255], 0, 0, context);

  expect(center[0]).toBe(200);
  expect(edge[0]).toBeLessThan(center[0]);
});

test("screen shake is deterministic for a frame time", () => {
  expect(screenShake(6, 1.25)).toEqual(screenShake(6, 1.25));
});

test("aliases expose catalog naming variants", () => {
  expect(colorFringe).toBeFunction();
  expect(digitalNoise().name).toBe("digital-noise");
  expect(colorLut((pixel) => pixel).name).toBe("color-lut");
});

test("post process costs make stack budget visible", () => {
  const effects = [grayscale(), invert(), radialBlur];

  expect(getPostProcessEffectCost(grayscale()).tier).toBe("pixel");
  expect(getPostProcessEffectCost(radialBlur).tier).toBe("overlay");
  expect(summarizePostProcessCost(effects)).toEqual({
    ok: true,
    pixelEffects: 2,
    distortionEffects: 0,
    fullCanvasPasses: 3,
    violations: []
  });
  expect(checkPostProcessBudget(effects, { maxPixelEffects: 1, maxFullCanvasPasses: 2 })).toEqual({
    ok: false,
    pixelEffects: 2,
    distortionEffects: 0,
    fullCanvasPasses: 3,
    violations: ["pixel effects 2 exceeds 1", "full canvas passes 3 exceeds 2"]
  });
});

test("post process profiles classify stable API separately from prototype helpers", () => {
  expect(postProcessApiProfiles.createPostProcessStack.status).toBe("stable");
  expect(postProcessApiProfiles.grayscale.tier).toBe("pixel");
  expect(postProcessApiProfiles.crtScanlines.status).toBe("stable");
  expect(postProcessApiProfiles.radialBlur.status).toBe("prototype");
  expect(postProcessApiProfiles.radialBlur.exposure).toBe("prototype-root");
  expect(postProcessApiProfiles.shockwaveDistortion.tier).toBe("distortion");
});

test("post process profiles isolate migrated proof from candidate helpers", () => {
  const migratedPrototypeHelpers = Object.entries(postProcessApiProfiles)
    .filter(([, profile]) => profile.status === "prototype" && profile.proof === "migrated-game")
    .map(([name]) => name);
  const promotionBlockedHelpers = Object.entries(postProcessApiProfiles)
    .filter(([, profile]) => profile.promotion === "blocked")
    .map(([name]) => name);

  expect(postProcessApiProfiles.flashbang.proof).toBe("migrated-game");
  expect(postProcessApiProfiles.flashbang.promotion).toBe("blocked");
  expect(postProcessApiProfiles.flashbang.exposure).toBe("prototype-root");
  expect(postProcessApiProfiles.bloom.proof).toBe("candidate");
  expect(postProcessApiProfiles.pixelate.proof).toBe("candidate");
  expect(migratedPrototypeHelpers).toEqual(["flashbang"]);
  expect(promotionBlockedHelpers).toEqual(
    Object.entries(postProcessApiProfiles)
      .filter(([, profile]) => profile.status === "prototype")
      .map(([name]) => name)
  );
});

test("post process prototype helpers remain root-exposed quarantine, not stable API", () => {
  for (const [name, profile] of Object.entries(postProcessApiProfiles)) {
    if (profile.status === "prototype") {
      expect(profile.exposure, name).toBe("prototype-root");
      expect(profile.promotion, name).toBe("blocked");
      continue;
    }

    expect(profile.exposure, name).toBe("root");
    expect(profile.promotion, name).toBe("stable");
  }
});

test("post process profile names match profiled helpers", () => {
  expect(Object.keys(postProcessApiProfiles).sort()).toEqual([...postProcessApiProfileNames].sort());
});
