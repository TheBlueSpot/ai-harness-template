export const LEVEL_BOUNDS = { width: 1280, height: 720 };
export const MAX_LIVES = 3;
export const BANANA_TARGET = 3;
export const PLAYER_RADIUS = 22;

export function createLevelPlatforms() {
  return [
    { x: 92, y: 610, width: 1100, height: 26, angle: -0.02 },
    { x: 120, y: 500, width: 1000, height: 24, angle: 0.03 },
    { x: 170, y: 395, width: 920, height: 24, angle: -0.025 },
    { x: 220, y: 290, width: 820, height: 24, angle: 0.02 },
    { x: 260, y: 190, width: 720, height: 24, angle: -0.012 },
  ];
}

export function createBarrelLaunchPads() {
  return [
    { x: 268, y: 592, vx: 340, vy: -470, radius: 28, cooldown: 0 },
    { x: 940, y: 482, vx: -320, vy: -430, radius: 28, cooldown: 0 },
    { x: 392, y: 372, vx: 360, vy: -410, radius: 28, cooldown: 0 },
  ];
}

export function createZingerOrbits() {
  return [
    { centerX: 930, centerY: 530, rx: 64, ry: 28, phase: 0, speed: 1.5, radius: 19 },
    { centerX: 320, centerY: 360, rx: 54, ry: 36, phase: Math.PI * 0.5, speed: -1.8, radius: 18 },
    { centerX: 770, centerY: 250, rx: 72, ry: 30, phase: Math.PI, speed: 1.25, radius: 18 },
  ].map((zinger) => ({
    ...zinger,
    x: zinger.centerX + Math.cos(zinger.phase) * zinger.rx,
    y: zinger.centerY + Math.sin(zinger.phase) * zinger.ry,
  }));
}

export function createBananaPlacements() {
  return [
    { x: 1030, y: 540, collected: false },
    { x: 740, y: 380, collected: false },
    { x: 440, y: 235, collected: false },
  ];
}

export function createLadders() {
  return [
    { x: 1040, yTop: 472, yBottom: 610, width: 42 },
    { x: 240, yTop: 367, yBottom: 500, width: 42 },
    { x: 920, yTop: 262, yBottom: 395, width: 42 },
    { x: 390, yTop: 162, yBottom: 290, width: 42 },
  ];
}
