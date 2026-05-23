type Point = { x: number; y: number };

type PointerInputOptions = {
  toWorld?: (point: Point) => Point;
};

type PointerSnapshot = Point & {
  id: number;
  type: string;
  down: boolean;
  pressed: boolean;
  released: boolean;
  moved: boolean;
  worldX: number;
  worldY: number;
  source: Event;
};

function canvasPoint(canvas: HTMLCanvasElement, event: MouseEvent | Touch) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / (rect.width || canvas.width || 1);
  const scaleY = canvas.height / (rect.height || canvas.height || 1);
  return {
    x: ((event.clientX ?? 0) - rect.left) * scaleX,
    y: ((event.clientY ?? 0) - rect.top) * scaleY
  };
}

function eventTouches(event: TouchEvent) {
  return event.changedTouches ? Array.from(event.changedTouches) : [];
}

export function createPointerInput(canvas: HTMLCanvasElement, options: PointerInputOptions = {}) {
  const listeners = new Map<string, Set<(event: PointerSnapshot) => void>>();
  const pointers = new Map<number, PointerSnapshot>();
  let primary: PointerSnapshot | null = null;

  function emit(type: string, pointer: PointerSnapshot) {
    const handlers = listeners.get(type);
    if (!handlers) return;
    for (const handler of handlers) handler(pointer);
  }

  function snapshot(source: Event, id: number, pointerType: string, point: Point, changes = {}) {
    const world = options.toWorld ? options.toWorld(point) : point;
    const next = {
      id,
      type: pointerType,
      x: point.x,
      y: point.y,
      worldX: world.x,
      worldY: world.y,
      down: false,
      pressed: false,
      released: false,
      moved: false,
      source,
      ...changes
    } as PointerSnapshot;
    pointers.set(id, next);
    primary = next;
    return next;
  }

  function mouse(event: MouseEvent, type: string, changes = {}) {
    const pointer = snapshot(event, 1, "mouse", canvasPoint(canvas, event), changes);
    emit(type, pointer);
    event.preventDefault();
  }

  function touch(event: TouchEvent, type: string, changes = {}) {
    for (const changed of eventTouches(event)) {
      const pointer = snapshot(event, changed.identifier, "touch", canvasPoint(canvas, changed), changes);
      emit(type, pointer);
    }
    event.preventDefault();
  }

  function onMouseDown(event: MouseEvent) {
    mouse(event, "down", { down: true, pressed: true });
  }
  function onMouseMove(event: MouseEvent) {
    mouse(event, "move", { down: (event.buttons ?? 0) > 0, moved: true });
  }
  function onMouseUp(event: MouseEvent) {
    mouse(event, "up", { released: true });
  }
  function onMouseLeave(event: MouseEvent) {
    mouse(event, "leave", { released: primary?.down === true });
  }
  function onTouchStart(event: TouchEvent) {
    touch(event, "down", { down: true, pressed: true });
  }
  function onTouchMove(event: TouchEvent) {
    touch(event, "move", { down: true, moved: true });
  }
  function onTouchEnd(event: TouchEvent) {
    touch(event, "up", { released: true });
  }
  function onTouchCancel(event: TouchEvent) {
    touch(event, "cancel", { released: true });
  }

  canvas.addEventListener("mousedown", onMouseDown);
  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("mouseup", onMouseUp);
  canvas.addEventListener("mouseleave", onMouseLeave);
  canvas.addEventListener("touchstart", onTouchStart, { passive: false });
  canvas.addEventListener("touchmove", onTouchMove, { passive: false });
  canvas.addEventListener("touchend", onTouchEnd, { passive: false });
  canvas.addEventListener("touchcancel", onTouchCancel, { passive: false });

  return {
    on(type: string, handler: (event: PointerSnapshot) => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)?.add(handler);
      return () => listeners.get(type)?.delete(handler);
    },
    pointer(id = primary?.id ?? 1) {
      return pointers.get(id) ?? null;
    },
    primary() {
      return primary;
    },
    update() {
      for (const pointer of pointers.values()) {
        pointer.pressed = false;
        pointer.released = false;
        pointer.moved = false;
      }
    },
    dispose() {
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("mouseleave", onMouseLeave);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      canvas.removeEventListener("touchcancel", onTouchCancel);
    }
  };
}
