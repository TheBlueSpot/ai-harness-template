/** @jsxImportSource solid-js */
import { beforeEach, expect, it, mock } from "bun:test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createUiTest } from "./utils/tests/test-harness";
import { clearBrowserStateForTests } from "./utils/tests/store-test-utils";
import { harnessStore } from "./harness-store";

const createHotkeysMock = mock(() => undefined);

mock.module("@tanstack/solid-hotkeys", () => ({
  createHotkeys: createHotkeysMock
}));

mock.module("./harness-websocket", () => ({
  connectHarnessWebSocket: () => ({
    sendCommand: () => undefined,
    dispose: () => undefined
  })
}));

import { App } from "./app";

function getCreateHotkeysCall() {
  const calls = createHotkeysMock.mock.calls as unknown as Array<
    [Array<{ hotkey: string; callback: () => void }>, () => { enabled: boolean; ignoreInputs: boolean }]
  >;
  const call = calls.find(([definitions]) => {
    return (
      definitions.some((definition) => definition.hotkey === "Mod+K") &&
      definitions.some((definition) => definition.hotkey === "Mod+Space")
    );
  });
  if (!call) {
    throw new Error("Expected createHotkeys to be called");
  }

  return call as unknown as [
    Array<{ hotkey: string; callback: () => void }>,
    () => { enabled: boolean; ignoreInputs: boolean }
  ];
}

createUiTest("App shortcuts", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
    harnessStore.setActiveSurface("chat");
    createHotkeysMock.mockClear();
  });

  it("registers project switcher shortcuts through TanStack Hotkeys", () => {
    render(() => <App />);

    expect(createHotkeysMock.mock.calls.length).toBeGreaterThanOrEqual(1);

    const [definitions, getOptions] = getCreateHotkeysCall();

    expect(definitions.map((definition) => definition.hotkey)).toEqual(["Mod+K", "Mod+Space"]);
    expect(getOptions()).toEqual({
      enabled: true,
      ignoreInputs: false
    });
  });

  it("disables the shortcut while the switcher is open or focused", () => {
    render(() => <App />);

    const [, getOptions] = getCreateHotkeysCall();

    harnessStore.openProjectSwitcher();
    expect(getOptions().enabled).toBe(false);

    harnessStore.closeProjectSwitcher();
    const input = document.createElement("input");
    input.dataset.projectSwitcherInput = "true";
    document.body.append(input);
    input.focus();

    expect(getOptions().enabled).toBe(false);
  });

  it("renders surface tabs with active and inactive tab styling classes", () => {
    const screen = render(() => <App />);

    const nav = document.querySelector("[data-test-center-surface-nav]");
    const buttons = [...(nav?.querySelectorAll("button") ?? [])] as HTMLButtonElement[];

    expect(buttons[0]?.getAttribute("aria-label")).toBe("Project chat");
    expect(buttons[1]?.getAttribute("aria-label")).toBe("Assistants");
    expect(buttons[0]?.getAttribute("aria-pressed")).toBe("true");
    expect(buttons[1]?.getAttribute("aria-pressed")).toBe("false");
  });

  it("moves active tab styling when switching surfaces", async () => {
    render(() => <App />);
    const nav = document.querySelector("[data-test-center-surface-nav]");
    const buttons = [...(nav?.querySelectorAll("button") ?? [])] as HTMLButtonElement[];
    const assistantsTab = buttons[1];

    expect(assistantsTab?.getAttribute("aria-pressed")).toBe("false");

    if (assistantsTab) {
      fireEvent.click(assistantsTab);
    }

    expect(harnessStore.state.activeSurface).toBe("assistants");
  });
});
