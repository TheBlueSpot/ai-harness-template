import { REQUIRED_RELAYS, SHAFT_WIDTH, WORLD_DEPTH, clamp } from "./data.js";

const EXTRACTION_BUFFER = 260;

function createRng(seed) {
  let value = seed >>> 0;
  return function next() {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

export function buildWorld(seed = 1337) {
  const random = createRng(seed);
  const platforms = [{ x: 110, y: 110, width: 260, type: "start", active: true, fallTimer: 0 }];
  const drones = [];
  const sentries = [];
  const gems = [];
  const healthPacks = [];
  const relays = [];

  let y = 110;
  let x = 110;

  while (y < WORLD_DEPTH - EXTRACTION_BUFFER) {
    y += 130 + Math.floor(random() * 58);
    if (y >= WORLD_DEPTH - EXTRACTION_BUFFER) {
      break;
    }
    x = clamp(x + (random() * 190 - 95), 30, SHAFT_WIDTH - 180);

    const width = 90 + Math.floor(random() * 92);
    let type = "solid";
    const roll = random();

    if (y > 900 && roll < 0.13) {
      type = "spike";
    } else if (y > 500 && roll < 0.28) {
      type = "crumbly";
    }

    const platform = { x, y, width, type, active: true, fallTimer: 0 };
    platforms.push(platform);

    if (random() < 0.58) {
      const count = 1 + Math.floor(random() * 3);
      for (let index = 0; index < count; index += 1) {
        const spread = count === 1 ? 0.5 : index / (count - 1);
        gems.push({
          x: platform.x + 22 + spread * Math.max(12, platform.width - 44),
          y: platform.y - 38 - random() * 24,
          radius: 8,
          collected: false,
        });
      }
    }

    if (y > 820 && random() < 0.16) {
      healthPacks.push({
        x: clamp(platform.x + 26 + random() * Math.max(18, platform.width - 52), 24, SHAFT_WIDTH - 24),
        y: platform.y - 58 - random() * 18,
        radius: 11,
        collected: false,
        heal: 1,
      });
    }

    if (y > 700 && random() < 0.34) {
      const droneX = clamp(platform.x + 20 + random() * Math.max(24, platform.width - 40), 34, SHAFT_WIDTH - 34);
      drones.push({
        x: droneX,
        y: platform.y - 56,
        anchorX: droneX,
        radius: 14,
        hp: 2,
        phase: random() * Math.PI * 2,
        range: 18 + random() * 30,
        state: "idle",
        dashDir: random() < 0.5 ? -1 : 1,
        telegraph: 0,
        cooldown: 1 + random(),
        dead: false,
      });
    }

    if (y > 1450 && random() < 0.2) {
      const side = random() < 0.5 ? "left" : "right";
      const sentryX = side === "left" ? 18 : SHAFT_WIDTH - 18;
      sentries.push({
        type: "sentry",
        side,
        x: sentryX,
        y: platform.y - 84 - random() * 16,
        width: 18,
        height: 28,
        hp: 2,
        state: "idle",
        telegraph: 0,
        cooldown: 1.1 + random() * 1.2,
        dead: false,
      });
    }
  }

  for (let index = 0; index < REQUIRED_RELAYS; index += 1) {
    const progress = (index + 1) / (REQUIRED_RELAYS + 1);
    const relayY = 1500 + progress * (WORLD_DEPTH - 2400);
    relays.push({
      x: index % 2 === 0 ? 116 : SHAFT_WIDTH - 116,
      y: relayY,
      radius: 18,
      activated: false,
      label: `Relay ${index + 1}`,
    });

    platforms.push({
      x: index % 2 === 0 ? 46 : SHAFT_WIDTH - 166,
      y: relayY + 42,
      width: 120,
      type: "solid",
      active: true,
      fallTimer: 0,
    });
  }

  const goal = {
    x: SHAFT_WIDTH / 2,
    y: WORLD_DEPTH + 210,
    radius: 42,
    width: 156,
    height: 188,
  };
  platforms.push({ x: 136, y: WORLD_DEPTH - 132, width: 208, type: "solid", active: true, fallTimer: 0 });
  platforms.push({ x: 52, y: WORLD_DEPTH + 118, width: 112, type: "goal", active: true, fallTimer: 0 });
  platforms.push({ x: 316, y: WORLD_DEPTH + 118, width: 112, type: "goal", active: true, fallTimer: 0 });
  platforms.push({ x: 188, y: WORLD_DEPTH + 168, width: 104, type: "solid", active: true, fallTimer: 0 });
  gems.push(
    { x: goal.x, y: WORLD_DEPTH - 46, radius: 8, collected: false },
    { x: goal.x, y: WORLD_DEPTH + 12, radius: 8, collected: false },
    { x: goal.x, y: WORLD_DEPTH + 72, radius: 8, collected: false },
  );

  return { platforms, drones, sentries, gems, healthPacks, relays, goal };
}
