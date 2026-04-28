export function createBattleState({ party = [], enemies = [] } = {}) {
  return {
    party: party.map((entry, index) => createCombatant(entry, index, "party")),
    enemies: enemies.map((entry, index) => createCombatant(entry, index, "enemy")),
  };
}

export function createUiState(overrides = {}) {
  return {
    state: "menu",
    overlay: "menu",
    selectionMode: "command",
    commandIndex: 0,
    targetIndex: 0,
    cursor: 0,
    message: "Press Start Battle",
    ...overrides,
  };
}

export function createResultState(overrides = {}) {
  return {
    kind: null,
    summary: "",
    detail: "",
    ...overrides,
  };
}

function createCombatant(entry, row, side) {
  return {
    id: entry.id,
    name: entry.name,
    type: side,
    row: entry.row ?? row,
    hp: entry.maxHp,
    maxHp: entry.maxHp,
    power: entry.power,
    alive: true,
    gauge: 0,
    locked: false,
    status: {
      guard: false,
      poisoned: false,
    },
    statusTimers: {
      guard: 0,
      poison: 0,
    },
  };
}
