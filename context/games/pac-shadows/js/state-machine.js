/**
 * @typedef {Object} SceneRuntime
 * @property {(nextId: string, payload?: Record<string, unknown>) => void} go
 * @property {() => string} getCurrentId
 * @property {() => Record<string, unknown>} getSharedState
 * @property {(patch: Record<string, unknown>) => void} patchSharedState
 */

/**
 * @typedef {Object} SceneModule
 * @property {(runtime: SceneRuntime, payload?: Record<string, unknown>) => void} [enter]
 * @property {(runtime: SceneRuntime) => void} [exit]
 * @property {(dt: number, runtime: SceneRuntime) => void} [update]
 * @property {(ctx: CanvasRenderingContext2D, runtime: SceneRuntime) => void} [render]
 * @property {(event: KeyboardEvent, runtime: SceneRuntime) => void} [onKeyDown]
 * @property {(event: KeyboardEvent, runtime: SceneRuntime) => void} [onKeyUp]
 */

export class SceneMachine {
  constructor(registry, initialId, sharedState = {}) {
    this.registry = registry;
    this.currentId = initialId;
    this.sharedState = { ...sharedState };
    this.scene = null;
    this.pendingId = null;
    this.pendingPayload = null;
    this.runtime = {
      go: (nextId, payload = {}) => {
        this.pendingId = nextId;
        this.pendingPayload = payload;
      },
      getCurrentId: () => this.currentId,
      getSharedState: () => this.sharedState,
      patchSharedState: (patch) => {
        this.sharedState = { ...this.sharedState, ...patch };
      }
    };
  }

  start() {
    this.swapTo(this.currentId, {});
  }

  swapTo(nextId, payload) {
    if (this.scene?.exit) {
      this.scene.exit(this.runtime);
    }
    const nextScene = this.registry[nextId];
    if (!nextScene) {
      throw new Error(`Unknown scene: ${nextId}`);
    }
    this.currentId = nextId;
    this.scene = nextScene;
    if (this.scene.enter) {
      this.scene.enter(this.runtime, payload);
    }
  }

  update(dt) {
    if (this.pendingId) {
      const nextId = this.pendingId;
      const payload = this.pendingPayload ?? {};
      this.pendingId = null;
      this.pendingPayload = null;
      this.swapTo(nextId, payload);
    }
    this.scene?.update?.(dt, this.runtime);
  }

  render(ctx) {
    this.scene?.render?.(ctx, this.runtime);
  }

  onKeyDown(event) {
    this.scene?.onKeyDown?.(event, this.runtime);
  }

  onKeyUp(event) {
    this.scene?.onKeyUp?.(event, this.runtime);
  }

  getCurrentId() {
    return this.currentId;
  }
}

export const createSceneMachine = (registry, initialId, sharedState = {}) =>
  new SceneMachine(registry, initialId, sharedState);
