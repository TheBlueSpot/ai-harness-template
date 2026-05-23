type CanvasContextType = "2d" | "webgl" | "webgl2";
type ScaleMode = "letterbox" | "fit" | "stretch";
type ParentTarget = HTMLElement | string;

type InitOptions = {
  width?: number;
  height?: number;
  context?: CanvasContextType;
  parent?: ParentTarget;
  canvas?: HTMLCanvasElement;
  scaleMode?: ScaleMode;
  background?: string;
  autoStart?: boolean;
  maxDelta?: number;
  silenceContextMenu?: boolean;
  globals?: boolean;
  update?: (deltaTime: number, elapsedTime: number) => void;
  render?: (deltaTime: number, elapsedTime: number) => void;
};

function resolveParent(parent?: ParentTarget) {
  if (!parent) return document.body;
  if (typeof parent === "string") {
    const target = document.querySelector(parent);
    if (!target) throw new Error(`Canvas parent not found: ${parent}`);
    return target as HTMLElement;
  }
  return parent;
}

function viewportOf(parent: HTMLElement) {
  if (parent === document.body || parent === document.documentElement) {
    return { width: window.innerWidth, height: window.innerHeight };
  }

  const rect = parent.getBoundingClientRect();
  return {
    width: Math.max(1, rect.width),
    height: Math.max(1, rect.height)
  };
}

function acquireContext(canvas: HTMLCanvasElement, type: CanvasContextType) {
  const context = canvas.getContext(type);
  if (!context) throw new Error(`Unable to acquire ${type} canvas context`);
  return context;
}

function setGlobalTimes(deltaTime: number, elapsedTime: number) {
  const target = globalThis as typeof globalThis & {
    deltaTime?: number;
    elapsedTime?: number;
  };
  target.deltaTime = deltaTime;
  target.elapsedTime = elapsedTime;
}

export function init(options: InitOptions = {}) {
  const logicalWidth = options.width ?? 960;
  const logicalHeight = options.height ?? 540;
  const contextType = options.context ?? "2d";
  const scaleMode = options.scaleMode ?? "letterbox";
  const autoStart = options.autoStart ?? true;
  const maxDelta = options.maxDelta ?? 0.05;
  const exposeGlobals = options.globals ?? true;
  const parent = resolveParent(options.parent);
  const canvas = options.canvas ?? document.createElement("canvas");
  const context = acquireContext(canvas, contextType);

  let dpr = 1;
  let deltaTime = 0;
  let elapsedTime = 0;
  let lastTime = 0;
  let frameId = 0;
  let running = false;

  if (!canvas.parentElement) parent.appendChild(canvas);
  if (options.background) canvas.style.background = options.background;
  canvas.style.display = "block";
  canvas.style.touchAction = "none";

  function resize() {
    dpr = Math.max(1, window.devicePixelRatio || 1);
    const viewport = viewportOf(parent);
    canvas.width = Math.max(1, Math.round(logicalWidth * dpr));
    canvas.height = Math.max(1, Math.round(logicalHeight * dpr));

    if (scaleMode === "stretch" || scaleMode === "fit") {
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
    } else {
      const scale = Math.min(viewport.width / logicalWidth, viewport.height / logicalHeight);
      canvas.style.width = `${Math.max(1, Math.floor(logicalWidth * scale))}px`;
      canvas.style.height = `${Math.max(1, Math.floor(logicalHeight * scale))}px`;
      canvas.style.margin = "auto";
    }

    if (contextType === "2d") {
      const ctx = context as CanvasRenderingContext2D;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  function frame(time: number) {
    if (!running) return;
    const rawDelta = lastTime ? (time - lastTime) / 1000 : 0;
    lastTime = time;
    deltaTime = Math.min(maxDelta, Math.max(0, rawDelta));
    elapsedTime += deltaTime;
    if (exposeGlobals) setGlobalTimes(deltaTime, elapsedTime);
    options.update?.(deltaTime, elapsedTime);
    options.render?.(deltaTime, elapsedTime);
    frameId = requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    lastTime = 0;
    frameId = requestAnimationFrame(frame);
  }

  function stop() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(frameId);
    frameId = 0;
  }

  function destroy() {
    stop();
    window.removeEventListener("resize", resize);
    canvas.removeEventListener("contextmenu", preventContextMenu);
  }

  function preventContextMenu(event: Event) {
    event.preventDefault();
  }

  if (options.silenceContextMenu ?? true) {
    canvas.addEventListener("contextmenu", preventContextMenu);
  }
  window.addEventListener("resize", resize);
  resize();
  if (exposeGlobals) setGlobalTimes(deltaTime, elapsedTime);
  if (autoStart) start();

  return {
    canvas,
    context,
    ctx: context,
    contextType,
    width: logicalWidth,
    height: logicalHeight,
    resize,
    start,
    stop,
    pause: stop,
    resume: start,
    destroy,
    isRunning() {
      return running;
    },
    get deltaTime() {
      return deltaTime;
    },
    get elapsedTime() {
      return elapsedTime;
    },
    get devicePixelRatio() {
      return dpr;
    }
  };
}
