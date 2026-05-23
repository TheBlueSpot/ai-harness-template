export const WORLD = {
  bounds: { minX: 0, minY: 0, maxX: 2400, maxY: 1600 },
};

export const DATA = {
  player: {
    startMass: 8,
    baseRadius: 18,
    radiusScale: 4.5,
  },
  movement: {
    baseAcceleration: 1080,
    baseSpeed: 252,
    massSpeed: 36,
    drag: 0.84,
    turnAcceleration: 4.35,
    maxSpin: 1.75,
    driveSpinDrag: 0.9,
    idleSpinDrag: 0.78,
    lowSpeedBoost: 1.18,
    lowSpeedThreshold: 118,
  },
  districts: [
    { id: "pavement", label: "Pavement", massThreshold: 18, winTarget: 18, band: { x: 60, y: 120, w: 640, h: 1360, tint: "rgba(28, 42, 68, 0.52)" } },
    { id: "market", label: "Market", massThreshold: 42, winTarget: 42, band: { x: 820, y: 120, w: 640, h: 1360, tint: "rgba(42, 28, 56, 0.52)" } },
    { id: "harbor", label: "Harbor", massThreshold: 82, winTarget: 82, band: { x: 1580, y: 120, w: 640, h: 1360, tint: "rgba(20, 58, 64, 0.5)" } },
  ],
  collectibleClasses: [
    { type: "paper", label: "Paper", mass: 0.8, radius: 6, district: 0 },
    { type: "cone", label: "Traffic Cone", mass: 2.2, radius: 9, district: 0 },
    { type: "crate", label: "Crate", mass: 4.6, radius: 12, district: 1 },
    { type: "bench", label: "Bench", mass: 8.2, radius: 16, district: 1 },
    { type: "car", label: "Car", mass: 14.5, radius: 21, district: 2 },
    { type: "billboard", label: "Billboard", mass: 24, radius: 28, district: 2 },
  ],
  hazardClasses: [
    { type: "spike", label: "Spike Cart", mass: 0, radius: 48, damage: "lose" },
    { type: "void", label: "Red Hazard", mass: 0, radius: 60, damage: "lose" },
  ],
};
