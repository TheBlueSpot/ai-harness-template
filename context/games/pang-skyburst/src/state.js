export function createInitialState() {
  return {
    mode: "menu",
    score: 0,
    lives: 3,
    stage: 1,
    stageGoal: 0,
    hint: "Press Start to launch.",
    overlayKicker: "Arcade Shell",
    overlayTitle: "Pang Skyburst",
    overlayCopy: "Split every blob, stay alive, and clear the stage.",
    overlayPrimary: "Start",
    messageTimer: 0,
    transitionTimer: 0,
    totalBlobs: 0,
    player: {
      x: 0.5,
      y: 0.81,
      vx: 0,
      vy: 0,
      facing: 1,
      onGround: true,
      width: 0.05,
      height: 0.06,
      invuln: 0,
    },
    harpoon: {
      active: false,
      x: 0.5,
      y: 0.85,
      vy: 0,
      width: 0.01,
      height: 0.16,
      cooldown: 0,
    },
    blobs: [],
    platforms: [],
  };
}

export function createPlatformSet() {
  return [
    { x: 0.12, y: 0.84, w: 0.76, h: 0.02 },
    { x: 0.05, y: 0.58, w: 0.28, h: 0.02 },
    { x: 0.67, y: 0.58, w: 0.28, h: 0.02 },
    { x: 0.2, y: 0.34, w: 0.24, h: 0.02 },
    { x: 0.56, y: 0.34, w: 0.24, h: 0.02 },
  ];
}

export function createStageBlobs(stage) {
  const size = 3;
  return [
    {
      id: 1,
      size,
      x: 0.5,
      y: 0.24,
      vx: stage % 2 === 0 ? -0.22 : 0.22,
      vy: 0,
      radius: 0.085,
      bobSeed: 0.5,
    },
  ];
}
