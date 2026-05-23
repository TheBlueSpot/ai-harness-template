export { createFixedStepLoop } from "./runtime/loop.ts";
export { createObjectPool } from "./runtime/object-pool.ts";
export { createStage } from "./runtime/stage.ts";
export { createKeyboardActions } from "./input/keyboard.ts";
export {
  bindKey,
  getPointerPos,
  isActionDown,
  isActionPressed,
  isActionReleased,
  isKeyDown,
  isKeyPressed,
  isKeyReleased,
  isPointerDown,
  isPointerPressed,
  isPointerReleased,
  setVirtualKeyState,
  updateInputFrame,
  unbindKey
} from "../input.ts";
export { createOnScreenGamepad } from "./onScreenGamepad.ts";
export {
  GAMEPAD_AXIS_DEADZONE,
  updateGamepads,
  getGamepads,
  getGamepad,
  isGamepadButtonDown,
  isGamepadButtonPressed,
  isGamepadButtonReleased,
  getGamepadAxis
} from "./input/gamepad.ts";
export { createPointerInput } from "./input/pointer.ts";
export { createCanvasObjectEvents } from "./input/delegation.ts";
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
export { gridKey, inBounds, sameCell, opposite } from "./math/grid.ts";
export {
  createCollisionKernel,
  resolveCollisionKernelWasmUrl,
  testCircleRectOverlap,
  type CollisionKernel,
  type CollisionKernelBackend,
  type CollisionKernelFallbackDiagnostic,
  type CollisionKernelFallbackReason,
  type CollisionKernelOptions,
  type CollisionKernelWasmUrlOptions
} from "./wasm/collision-kernel.ts";
export {
  createCamera,
  type Camera,
  type CameraBounds,
  type CameraOptions,
  type CameraState,
  type CameraTarget,
  type FollowOptions,
  type Point
} from "./canvas/camera.ts";
export { init } from "./canvas/bootstrap.ts";
export {
  drawCircle,
  drawLine,
  drawPolygon,
  drawRect,
  drawSprite,
  drawSpriteSlice,
  getSprite,
  popTransform,
  pushTransform,
  registerSprite,
  setDrawContext,
  unregisterSprite,
  type Anchor,
  type LineOptions,
  type SpriteAsset,
  type SpriteOptions,
  type SpriteSliceOptions,
  type StrokeFillOptions,
  type TransformOptions
} from "./canvas/drawing.ts";
export {
  drawText,
  loadFont,
  measureText,
  registerFont,
  textReady,
  type FontOptions,
  type TextOptions
} from "./canvas/text.ts";
export {
  createPostProcessStack,
  getPostProcessEffectCost,
  summarizePostProcessCost,
  checkPostProcessBudget,
  postProcessCosts,
  grayscale,
  invert,
  brightness,
  contrast,
  sepia,
  threshold,
  tint,
  posterize,
  gamma,
  colorGrading,
  filmGrain,
  digitalNoise,
  retroDithering,
  vignette,
  pixelate,
  screenShake,
  bloom,
  neonGlow,
  flashbang,
  crtScanlines,
  scanlineFlicker,
  chromaticAberration,
  colorFringe,
  chromaticDistortion,
  motionBlur,
  radialBlur,
  barrelDistortion,
  shockwaveDistortion,
  heatHaze,
  glitch,
  lensFlare,
  starStreak,
  colorLut,
  type PostProcessBudget,
  type PostProcessBudgetReport,
  type PostProcessContext,
  type PostProcessCostTier,
  type PostProcessEffect,
  type PostProcessEffectCost,
  type PostProcessStack
} from "./canvas/post-processing.ts";
