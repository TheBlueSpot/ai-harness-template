/** @jsxImportSource solid-js */
import { beforeEach, expect, it, mock } from "bun:test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createUiTest } from "./utils/tests/test-harness";
import { clearBrowserStateForTests } from "./utils/tests/store-test-utils";
import { harnessStore, readBrowserUiSession } from "./harness-store";
import { clearCurrentTabItemSelectorsForTests, registerCurrentTabItemSelector } from "./lib/current-tab-item-hotkeys";

const createHotkeysMock = mock(() => undefined);

mock.module("@tanstack/solid-hotkeys", () => ({
  createHotkeys: createHotkeysMock,
  formatForDisplay: (hotkey: string) => hotkey
}));

mock.module("./harness-websocket", () => ({
  connectHarnessWebSocket: () => ({
    sendCommand: () => undefined,
    dispose: () => undefined
  })
}));

import { App, shouldCollapseTabStrip } from "./app";

function getCreateHotkeysCall() {
  const calls = createHotkeysMock.mock.calls as unknown as Array<
    [
      Array<{ hotkey: string; callback: () => void }> | (() => Array<{ hotkey: string; callback: () => void }>),
      () => { enabled: boolean; ignoreInputs: boolean }
    ]
  >;
  const call = calls.find(([hotkeys]) => {
    const definitions = typeof hotkeys === "function" ? hotkeys() : hotkeys;
    return definitions.length > 1 && definitions.every((definition) => typeof definition.hotkey === "string");
  });
  if (!call) {
    throw new Error("Expected createHotkeys to be called");
  }

  const [hotkeys, getOptions] = call;
  const definitions = typeof hotkeys === "function" ? hotkeys() : hotkeys;
  return [definitions, getOptions] as [
    Array<{ hotkey: string; callback: () => void }>,
    () => { enabled: boolean; ignoreInputs: boolean }
  ];
}

createUiTest("App shortcuts", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
    clearCurrentTabItemSelectorsForTests();
    harnessStore.setActiveSurface("chat");
    createHotkeysMock.mockClear();
  });

  it("registers app shortcuts through TanStack Hotkeys", () => {
    render(() => <App />);

    expect(createHotkeysMock.mock.calls.length).toBeGreaterThanOrEqual(1);

    const [definitions, getOptions] = getCreateHotkeysCall();

    expect(definitions.map((definition) => definition.hotkey)).toEqual([
      "Mod+K",
      "Mod+Space",
      "Mod+1",
      "Mod+2",
      "Mod+3",
      "Mod+4",
      "Mod+5",
      "Mod+,",
      "Mod+N",
      "Mod+Shift+A",
      "Mod+Shift+J",
      "Mod+Shift+1",
      "Mod+Shift+2",
      "Mod+Shift+3",
      "Mod+Shift+4",
      "Mod+Shift+5",
      "Mod+Shift+6",
      "Mod+Shift+7",
      "Mod+Shift+8",
      "Mod+Shift+9"
    ]);
    expect(getOptions()).toEqual({
      enabled: true,
      ignoreInputs: false
    });
  });

  it("opens preferences from the shortcut callback", () => {
    render(() => <App />);

    const [definitions] = getCreateHotkeysCall();
    const preferencesShortcut = definitions.find((definition) => definition.hotkey === "Mod+5");

    expect(harnessStore.state.activeLeftTab).toBe("projects");

    preferencesShortcut?.callback();

    expect(harnessStore.state.activeLeftTab).toBe("preferences");
    expect(harnessStore.state.activeSurface).toBe("preferences");
  });

  it("selects the nth current-tab item from number shortcuts", () => {
    const selected: number[] = [];
    registerCurrentTabItemSelector("projects", (index) => {
      selected.push(index);
      return true;
    });
    render(() => <App />);

    const [definitions] = getCreateHotkeysCall();
    definitions.find((definition) => definition.hotkey === "Mod+Shift+3")?.callback();

    expect(selected).toEqual([2]);
  });

  it("opens side panels from number shortcuts", () => {
    render(() => <App />);

    const [definitions] = getCreateHotkeysCall();
    definitions.find((definition) => definition.hotkey === "Mod+2")?.callback();
    expect(harnessStore.state.activeLeftTab).toBe("assistants");

    definitions.find((definition) => definition.hotkey === "Mod+4")?.callback();
    expect(harnessStore.state.activeLeftTab).toBe("runs");
  });

  it("opens create dialogs from assistant and job shortcuts", () => {
    render(() => <App />);

    const [definitions] = getCreateHotkeysCall();
    definitions.find((definition) => definition.hotkey === "Mod+Shift+A")?.callback();
    expect(harnessStore.state.assistantEditorOpen).toBe(true);
    expect(harnessStore.state.activeLeftTab).toBe("assistants");

    definitions.find((definition) => definition.hotkey === "Mod+Shift+J")?.callback();
    expect(harnessStore.state.backgroundJobEditorOpen).toBe(true);
    expect(harnessStore.state.backgroundJobEditorDraft?.kind).toBe("ai-routine");
    expect(harnessStore.state.activeLeftTab).toBe("jobs");
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

  it("registers configured app shortcuts from local preferences", async () => {
    window.localStorage.setItem(
      "pi-harness:app-hotkeys:v1",
      JSON.stringify({
        openProjectSwitcher: "Alt+P",
        openProjectSwitcherAlternate: "Alt+Shift+P",
        openPreferences: "Alt+,",
        selectCurrentItem3: "Alt+3"
      })
    );
    harnessStore.hydrateLocalPreferences();

    render(() => <App />);

    const [definitions] = getCreateHotkeysCall();

    expect(definitions.map((definition) => definition.hotkey)).toContain("Alt+P");
    expect(definitions.map((definition) => definition.hotkey)).toContain("Alt+Shift+P");
    expect(definitions.map((definition) => definition.hotkey)).toContain("Alt+,");
    expect(definitions.map((definition) => definition.hotkey)).toContain("Alt+3");
  });

  it("disables app shortcuts while editable controls own focus", () => {
    render(() => <App />);

    const [, getOptions] = getCreateHotkeysCall();
    const textarea = document.createElement("textarea");
    document.body.append(textarea);
    textarea.focus();

    expect(getOptions().enabled).toBe(false);

    textarea.remove();
    const textbox = document.createElement("div");
    textbox.setAttribute("role", "textbox");
    textbox.tabIndex = 0;
    document.body.append(textbox);
    textbox.focus();

    expect(getOptions().enabled).toBe(false);
  });

  it("keeps search shortcut enabled while editable controls own focus", () => {
    render(() => <App />);
    const calls = createHotkeysMock.mock.calls as unknown as Array<
      [
        Array<{ hotkey: string; callback: () => void }> | (() => Array<{ hotkey: string; callback: () => void }>),
        () => { enabled: boolean; ignoreInputs: boolean }
      ]
    >;
    const searchCall = calls.find(([hotkeys]) => {
      const definitions = typeof hotkeys === "function" ? hotkeys() : hotkeys;
      return definitions.some((definition) => definition.hotkey === "Mod+F");
    });
    if (!searchCall) {
      throw new Error("Expected search hotkey registration");
    }

    const textarea = document.createElement("textarea");
    document.body.append(textarea);
    textarea.focus();

    expect(searchCall[1]().enabled).toBe(true);
  });

  it("renders left tabs with aria-owned active styling state", () => {
    render(() => <App />);

    const nav = document.querySelector("[data-test-left-tab-nav]");
    const buttons = [...(nav?.querySelectorAll("button") ?? [])] as HTMLButtonElement[];

    expect(buttons[0]?.getAttribute("aria-label")).toBe("Projects");
    expect(buttons[1]?.getAttribute("aria-label")).toBe("Assistants");
    expect(buttons[2]?.getAttribute("aria-label")).toBe("Jobs");
    expect(buttons[3]?.getAttribute("aria-label")).toBe("Runs");
    expect(buttons[4]?.getAttribute("aria-label")).toBe("Settings");
    expect(buttons[0]?.getAttribute("aria-pressed")).toBe("true");
    expect(buttons[1]?.getAttribute("aria-pressed")).toBe("false");
    expect(buttons[0]?.className).toBe("surface-tab");
  });

  it("renders settings in the shared left pane shell", () => {
    harnessStore.setActiveLeftTab("preferences");
    const { container } = render(() => <App />);

    const shell = container.querySelector("[data-test-left-pane-shell][data-left-pane-kind='preferences']");
    expect(shell).not.toBeNull();
    expect(shell?.className).toContain("panel-shell");
    expect(shell?.className).toContain("border-t-0");
  });

  it("collapses left tab labels when tabs wrap", () => {
    const nav = document.createElement("nav");
    const tabItems = Array.from({ length: 5 }, () => {
      const tabItem = document.createElement("span");
      nav.append(tabItem);
      return tabItem;
    });

    Object.defineProperty(nav, "scrollWidth", { configurable: true, value: 320 });
    Object.defineProperty(nav, "clientWidth", { configurable: true, value: 320 });
    tabItems.forEach((tabItem, index) => {
      tabItem.getBoundingClientRect = () =>
        ({
          top: index >= 3 ? 28 : 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: 0,
          height: 0,
          x: 0,
          y: index >= 3 ? 28 : 0,
          toJSON: () => undefined
        }) as DOMRect;
    });

    expect(shouldCollapseTabStrip(nav)).toBe(true);
  });

  it("keeps workspace grid columns shrinkable when project threads have long content", () => {
    render(() => <App />);

    const grid = document.querySelector("[data-test-main-panel-grid]");

    expect(grid?.className).toContain(
      "lg:grid-cols-[minmax(0,var(--left-panel-size))_0.35rem_minmax(0,var(--center-panel-size))_0.35rem_minmax(0,var(--right-panel-size))]"
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

  it("shows current surface context in the mobile header", () => {
    harnessStore.setActiveLeftTab("runs");

    render(() => <App />);

    const label = document.querySelector("[data-test-mobile-surface-label]");
    expect(label?.textContent).toContain("Runs");
  });
});
