export function createLevel() {
  const stageBands = [
    { start: 0, end: 1720, color: "rgba(34, 197, 94, 0.08)" },
    { start: 1720, end: 3380, color: "rgba(14, 165, 233, 0.08)" },
    { start: 3380, end: 5100, color: "rgba(250, 204, 21, 0.08)" },
    { start: 5100, end: 7000, color: "rgba(244, 114, 182, 0.08)" },
    { start: 7000, end: 8920, color: "rgba(167, 139, 250, 0.08)" },
  ];

  const stages = [
    { start: 0, end: 1720, name: "1. Yard Breakout", hint: "Build rope speed. Bounce off exposed pads." },
    { start: 1720, end: 3380, name: "2. Reactor Sprint", hint: "Turrets own floor. Stay in air." },
    { start: 3380, end: 5100, name: "3. Secret Spine", hint: "Upper lane hides bonus cells and safer line." },
    { start: 5100, end: 7000, name: "4. Cannon Gauntlet", hint: "Read patrol gaps, chain rebound pads." },
    { start: 7000, end: 8920, name: "5. Skybridge Escape", hint: "Final slingshot route. Clean battery sweep." },
  ];

  const platforms = [
    { x: 0, y: 680, w: 980, h: 140 },
    { x: 1130, y: 620, w: 280, h: 24 },
    { x: 1510, y: 560, w: 220, h: 24 },
    { x: 1730, y: 660, w: 400, h: 120 },
    { x: 1970, y: 510, w: 240, h: 24 },
    { x: 2290, y: 440, w: 220, h: 24 },
    { x: 2550, y: 620, w: 260, h: 24 },
    { x: 2860, y: 540, w: 240, h: 24 },
    { x: 3180, y: 470, w: 240, h: 24 },
    { x: 3440, y: 680, w: 340, h: 140 },
    { x: 3630, y: 540, w: 210, h: 24 },
    { x: 3890, y: 430, w: 210, h: 24 },
    { x: 4070, y: 310, w: 170, h: 22 },
    { x: 4310, y: 250, w: 170, h: 22 },
    { x: 4560, y: 390, w: 210, h: 24 },
    { x: 4780, y: 520, w: 250, h: 24 },
    { x: 5100, y: 660, w: 300, h: 120 },
    { x: 5350, y: 520, w: 210, h: 24 },
    { x: 5620, y: 430, w: 210, h: 24 },
    { x: 5880, y: 330, w: 190, h: 22 },
    { x: 6110, y: 480, w: 230, h: 24 },
    { x: 6370, y: 390, w: 200, h: 24 },
    { x: 6640, y: 300, w: 190, h: 22 },
    { x: 6890, y: 470, w: 230, h: 24 },
    { x: 7200, y: 620, w: 280, h: 24 },
    { x: 7480, y: 520, w: 200, h: 24 },
    { x: 7720, y: 400, w: 190, h: 22 },
    { x: 7930, y: 280, w: 180, h: 22 },
    { x: 8180, y: 210, w: 180, h: 22 },
    { x: 8420, y: 320, w: 220, h: 24 },
    { x: 8650, y: 560, w: 420, h: 140 },
  ];

  const anchors = [
    { x: 1040, y: 360 },
    { x: 1410, y: 300 },
    { x: 1670, y: 260 },
    { x: 1880, y: 260 },
    { x: 2170, y: 210 },
    { x: 2460, y: 180 },
    { x: 2730, y: 240 },
    { x: 3010, y: 160 },
    { x: 3280, y: 140 },
    { x: 3560, y: 280 },
    { x: 3810, y: 200 },
    { x: 4040, y: 140 },
    { x: 4280, y: 110 },
    { x: 4510, y: 170 },
    { x: 4740, y: 250 },
    { x: 5040, y: 320 },
    { x: 5320, y: 210 },
    { x: 5590, y: 150 },
    { x: 5850, y: 110 },
    { x: 6080, y: 180 },
    { x: 6330, y: 150 },
    { x: 6590, y: 120 },
    { x: 6850, y: 190 },
    { x: 7130, y: 260 },
    { x: 7390, y: 210 },
    { x: 7640, y: 140 },
    { x: 7890, y: 110 },
    { x: 8130, y: 90 },
    { x: 8390, y: 150 },
    { x: 8610, y: 220 },
  ];

  const checkpoints = [
    { x: 220, y: 680 },
    { x: 1900, y: 660 },
    { x: 3570, y: 680 },
    { x: 5230, y: 660 },
    { x: 7260, y: 620 },
  ];

  const batteries = [
    { x: 1240, y: 568 },
    { x: 1600, y: 508 },
    { x: 2050, y: 458 },
    { x: 2930, y: 488 },
    { x: 3700, y: 488 },
    { x: 4380, y: 218 },
    { x: 4880, y: 478 },
    { x: 5710, y: 398 },
    { x: 6480, y: 358 },
    { x: 7570, y: 488 },
    { x: 8240, y: 178 },
    { x: 8520, y: 278 },
  ];

  const medkits = [
    { x: 4140, y: 278 },
    { x: 6160, y: 448 },
    { x: 8450, y: 288 },
  ];

  const turrets = [
    { x: 1210, y: 580, cooldown: 1.28, timer: 0.58, windup: 0.4 },
    { x: 2100, y: 470, cooldown: 1.32, timer: 0.82, windup: 0.4 },
    { x: 2610, y: 580, cooldown: 1.26, timer: 0.42, windup: 0.38 },
    { x: 3090, y: 500, cooldown: 1.22, timer: 0.72, windup: 0.4 },
    { x: 4610, y: 370, cooldown: 1.2, timer: 0.5, windup: 0.38 },
    { x: 5400, y: 500, cooldown: 1.18, timer: 0.64, windup: 0.38 },
    { x: 6180, y: 460, cooldown: 1.2, timer: 0.9, windup: 0.4 },
    { x: 6960, y: 450, cooldown: 1.16, timer: 0.5, windup: 0.38 },
    { x: 7770, y: 380, cooldown: 1.18, timer: 0.74, windup: 0.38 },
    { x: 8480, y: 290, cooldown: 1.12, timer: 0.36, windup: 0.36 },
  ];

  const bouncePads = [
    { x: 1530, y: 560, w: 92, boost: 900, forwardBoost: 190 },
    { x: 2570, y: 620, w: 96, boost: 940, forwardBoost: 170 },
    { x: 3460, y: 680, w: 96, boost: 960, forwardBoost: 220 },
    { x: 4800, y: 520, w: 92, boost: 930, forwardBoost: 190 },
    { x: 6120, y: 480, w: 90, boost: 960, forwardBoost: 150 },
    { x: 7240, y: 620, w: 92, boost: 940, forwardBoost: 170 },
    { x: 8430, y: 320, w: 96, boost: 980, forwardBoost: 120 },
  ];

  const boostRings = [
    { x: 1800, y: 330, radius: 34, vx: 220, vy: -260, cooldown: 0.75, message: "Slingshot live." },
    { x: 3360, y: 230, radius: 34, vx: 140, vy: -320, cooldown: 0.75, message: "Reactor sling engaged." },
    { x: 5010, y: 340, radius: 34, vx: 200, vy: -290, cooldown: 0.75, message: "Secret launch ring fired." },
    { x: 7020, y: 240, radius: 34, vx: 180, vy: -310, cooldown: 0.75, message: "Gauntlet sling engaged." },
    { x: 8350, y: 130, radius: 36, vx: 240, vy: -260, cooldown: 0.75, message: "Skybridge launch live." },
  ];

  const drones = [
    { x: 2380, y: 330, minX: 2320, maxX: 2490, speed: 110, bob: 26, radius: 18, phase: 0.1 },
    { x: 3930, y: 360, minX: 3850, maxX: 4050, speed: 120, bob: 22, radius: 18, phase: 0.4 },
    { x: 5760, y: 270, minX: 5670, maxX: 5980, speed: 150, bob: 20, radius: 20, phase: 0.65 },
    { x: 6500, y: 240, minX: 6410, maxX: 6710, speed: 135, bob: 18, radius: 18, phase: 0.2 },
    { x: 8050, y: 170, minX: 7970, maxX: 8290, speed: 150, bob: 24, radius: 20, phase: 0.8 },
  ];

  return {
    worldWidth: 8920,
    worldHeight: 860,
    start: { x: 120, y: 680 },
    goal: { x: 8730, y: 500, w: 70, h: 70 },
    platforms,
    anchors,
    checkpoints,
    batteries,
    medkits,
    turrets,
    bouncePads,
    boostRings,
    drones,
    stages,
    stageBands,
  };
}
