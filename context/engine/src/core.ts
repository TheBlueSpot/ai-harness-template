export { createObjectPool } from "./runtime/object-pool.ts";
export { createStage, type StageEntity, type StageOptions } from "./runtime/stage.ts";
export {
  clamp,
  rectsOverlap,
  testOverlapRect,
  testOverlapCircle,
  pointInRect,
  circleRectOverlap,
  vecDistance,
  vecAngle,
  vecNormalize,
  rayIntersectMap,
  rayIntersectRect,
  type CircleLike,
  type RayBox,
  type RectLike,
  type Vec2
} from "./math/collision.ts";
export {
  aabbsOverlap,
  createAabb,
  createCollisionBroadphase,
  normalizeAabb,
  type CollisionAabb,
  type CollisionBroadphaseEntry,
  type CollisionBroadphaseId,
  type CollisionBroadphaseOptions,
  type CollisionBroadphasePair
} from "./math/broadphase.ts";
export { gridKey, inBounds, sameCell, opposite } from "./math/grid.ts";
