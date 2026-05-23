import { expect, test } from "bun:test";
import { createCamera } from "./camera.ts";

test("camera pans and clamps to world bounds", () => {
  const camera = createCamera({
    viewportWidth: 100,
    viewportHeight: 50,
    bounds: { x: 0, y: 0, w: 300, h: 200 }
  });

  camera.pan(250, 180);

  expect(camera.visibleRect()).toEqual({ x: 200, y: 150, w: 100, h: 50 });
});

test("camera zooms around a screen anchor", () => {
  const camera = createCamera({ x: 50, y: 25, viewportWidth: 100, viewportHeight: 100 });

  camera.zoomTo(2, { x: 25, y: 25 });

  expect(camera.state().zoom).toBe(2);
  expect(camera.screenToWorld({ x: 25, y: 25 })).toEqual({ x: 75, y: 50 });
});

test("camera follows target outside the deadzone", () => {
  const target = { x: 140, y: 20, w: 20, h: 20 };
  const camera = createCamera({
    viewportWidth: 100,
    viewportHeight: 100,
    follow: target,
    deadzoneX: 20,
    deadzoneY: 20
  });

  camera.update();

  expect(camera.visibleRect()).toEqual({ x: 70, y: 0, w: 100, h: 100 });
});

test("camera smooths follow movement", () => {
  const target = { x: 200, y: 0 };
  const camera = createCamera({
    viewportWidth: 100,
    viewportHeight: 100,
    follow: target,
    smoothing: 0.5
  });

  camera.update();

  expect(camera.visibleRect().x).toBe(50);
});

test("camera converts between world and screen space", () => {
  const camera = createCamera({ x: 10, y: 20, zoom: 2, viewportWidth: 200, viewportHeight: 100 });

  expect(camera.worldToScreen({ x: 15, y: 35 })).toEqual({ x: 10, y: 30 });
  expect(camera.screenToWorld({ x: 10, y: 30 })).toEqual({ x: 15, y: 35 });
});
