export const SAVE_KEY = "bison-gummy-slam-save";

export const GAME_CONSTANTS = {
  arenaWidth: 1640,
  arenaHeight: 900,
  groundY: 660,
  launcherX: 220,
  launcherBaseY: 585,
  gravity: 1850,
  airDrag: 0.985,
  groundFriction: 0.9,
  maxLaunchCharge: 1,
  launchPower: 920,
  slamWindow: 0.32,
  slamCarryWindow: 0.55,
  slamBoost: 520,
  openingImpactSpeed: 180,
  bouncePower: 0.78,
  enemyRadius: 20,
  gummyRadius: 17,
  chainWindow: 0.8,
};

export const UPGRADE_DEFS = [
  { id: "spring", label: "Spring Hocks", cost: 0, maxLevel: 1, desc: "Launcher-first bounce control.", owned: true, effect: { bounce: 0.16 } },
  { id: "syrup", label: "Syrup Cut", cost: 18, maxLevel: 4, desc: "Less air drag between contacts.", owned: false, effect: { drag: 0.04 } },
  { id: "slam", label: "Slam Teeth", cost: 24, maxLevel: 4, desc: "Harder slam impulse and reward.", owned: false, effect: { slam: 0.2 } },
  { id: "queue", label: "Bigger Queue", cost: 30, maxLevel: 3, desc: "Longer gummy chain to clear.", owned: false, effect: { queue: 2 } },
  { id: "coin", label: "Sugar Magnet", cost: 26, maxLevel: 4, desc: "More coins per clean chain.", owned: false, effect: { coin: 0.35 } },
];

export const OVERLAY_TEXT = {
  menu: { eyebrow: "Ready", title: "Launcher warm.", copy: "Start the run, let the launcher auto-fire, then chain rebounds and timed slams for burst scoring." },
  result: { eyebrow: "Run done", title: "Queue cleared.", copy: "Reload to bank upgrades and push a longer chain." },
};
