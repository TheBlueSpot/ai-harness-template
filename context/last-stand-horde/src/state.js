import { BARRICADE, ECONOMY, PHASES, PLAYER, WORLD } from "./config.js";
import { createPlayer } from "./entities/player.js";

export function createInitialState() {
  const viewport = {
    width: WORLD.baseWidth,
    height: WORLD.baseHeight,
    dpr: 1,
  };
  const arena = createArena(viewport);
  return {
    phase: PHASES.MENU,
    day: 1,
    cycleClock: 0,
    cycleLength: WORLD.dayDuration,
    night: 0,
    score: 0,
    scrap: ECONOMY.startingScrap,
    ammo: ECONOMY.startingAmmo,
    survivorsAlive: ECONOMY.startingSurvivors,
    survivorsTotal: ECONOMY.startingSurvivors,
    viewport,
    arena,
    player: createPlayer({
      x: 250,
      y: arena.groundY - 26,
      radius: PLAYER.radius,
      health: PLAYER.maxHealth,
      maxHealth: PLAYER.maxHealth,
      ammo: ECONOMY.startingAmmo,
    }),
    barricade: createBarricade(arena),
    survivors: createSurvivors(arena, ECONOMY.startingSurvivors),
    scavengeSites: createScavengeSites(1, arena),
    zombies: [],
    pendingShots: [],
    pendingMelee: [],
    combatLog: [],
    spawn: {
      waveSeed: 0,
      spawnTimer: 0,
      totalSpawnBudget: 0,
      spawnedCount: 0,
      spawnedThisNight: false,
    },
    inventory: {
      medkit: 0,
      parts: 0,
    },
    interactionLock: false,
    message: "Daylight is your only quiet shift.",
    status: "Press Start, then scavenge before the first night.",
  };
}

export function cloneState(state) {
  return {
    ...state,
    viewport: { ...state.viewport },
    arena: { ...state.arena },
    player: { ...state.player },
    barricade: { ...state.barricade },
    survivors: (state.survivors ?? []).map((survivor) => ({ ...survivor })),
    scavengeSites: (state.scavengeSites ?? []).map((site) => ({ ...site })),
    zombies: (state.zombies ?? []).map((zombie) => ({
      ...zombie,
      bodyState: { ...(zombie.bodyState ?? {}) },
    })),
    pendingShots: (state.pendingShots ?? []).map((shot) => ({
      ...shot,
      origin: { ...(shot.origin ?? {}) },
      aim: { ...(shot.aim ?? {}) },
    })),
    pendingMelee: (state.pendingMelee ?? []).map((swing) => ({
      ...swing,
      origin: { ...(swing.origin ?? {}) },
    })),
    combatLog: (state.combatLog ?? []).map((entry) => ({ ...entry })),
    spawn: { ...state.spawn },
    inventory: { ...state.inventory },
  };
}

export function applyViewport(state, viewport = {}) {
  const nextViewport = {
    width: Math.max(1, Math.round(Number(viewport.width) || state.viewport.width || WORLD.baseWidth)),
    height: Math.max(1, Math.round(Number(viewport.height) || state.viewport.height || WORLD.baseHeight)),
    dpr: Math.max(1, Number(viewport.dpr) || state.viewport.dpr || 1),
  };
  const arena = createArena(nextViewport);
  return {
    ...state,
    viewport: nextViewport,
    arena,
    barricade: syncBarricadeToArena(state.barricade, arena),
    survivors: (state.survivors ?? []).map((survivor, index) => syncSurvivorToArena(survivor, arena, index)),
    scavengeSites: createScavengeSites(state.day ?? 1, arena, state.scavengeSites ?? []),
    player: {
      ...state.player,
      y: arena.groundY - 26,
      x: clamp(state.player?.x ?? 250, 40, arena.width - 40),
    },
  };
}

export function enterRun(state) {
  const next = createInitialState();
  next.viewport = { ...state.viewport };
  next.arena = createArena(next.viewport);
  next.barricade = createBarricade(next.arena);
  next.survivors = createSurvivors(next.arena, ECONOMY.startingSurvivors);
  next.scavengeSites = createScavengeSites(1, next.arena);
  next.player = createPlayer({
    x: 250,
    y: next.arena.groundY - 26,
    radius: PLAYER.radius,
    health: PLAYER.maxHealth,
    maxHealth: PLAYER.maxHealth,
    ammo: next.ammo,
  });
  next.phase = PHASES.DAY;
  next.message = "Day 1. Search the block, restock, then hold the line.";
  next.status = "Move across the street, scavenge crates, repair at the barricade.";
  return next;
}

export function beginDay(state) {
  state.phase = PHASES.DAY;
  state.cycleClock = 0;
  state.cycleLength = WORLD.dayDuration;
  state.night = 0;
  state.interactionLock = false;
  state.zombies = [];
  state.pendingShots = [];
  state.pendingMelee = [];
  state.combatLog = [];
  state.spawn = {
    waveSeed: (state.spawn?.waveSeed ?? 0) + 1,
    spawnTimer: 0,
    totalSpawnBudget: 0,
    spawnedCount: 0,
    spawnedThisNight: false,
  };
  state.scavengeSites = createScavengeSites(state.day, state.arena);
  state.player.x = Math.min(260, state.arena.width * 0.22);
  state.player.y = state.arena.groundY - 26;
  state.player.health = Math.min(state.player.maxHealth, state.player.health + 10);
  state.player.ammo = state.ammo;
  state.message = `Day ${state.day}. Sweep the street before sundown.`;
  state.status = "Scavenge marked locations, repair the barricade, and buy ammo if needed.";
  return state;
}

export function beginNight(state) {
  state.phase = PHASES.NIGHT;
  state.cycleClock = 0;
  state.cycleLength = WORLD.nightDuration;
  state.night = 0;
  state.interactionLock = false;
  state.scavengeSites = [];
  state.player.x = state.barricade.x - 150;
  state.player.y = state.arena.groundY - 26;
  state.player.ammo = state.ammo;
  state.message = `Night ${state.day}. The horde is coming.`;
  state.status = "Hold the lane, shoot heads, and patch the barricade if it starts to crack.";
  return state;
}

export function getBarricadeRatio(state) {
  return clamp01((state.barricade?.hp ?? 0) / Math.max(1, state.barricade?.maxHp ?? BARRICADE.maxHp));
}

export function getNightPressure(state) {
  if (state.phase !== PHASES.NIGHT) {
    return 0;
  }
  return clamp01((state.cycleClock ?? 0) / Math.max(1, state.cycleLength ?? WORLD.nightDuration));
}

export function createArena(viewport) {
  return {
    width: viewport.width,
    height: viewport.height,
    groundY: viewport.height * 0.76,
    scavengingEdge: Math.min(viewport.width * 0.62, WORLD.scavengingEdge),
    barricadeX: Math.min(viewport.width * 0.72, WORLD.barricadeX),
    barricadeY: viewport.height * 0.59,
  };
}

export function clamp01(value) {
  return clamp(value, 0, 1);
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function createBarricade(arena) {
  return {
    x: arena.barricadeX,
    y: arena.barricadeY,
    width: BARRICADE.width,
    height: BARRICADE.height,
    hp: BARRICADE.startingHp,
    maxHp: BARRICADE.maxHp,
    level: 0,
  };
}

function syncBarricadeToArena(barricade, arena) {
  return {
    ...barricade,
    x: arena.barricadeX,
    y: arena.barricadeY,
    width: BARRICADE.width,
    height: BARRICADE.height,
  };
}

function createSurvivors(arena, count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `survivor-${index + 1}`,
    x: arena.barricadeX - 90 - index * 26,
    y: arena.groundY - 18,
    dead: false,
  }));
}

function syncSurvivorToArena(survivor, arena, index) {
  return {
    ...survivor,
    x: arena.barricadeX - 90 - index * 26,
    y: arena.groundY - 18,
  };
}

function createScavengeSites(day, arena, currentSites = []) {
  const layouts = [
    { id: "garage", x: arena.width * 0.18, y: arena.groundY - 50, kind: "scrap" },
    { id: "store", x: arena.width * 0.35, y: arena.groundY - 66, kind: "ammo" },
    { id: "ambulance", x: arena.width * 0.53, y: arena.groundY - 60, kind: "med" },
  ];
  return layouts.map((site, index) => {
    const previous = currentSites.find((entry) => entry.id === site.id);
    return {
      ...site,
      radius: 32,
      seed: day * 17 + index * 11,
      collected: previous?.collected ?? false,
    };
  });
}
