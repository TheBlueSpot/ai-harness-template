export const GAMEPAD_AXIS_DEADZONE = 0.15;

const buttonAliases = new Map([
  ["a", 0],
  ["b", 1],
  ["x", 2],
  ["y", 3],
  ["leftbumper", 4],
  ["lb", 4],
  ["rightbumper", 5],
  ["rb", 5],
  ["lefttrigger", 6],
  ["lt", 6],
  ["righttrigger", 7],
  ["rt", 7],
  ["back", 8],
  ["select", 8],
  ["share", 8],
  ["start", 9],
  ["options", 9],
  ["leftstick", 10],
  ["ls", 10],
  ["rightstick", 11],
  ["rs", 11],
  ["dpadup", 12],
  ["up", 12],
  ["dpaddown", 13],
  ["down", 13],
  ["dpadleft", 14],
  ["left", 14],
  ["dpadright", 15],
  ["right", 15],
  ["home", 16],
  ["guide", 16],
  ["ps", 16],
  ["touchpad", 17],
  ["paddle1", 20],
  ["paddle2", 21],
  ["paddle3", 22],
  ["paddle4", 23]
]);

const axisAliases = new Map([
  ["leftx", 0],
  ["lx", 0],
  ["leftstickx", 0],
  ["lefty", 1],
  ["ly", 1],
  ["leftsticky", 1],
  ["rightx", 2],
  ["rx", 2],
  ["rightstickx", 2],
  ["righty", 3],
  ["ry", 3],
  ["rightsticky", 3]
]);

type GamepadButton = number | string;
type GamepadAxis = number | string;
type GamepadSource = Pick<Navigator, "getGamepads">;

let currentPads: Gamepad[] = [];
let previousPads: Gamepad[] = [];
let sampled = false;
let navigatorSource: GamepadSource | null =
  typeof navigator !== "undefined" && typeof navigator.getGamepads === "function" ? navigator : null;

function normalizeName(name: string) {
  return String(name).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function resolveButton(button: GamepadButton) {
  if (typeof button === "number") return button;
  return buttonAliases.get(normalizeName(button));
}

function resolveAxis(axis: GamepadAxis) {
  if (typeof axis === "number") return axis;
  return axisAliases.get(normalizeName(axis));
}

function buttonDown(pad: Gamepad | null, button: GamepadButton) {
  const resolved = resolveButton(button);
  return resolved == null ? false : pad?.buttons[resolved]?.pressed === true;
}

function axisDown(pad: Gamepad | null, axis: GamepadAxis) {
  const resolved = resolveAxis(axis);
  if (resolved == null) return 0;
  const value = pad?.axes[resolved] ?? 0;
  return Math.abs(value) < GAMEPAD_AXIS_DEADZONE ? 0 : value;
}

function sampleGamepads() {
  previousPads = currentPads;

  if (!navigatorSource) {
    currentPads = [];
    sampled = true;
    return;
  }

  const snapshot = navigatorSource.getGamepads();
  const nextPads: Gamepad[] = [];

  for (const pad of snapshot) {
    if (!pad || !pad.connected) continue;
    nextPads[pad.index] = pad;
  }

  currentPads = nextPads;
  sampled = true;
}

function ensureSampled() {
  if (!sampled) sampleGamepads();
}

export function updateGamepads() {
  sampleGamepads();
}

export function getGamepads() {
  ensureSampled();
  return currentPads.filter(Boolean);
}

export function getGamepad(index: number) {
  ensureSampled();
  return currentPads[index] ?? null;
}

export function isGamepadButtonDown(button: GamepadButton, index?: number) {
  ensureSampled();
  if (typeof index === "number") return buttonDown(currentPads[index] ?? null, button);
  return currentPads.some((pad) => buttonDown(pad, button));
}

export function isGamepadButtonPressed(button: GamepadButton, index?: number) {
  ensureSampled();
  if (typeof index === "number") return buttonDown(currentPads[index] ?? null, button) && !buttonDown(previousPads[index] ?? null, button);
  return currentPads.some((pad) => buttonDown(pad, button) && !buttonDown(previousPads[pad.index] ?? null, button));
}

export function isGamepadButtonReleased(button: GamepadButton, index?: number) {
  ensureSampled();
  if (typeof index === "number") return buttonDown(previousPads[index] ?? null, button) && !buttonDown(currentPads[index] ?? null, button);
  return previousPads.some((pad) => buttonDown(pad, button) && !buttonDown(currentPads[pad.index] ?? null, button));
}

export function getGamepadAxis(axis: GamepadAxis, index?: number) {
  ensureSampled();
  if (typeof index === "number") return axisDown(currentPads[index] ?? null, axis);
  for (const pad of currentPads) {
    const value = axisDown(pad, axis);
    if (value !== 0) return value;
  }
  return 0;
}

export function __setGamepadNavigatorForTests(source: GamepadSource | null) {
  navigatorSource = source;
  currentPads = [];
  previousPads = [];
  sampled = false;
}
