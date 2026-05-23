export const TOWER_SCENARIO = {
  title: "SimTower Elevator Ops",
  floors: 10,
  elevators: 3,
  maxQueue: 28,
  basePassengerCap: 8,
  floorHeight: 1,
  floorLabels: ["Lobby", "Retail", "Office", "Atrium", "Clinic", "Lab", "Club", "Penthouse", "Sky Deck", "Roof"],
};

export const PASSENGER_ARCHETYPES = [
  { id: "commuter", label: "Commuter", preferredDirection: 1, patience: 1.0, load: 1, boardBias: 1 },
  { id: "visitor", label: "Visitor", preferredDirection: 1, patience: 0.85, load: 1, boardBias: 0.8 },
  { id: "service", label: "Service", preferredDirection: -1, patience: 1.15, load: 2, boardBias: 1.1 },
];

export const FLOOR_METADATA = Array.from({ length: TOWER_SCENARIO.floors }, (_, floor) => ({
  floor,
  label: TOWER_SCENARIO.floorLabels[floor] ?? `Floor ${floor}`,
  hub: floor === 0 || floor === TOWER_SCENARIO.floors - 1,
  demandBias: floor === 0 ? 0.35 : 1 + (floor % 4) * 0.18,
}));

export const SURGE_DEFINITIONS = [
  {
    id: "warmup",
    label: "Warmup lane",
    floor: 2,
    interval: 18,
    pressure: 1.15,
    queueRate: 0.7,
    coach: "Clear the lower floors first so the dispatch pattern reads before the full tower opens.",
  },
  {
    id: "atrium",
    label: "Atrium crush",
    floor: 4,
    interval: 20,
    pressure: 1.55,
    queueRate: 0.95,
    coach: "Full tower is live now. Keep one car feeding the lobby while another shadows the active surge floor.",
  },
  {
    id: "roof",
    label: "Roof spill",
    floor: 8,
    interval: 22,
    pressure: 1.95,
    queueRate: 1.15,
    coach: "Late shift pressure climbs at the top of the tower. Clear loaded cars fast before the roof stacks up.",
  },
];

export const SCORE_RULES = {
  servicePoints: 8,
  pressurePerQueue: 0.28,
  failQueue: 28,
  clearScore: 432,
  clearServed: 72,
  clearSurges: 3,
};
