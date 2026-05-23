import { expect, test } from "bun:test";
import {
  __setGamepadNavigatorForTests,
  getGamepad,
  getGamepadAxis,
  getGamepads,
  isGamepadButtonDown,
  isGamepadButtonPressed,
  isGamepadButtonReleased,
  updateGamepads
} from "./gamepad.ts";

function createGamepad(index: number, buttons: boolean[], axes: number[] = [], connected = true) {
  return {
    index,
    connected,
    buttons: buttons.map((pressed) => ({ pressed } as GamepadButton)),
    axes
  } as unknown as Gamepad;
}

test("gamepad polling exposes indexed and any-controller queries", () => {
  __setGamepadNavigatorForTests({
    getGamepads() {
      return [createGamepad(0, [true, false, false, false], [0.1, 0.3]), null];
    }
  } as Navigator);

  updateGamepads();

  expect(getGamepads()).toHaveLength(1);
  expect(getGamepad(0)?.index).toBe(0);
  expect(isGamepadButtonDown(0)).toBe(true);
  expect(isGamepadButtonDown("a", 0)).toBe(true);
  expect(getGamepadAxis("leftx")).toBe(0);
  expect(getGamepadAxis(1, 0)).toBe(0.3);
});

test("gamepad polling tracks pressed and released edges across frames", () => {
  let pads = [createGamepad(0, [false, false, false, false])];
  __setGamepadNavigatorForTests({
    getGamepads() {
      return pads;
    }
  } as Navigator);

  updateGamepads();
  expect(isGamepadButtonPressed(0)).toBe(false);

  pads = [createGamepad(0, [true, false, false, false])];
  updateGamepads();
  expect(isGamepadButtonDown("a")).toBe(true);
  expect(isGamepadButtonPressed("a")).toBe(true);
  expect(isGamepadButtonReleased("a")).toBe(false);

  pads = [createGamepad(0, [false, false, false, false])];
  updateGamepads();
  expect(isGamepadButtonDown("a")).toBe(false);
  expect(isGamepadButtonPressed("a")).toBe(false);
  expect(isGamepadButtonReleased("a")).toBe(true);
});

test("gamepad polling ignores disconnected and null pads", () => {
  __setGamepadNavigatorForTests({
    getGamepads() {
      return [null, createGamepad(1, [true, false, false, false], [], false), createGamepad(2, [false, true, false, false])];
    }
  } as Navigator);

  updateGamepads();

  expect(getGamepads()).toHaveLength(1);
  expect(getGamepad(1)).toBeNull();
  expect(getGamepad(2)?.index).toBe(2);
  expect(isGamepadButtonDown(1, 2)).toBe(true);
});
