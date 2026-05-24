import { clamp } from "../math/collision.ts";

export type Point = { x: number; y: number };
type Size = { w?: number; h?: number; width?: number; height?: number };
export type CameraTarget = Point & Size;
export type CameraBounds = { x: number; y: number; w: number; h: number };

export type FollowOptions = {
  deadzoneX?: number;
  deadzoneY?: number;
  smoothing?: number;
};

export type CameraOptions = {
  x?: number;
  y?: number;
  zoom?: number;
  minZoom?: number;
  maxZoom?: number;
  viewportWidth: number;
  viewportHeight: number;
  bounds?: CameraBounds | null;
  follow?: CameraTarget | null;
} & FollowOptions;

export type CameraState = {
  x: number;
  y: number;
  zoom: number;
  viewportWidth: number;
  viewportHeight: number;
  bounds: CameraBounds | null;
  follow: CameraTarget | null;
};

export type Camera = {
  pan(dx: number, dy: number): Camera;
  centerOn(point: Point, amount?: number): Camera;
  follow(target: CameraTarget | null, followOptions?: FollowOptions): Camera;
  clearFollow(): Camera;
  update(): void;
  zoomTo(value: number, anchor?: Point): Camera;
  zoomBy(factor: number, anchor?: Point): Camera;
  setViewport(width: number, height: number): Camera;
  setBounds(nextBounds: CameraBounds | null): Camera;
  worldToScreen(point: Point): Point;
  screenToWorld(point: Point): Point;
  visibleRect(): CameraBounds;
  apply(ctx: CanvasRenderingContext2D, render: () => void): void;
  state(): CameraState;
};

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function targetCenter(target: CameraTarget): Point {
  return {
    x: target.x + (target.w ?? target.width ?? 0) * 0.5,
    y: target.y + (target.h ?? target.height ?? 0) * 0.5
  };
}

export function createCamera(options: CameraOptions): Camera {
  let viewportWidth = options.viewportWidth;
  let viewportHeight = options.viewportHeight;
  let x = options.x ?? 0;
  let y = options.y ?? 0;
  let zoom = options.zoom ?? 1;
  let minZoom = options.minZoom ?? 0.25;
  let maxZoom = options.maxZoom ?? 4;
  let bounds = options.bounds ?? null;
  let followTarget = options.follow ?? null;
  let deadzoneX = options.deadzoneX ?? 0;
  let deadzoneY = options.deadzoneY ?? 0;
  let smoothing = options.smoothing ?? 1;

  function visibleWidth(): number {
    return viewportWidth / zoom;
  }

  function visibleHeight(): number {
    return viewportHeight / zoom;
  }

  function constrain(): void {
    zoom = clamp(zoom, minZoom, maxZoom);
    if (!bounds) return;

    const width = visibleWidth();
    const height = visibleHeight();
    if (width >= bounds.w) {
      x = bounds.x + (bounds.w - width) * 0.5;
    } else {
      x = clamp(x, bounds.x, bounds.x + bounds.w - width);
    }

    if (height >= bounds.h) {
      y = bounds.y + (bounds.h - height) * 0.5;
    } else {
      y = clamp(y, bounds.y, bounds.y + bounds.h - height);
    }
  }

  function moveToward(targetX: number, targetY: number, amount = smoothing): void {
    const t = clamp(amount, 0, 1);
    x = lerp(x, targetX, t);
    y = lerp(y, targetY, t);
    constrain();
  }

  function centerOn(point: Point, amount = 1): void {
    moveToward(point.x - visibleWidth() * 0.5, point.y - visibleHeight() * 0.5, amount);
  }

  function worldToScreen(point: Point): Point {
    return { x: (point.x - x) * zoom, y: (point.y - y) * zoom };
  }

  function screenToWorld(point: Point): Point {
    return { x: x + point.x / zoom, y: y + point.y / zoom };
  }

  function update(): void {
    if (!followTarget) {
      constrain();
      return;
    }

    const center = targetCenter(followTarget);
    const left = x + deadzoneX;
    const right = x + visibleWidth() - deadzoneX;
    const top = y + deadzoneY;
    const bottom = y + visibleHeight() - deadzoneY;
    let targetX = x;
    let targetY = y;

    if (center.x < left) targetX = center.x - deadzoneX;
    if (center.x > right) targetX = center.x + deadzoneX - visibleWidth();
    if (center.y < top) targetY = center.y - deadzoneY;
    if (center.y > bottom) targetY = center.y + deadzoneY - visibleHeight();

    moveToward(targetX, targetY);
  }

  constrain();

  const camera: Camera = {
    pan(dx: number, dy: number): Camera {
      x += dx;
      y += dy;
      constrain();
      return camera;
    },
    centerOn(point: Point, amount = 1): Camera {
      centerOn(point, amount);
      return camera;
    },
    follow(target: CameraTarget | null, followOptions: FollowOptions = {}): Camera {
      followTarget = target;
      deadzoneX = followOptions.deadzoneX ?? deadzoneX;
      deadzoneY = followOptions.deadzoneY ?? deadzoneY;
      smoothing = followOptions.smoothing ?? smoothing;
      return camera;
    },
    clearFollow(): Camera {
      followTarget = null;
      return camera;
    },
    update,
    zoomTo(value: number, anchor: Point = { x: viewportWidth * 0.5, y: viewportHeight * 0.5 }): Camera {
      const worldAnchor = screenToWorld(anchor);
      zoom = clamp(value, minZoom, maxZoom);
      x = worldAnchor.x - anchor.x / zoom;
      y = worldAnchor.y - anchor.y / zoom;
      constrain();
      return camera;
    },
    zoomBy(factor: number, anchor?: Point): Camera {
      return camera.zoomTo(zoom * factor, anchor);
    },
    setViewport(width: number, height: number): Camera {
      viewportWidth = width;
      viewportHeight = height;
      constrain();
      return camera;
    },
    setBounds(nextBounds: CameraBounds | null): Camera {
      bounds = nextBounds;
      constrain();
      return camera;
    },
    worldToScreen,
    screenToWorld,
    visibleRect() {
      return { x, y, w: visibleWidth(), h: visibleHeight() };
    },
    apply(ctx: CanvasRenderingContext2D, render: () => void) {
      ctx.save();
      ctx.scale(zoom, zoom);
      ctx.translate(-x, -y);
      render();
      ctx.restore();
    },
    state() {
      return { x, y, zoom, viewportWidth, viewportHeight, bounds, follow: followTarget };
    }
  };

  return camera;
}
