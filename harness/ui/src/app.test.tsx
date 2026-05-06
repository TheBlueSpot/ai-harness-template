/** @jsxImportSource solid-js */
import { beforeEach, expect, it, mock } from "bun:test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createUiTest } from "./utils/tests/test-harness";
import { clearBrowserStateForTests } from "./utils/tests/store-test-utils";
import { harnessStore, readBrowserUiSession } from "./harness-store";

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
      definitions.some((definition) => definition.hotkey === "Mod+Space") &&
      definitions.some((definition) => definition.hotkey === "Mod+,")
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

  it("registers app shortcuts through TanStack Hotkeys", () => {
    render(() => <App />);

    expect(createHotkeysMock.mock.calls.length).toBeGreaterThanOrEqual(1);

    const [definitions, getOptions] = getCreateHotkeysCall();

    expect(definitions.map((definition) => definition.hotkey)).toEqual(["Mod+K", "Mod+Space", "Mod+,"]);
    expect(getOptions()).toEqual({
      enabled: true,
      ignoreInputs: false
    });
  });

  it("opens preferences from the shortcut callback", () => {
    render(() => <App />);

    const [definitions] = getCreateHotkeysCall();
    const preferencesShortcut = definitions.find((definition) => definition.hotkey === "Mod+,");

    expect(harnessStore.state.preferencesModalOpen).toBe(false);

    preferencesShortcut?.callback();

    expect(harnessStore.state.preferencesModalOpen).toBe(true);
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

  it("renders left tabs with active and inactive tab styling classes", () => {
    render(() => <App />);

    const nav = document.querySelector("[data-test-left-tab-nav]");
    const buttons = [...(nav?.querySelectorAll("button") ?? [])] as HTMLButtonElement[];

    expect(buttons[0]?.getAttribute("aria-label")).toBe("Projects");
    expect(buttons[1]?.getAttribute("aria-label")).toBe("Assistants");
    expect(buttons[2]?.getAttribute("aria-label")).toBe("Jobs");
    expect(buttons[3]?.getAttribute("aria-label")).toBe("Runs");
    expect(buttons[0]?.getAttribute("aria-pressed")).toBe("true");
    expect(buttons[1]?.getAttribute("aria-pressed")).toBe("false");
  });

  it("keeps workspace grid columns shrinkable when project threads have long content", () => {
    render(() => <App />);

    const grid = document.querySelector("[data-test-main-panel-grid]");

    expect(grid?.className).toContain(
      "lg:grid-cols-[minmax(0,var(--left-panel-size))_0.35rem_minmax(0,var(--center-panel-size))_0.35rem_minmax(12rem,var(--right-panel-size))]"
    );
  });

  it("persists main panel sizes in browser session state", () => {
    render(() => <App />);

    harnessStore.setMainPanelSizes({ left: 2, center: 4, right: 1.5 });

    expect(readBrowserUiSession().mainPanelSizes).toEqual({ left: 2, center: 4, right: 1.5 });
  });

  it("moves active tab styling when switching left tabs", async () => {
    render(() => <App />);
    const nav = document.querySelector("[data-test-left-tab-nav]");
    const buttons = [...(nav?.querySelectorAll("button") ?? [])] as HTMLButtonElement[];
    const assistantsTab = buttons[1];
    const runsTab = buttons[3];

    expect(assistantsTab?.getAttribute("aria-pressed")).toBe("false");

    if (assistantsTab) {
      fireEvent.click(assistantsTab);
    }

    expect(harnessStore.state.activeLeftTab).toBe("assistants");
    expect(harnessStore.state.activeSurface).toBe("assistants");
    expect(readBrowserUiSession().activeLeftTab).toBe("assistants");

    if (runsTab) {
      fireEvent.click(runsTab);
    }

    expect(harnessStore.state.activeLeftTab).toBe("runs");
    expect(harnessStore.state.activeSurface).toBe("background-jobs");
    expect(readBrowserUiSession().activeLeftTab).toBe("runs");
  });
});
