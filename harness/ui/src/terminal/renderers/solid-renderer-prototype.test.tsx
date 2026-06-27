/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createUiTest } from "../../utils/tests/test-harness";
import { terminalStore } from "../terminal-store";
import { SolidTerminalRendererPrototype } from "./solid-renderer-prototype";

createUiTest("SolidTerminalRendererPrototype", () => {
  beforeEach(() => {
    terminalStore.resetForTests();
  });

  it("sends keyboard input for printable and control keys", () => {
    const inputs: Array<string | Uint8Array> = [];

    render(() => (
      <SolidTerminalRendererPrototype
        output="PS>"
        backspaceInput={"\b"}
        onInput={(input) => inputs.push(input)}
      />
    ));

    const terminal = screen.getByRole("textbox", { name: "Terminal output" });
    fireEvent.keyDown(terminal, { key: "a" });
    fireEvent.keyDown(terminal, { key: "Backspace" });
    fireEvent.keyDown(terminal, { key: "Enter" });
    fireEvent.keyDown(terminal, { key: "ArrowUp" });

    expect(inputs).toEqual(["a", "\b", "\r", "\x1b[A"]);
  });

  it("toggles terminal search from primary f and closes it from Escape", () => {
    render(() => <SolidTerminalRendererPrototype output="PS>" />);

    const terminal = screen.getByRole("textbox", { name: "Terminal output" });
    fireEvent.keyDown(terminal, { key: "f", ctrlKey: true });
    expect(terminalStore.state.searchOpen).toBe(true);

    fireEvent.keyDown(terminal, { key: "Escape" });
    expect(terminalStore.state.searchOpen).toBe(false);
  });
});
