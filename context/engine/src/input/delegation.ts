import { createPointerInput } from "./pointer.ts";

type CanvasObject = {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  width?: number;
  height?: number;
  r?: number;
  radius?: number;
  layer?: number;
  visible?: boolean;
  active?: boolean;
  containsPoint?: (x: number, y: number) => boolean;
};

type DelegationOptions<T extends CanvasObject> = {
  hitTest?: (object: T, x: number, y: number) => boolean;
  toWorld?: (point: { x: number; y: number }) => { x: number; y: number };
};

function defaultHitTest(object: CanvasObject, x: number, y: number) {
  if (object.active === false || object.visible === false) return false;
  if (object.containsPoint) return object.containsPoint(x, y);

  const radius = object.r ?? object.radius;
  if (radius !== undefined) {
    const dx = x - (object.x ?? 0);
    const dy = y - (object.y ?? 0);
    return dx * dx + dy * dy <= radius * radius;
  }

  const width = object.w ?? object.width ?? 0;
  const height = object.h ?? object.height ?? 0;
  return x >= (object.x ?? 0) && x <= (object.x ?? 0) + width && y >= (object.y ?? 0) && y <= (object.y ?? 0) + height;
}

export function createCanvasObjectEvents<T extends CanvasObject>(
  canvas: HTMLCanvasElement,
  objects: T[] | (() => T[]),
  options: DelegationOptions<T> = {}
) {
  const pointer = createPointerInput(canvas, { toWorld: options.toWorld });
  const listeners = new Map<T, Map<string, Set<(event: unknown) => void>>>();
  let hoverTarget: T | null = null;

  function list() {
    return typeof objects === "function" ? objects() : objects;
  }

  function hit(x: number, y: number) {
    const candidates = list();
    let top: T | null = null;
    let topLayer = -Infinity;
    let topIndex = -1;
    for (let i = 0; i < candidates.length; i += 1) {
      const object = candidates[i];
      const isHit = options.hitTest ? options.hitTest(object, x, y) : defaultHitTest(object, x, y);
      const layer = object.layer ?? 0;
      if (isHit && (layer > topLayer || (layer === topLayer && i > topIndex))) {
        top = object;
        topLayer = layer;
        topIndex = i;
      }
    }
    return top;
  }

  function emit(object: T | null, type: string, event: unknown) {
    if (!object) return;
    const handlers = listeners.get(object)?.get(type);
    if (!handlers) return;
    for (const handler of handlers) handler(event);
  }

  pointer.on("down", (event) => emit(hit(event.worldX, event.worldY), "down", event));
  pointer.on("up", (event) => emit(hit(event.worldX, event.worldY), "click", event));
  pointer.on("move", (event) => {
    const next = hit(event.worldX, event.worldY);
    if (next !== hoverTarget) {
      emit(hoverTarget, "leave", event);
      emit(next, "enter", event);
      hoverTarget = next;
    }
    emit(next, "hover", event);
  });
  pointer.on("leave", (event) => {
    emit(hoverTarget, "leave", event);
    hoverTarget = null;
  });

  return {
    on(object: T, type: string, handler: (event: unknown) => void) {
      if (!listeners.has(object)) listeners.set(object, new Map());
      const objectListeners = listeners.get(object);
      if (!objectListeners?.has(type)) objectListeners?.set(type, new Set());
      objectListeners?.get(type)?.add(handler);
      return () => objectListeners?.get(type)?.delete(handler);
    },
    hit,
    pointer,
    dispose() {
      pointer.dispose();
      listeners.clear();
      hoverTarget = null;
    }
  };
}
