export const GamePhase = {
  Menu: "menu",
  Play: "play",
  Lose: "lose",
};

export function createInitialRunState(config) {
  return {
    phase: GamePhase.Menu,
    time: 0,
    distance: 0,
    bestDistance: 0,
    lean: 0,
    bestLean: 0,
    failReason: null,
    fallLocked: false,
    ragdoll: null,
    config,
  };
}
