import { DATA, WORLD } from "./data.js";

function makeRng(seed) {
  let value = seed >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function choose(list, index) {
  return list[index % list.length];
}

function buildObject(id, template, x, y, districtIndex, variant) {
  return {
    id,
    type: template.type,
    label: template.label,
    mass: template.mass * (1 + variant * 0.06),
    radius: template.radius,
    districtIndex,
    absorbMass: template.mass * (0.92 + districtIndex * 0.18),
    position: { x, y },
  };
}

export function createGameState() {
  return {
    mode: "menu",
    time: 0,
    districtIndex: 0,
    collectedCount: 0,
    pulse: 0,
    overlayVisible: true,
    overlay: {
      eyebrow: "Mission",
      title: "Katamari Clump Rollup",
      copy: "Roll small props, follow the nose arrow, grow through gates, and dodge red hazards.",
      button: "Start",
    },
    player: {
      position: { x: 220, y: 900 },
      velocity: { x: 0, y: 0 },
      heading: 0,
      rotation: 0,
      spin: 0,
      mass: DATA.player.startMass,
      radius: DATA.player.baseRadius + Math.sqrt(DATA.player.startMass) * DATA.player.radiusScale,
    },
    attachedItems: [],
    hud: { mass: DATA.player.startMass, elapsed: 0, score: 0, message: "Follow the nose arrow and roll small props first." },
    camera: { x: 0, y: 0, width: 0, height: 0 },
  };
}

export function resetGameState(state) {
  const fresh = createGameState();
  Object.assign(state, fresh);
  state.player.position = { ...fresh.player.position };
  state.player.velocity = { ...fresh.player.velocity };
  state.attachedItems = [];
  return state;
}

export function createWorld(seed = 1337) {
  const rng = makeRng(seed);
  const objects = [];
  const hazards = [];
  const gates = [];
  let id = 1;

  DATA.districts.forEach((district, districtIndex) => {
    const x0 = 120 + districtIndex * 760;
    const x1 = x0 + 620;
    const laneYs = [320, 520, 720, 940, 1180, 1360];
    const collectibleCount = 10 + districtIndex * 4;
    for (let i = 0; i < collectibleCount; i += 1) {
      const template = choose(DATA.collectibleClasses, i + districtIndex * 2);
      const variant = 1 + ((i + districtIndex) % 3) * 0.5;
      objects.push(buildObject(id++, template, x0 + rng() * (x1 - x0), choose(laneYs, i) + rng() * 60 - 30, districtIndex, variant));
    }
    const hazardTemplate = choose(DATA.hazardClasses, districtIndex);
    hazards.push({
      id: `h-${districtIndex}`,
      type: hazardTemplate.type,
      label: hazardTemplate.label,
      radius: hazardTemplate.radius,
      position: { x: x0 + 300 + districtIndex * 80, y: 420 + districtIndex * 320 },
      districtIndex,
    });
    gates.push({
      id: `g-${districtIndex}`,
      districtIndex,
      x: x1 - 40,
      y: 160,
      width: 120,
      height: 54,
      exitX: x1 + 60,
      open: districtIndex === 0,
      massThreshold: district.massThreshold,
    });
  });

  return {
    bounds: WORLD.bounds,
    objects,
    hazards,
    gates,
  };
}

export function createFrameState(state, world, viewport) {
  const attachedItems = state.attachedItems.map((item) => ({
    id: item.id,
    type: item.type,
    label: item.label,
    mass: item.mass,
    x: item.position?.x ?? state.player.position.x,
    y: item.position?.y ?? state.player.position.y,
    radius: 8 + Math.sqrt(item.mass) * 2,
  }));

  const groupedObjects = world.objects.reduce((groups, object) => {
    const key = object.type;
    (groups[key] ||= []).push({
      id: object.id,
      type: object.type,
      label: object.label,
      x: object.position.x,
      y: object.position.y,
      radius: object.radius,
      mass: object.mass,
      districtIndex: object.districtIndex,
      absorbable: state.player.mass >= object.absorbMass,
    });
    return groups;
  }, {});

  return {
    mode: state.mode,
    camera: state.camera,
    world: world.bounds,
    player: {
      x: state.player.position.x,
      y: state.player.position.y,
      rotation: state.player.rotation,
      heading: state.player.heading,
      mass: state.player.mass,
      radius: state.player.radius,
      velocity: { ...state.player.velocity },
    },
    attachedItems,
    objects: groupedObjects,
    collectibles: groupedObjects,
    hazards: world.hazards.map((hazard) => ({
      id: hazard.id,
      type: hazard.type,
      label: hazard.label,
      x: hazard.position.x,
      y: hazard.position.y,
      radius: hazard.radius,
      districtIndex: hazard.districtIndex,
    })),
    gates: world.gates.map((gate) => ({
      id: gate.id,
      districtIndex: gate.districtIndex,
      x: gate.x,
      y: gate.y,
      width: gate.width,
      height: gate.height,
      open: gate.open,
      massThreshold: gate.massThreshold,
    })),
    hud: {
      mass: state.hud.mass,
      elapsed: state.hud.elapsed,
      score: state.hud.score,
      message: state.hud.message,
      districtLabel: DATA.districts[state.districtIndex]?.label ?? "Complete",
      districtIndex: state.districtIndex,
      districtTotal: DATA.districts.length,
      nextTarget: DATA.districts[state.districtIndex]?.winTarget ?? DATA.districts[DATA.districts.length - 1].winTarget,
    },
    cameraExtents: {
      x: state.camera.x,
      y: state.camera.y,
      width: state.camera.width || viewport.width,
      height: state.camera.height || viewport.height,
    },
    overlay: {
      visible: state.overlayVisible,
      eyebrow: state.overlay.eyebrow,
      title: state.overlay.title,
      copy: state.overlay.copy,
      button: state.overlay.button,
    },
    districtBands: DATA.districts.map((district) => district.band),
  };
}
