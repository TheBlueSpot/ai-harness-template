import type { HarnessLeftTab } from "../harness-store";

export const currentTabItemHotkeyIds = [
  "selectCurrentItem1",
  "selectCurrentItem2",
  "selectCurrentItem3",
  "selectCurrentItem4",
  "selectCurrentItem5",
  "selectCurrentItem6",
  "selectCurrentItem7",
  "selectCurrentItem8",
  "selectCurrentItem9"
] as const;

type CurrentTabItemHotkeyId = (typeof currentTabItemHotkeyIds)[number];

export type AppHotkeyId =
  | "openProjectSwitcher"
  | "openProjects"
  | "openAssistants"
  | "openJobs"
  | "openRuns"
  | "openPreferences"
  | "openIde"
  | "toggleTerminalDrawer"
  | "toggleTracePanel"
  | "createProjectChat"
  | "createAssistant"
  | "createBackgroundJob"
  | "focusCurrentSearch"
  | "ideCommandPalette"
  | "ideQuickOpen"
  | "ideFindInFile"
  | "ideFindInFiles"
  | "ideToggleTerminal"
  | "ideExplorer"
  | "ideSourceControl"
  | "ideSave"
  | "ideCloseEditor"
  | "ideToggleSidebar"
  | "ideCloseAllEditors"
  | "ideToggleWordWrap"
  | CurrentTabItemHotkeyId;

export type AppHotkeyPreferences = Record<AppHotkeyId, string[]>;

export const DEFAULT_APP_HOTKEY_PREFERENCES: AppHotkeyPreferences = {
  openProjectSwitcher: ["Mod+K", "Mod+Space"],
  openProjects: ["Mod+1"],
  openAssistants: ["Mod+2"],
  openJobs: ["Mod+3"],
  openRuns: ["Mod+4"],
  openPreferences: ["Mod+5", "Mod+,"],
  openIde: ["Mod+I"],
  toggleTerminalDrawer: ["Mod+`"],
  toggleTracePanel: ["Mod+T"],
  createProjectChat: ["Mod+N"],
  createAssistant: ["Mod+Shift+A"],
  createBackgroundJob: ["Mod+Shift+J"],
  focusCurrentSearch: ["Mod+F"],
  ideCommandPalette: ["Mod+Shift+P"],
  ideQuickOpen: ["Mod+P"],
  ideFindInFile: ["Mod+F"],
  ideFindInFiles: ["Mod+Shift+F"],
  ideToggleTerminal: ["Mod+`"],
  ideExplorer: ["Mod+Shift+E"],
  ideSourceControl: ["Mod+Shift+G"],
  ideSave: ["Mod+S"],
  ideCloseEditor: ["Mod+W", "Alt+W"],
  ideToggleSidebar: ["Mod+B"],
  ideCloseAllEditors: ["Mod+Shift+W", "Alt+Shift+W"],
  ideToggleWordWrap: ["Alt+Z"],
  selectCurrentItem1: ["Mod+Shift+1"],
  selectCurrentItem2: ["Mod+Shift+2"],
  selectCurrentItem3: ["Mod+Shift+3"],
  selectCurrentItem4: ["Mod+Shift+4"],
  selectCurrentItem5: ["Mod+Shift+5"],
  selectCurrentItem6: ["Mod+Shift+6"],
  selectCurrentItem7: ["Mod+Shift+7"],
  selectCurrentItem8: ["Mod+Shift+8"],
  selectCurrentItem9: ["Mod+Shift+9"]
};

export const appHotkeySettings: Array<{
  id: AppHotkeyId;
  label: string;
  description: string;
  tab?: HarnessLeftTab;
  scope?: "app" | "ide";
}> = [
  {
    id: "openProjectSwitcher",
    label: "Project switcher",
    description: "Open projects and active threads."
  },
  {
    id: "openProjects",
    label: "Projects",
    description: "Open the projects sidepanel.",
    tab: "projects"
  },
  {
    id: "openAssistants",
    label: "Assistants",
    description: "Open the assistants sidepanel.",
    tab: "assistants"
  },
  {
    id: "openJobs",
    label: "Jobs",
    description: "Open the jobs sidepanel.",
    tab: "jobs"
  },
  {
    id: "openRuns",
    label: "Runs",
    description: "Open the runs sidepanel.",
    tab: "runs"
  },
  {
    id: "openPreferences",
    label: "Workspace preferences",
    description: "Open the preferences sidepanel.",
    tab: "preferences"
  },
  {
    id: "openIde",
    label: "IDE",
    description: "Open the IDE workbench."
  },
  {
    id: "toggleTerminalDrawer",
    label: "Integrated terminal",
    description: "Toggle the bottom terminal drawer."
  },
  {
    id: "toggleTracePanel",
    label: "Trace panel",
    description: "Cycle the trace panel closed, peek, and open."
  },
  {
    id: "createProjectChat",
    label: "New project chat",
    description: "Create a new chat in the active project."
  },
  {
    id: "createAssistant",
    label: "New assistant",
    description: "Create a new assistant."
  },
  {
    id: "createBackgroundJob",
    label: "New AI job",
    description: "Create a scheduled AI job."
  },
  {
    id: "focusCurrentSearch",
    label: "Focus search",
    description: "Focus search for the current sidepanel."
  },
  {
    id: "ideCommandPalette",
    label: "Command palette",
    description: "Open editor commands.",
    scope: "ide"
  },
  {
    id: "ideQuickOpen",
    label: "Quick open",
    description: "Open quick commands.",
    scope: "ide"
  },
  {
    id: "ideFindInFile",
    label: "Find in file",
    description: "Search the current editor.",
    scope: "ide"
  },
  {
    id: "ideFindInFiles",
    label: "Find in files",
    description: "Open the global search panel.",
    scope: "ide"
  },
  {
    id: "ideToggleTerminal",
    label: "Terminal",
    description: "Toggle the integrated terminal from the editor.",
    scope: "ide"
  },
  {
    id: "ideExplorer",
    label: "Explorer",
    description: "Open the file explorer.",
    scope: "ide"
  },
  {
    id: "ideSourceControl",
    label: "Source control",
    description: "Open source control.",
    scope: "ide"
  },
  {
    id: "ideSave",
    label: "Save",
    description: "Save the current editor.",
    scope: "ide"
  },
  {
    id: "ideCloseEditor",
    label: "Close tab",
    description: "Close the current editor tab.",
    scope: "ide"
  },
  {
    id: "ideToggleSidebar",
    label: "Toggle sidebar",
    description: "Collapse or restore the sidebar.",
    scope: "ide"
  },
  {
    id: "ideCloseAllEditors",
    label: "Close all tabs",
    description: "Close every open editor tab.",
    scope: "ide"
  },
  {
    id: "ideToggleWordWrap",
    label: "Word wrap",
    description: "Toggle editor word wrap.",
    scope: "ide"
  },
  ...currentTabItemHotkeyIds.map((id, index) => ({
    id,
    label: `Select current tab item ${index + 1}`,
    description: `Select the ${index + 1}${ordinalSuffix(index + 1)} item in the current sidepanel.`
  }))
];

function ordinalSuffix(value: number) {
  if (value === 1) {
    return "st";
  }
  if (value === 2) {
    return "nd";
  }
  if (value === 3) {
    return "rd";
  }
  return "th";
}

const modifierNames = new Set(["mod", "control", "ctrl", "shift", "alt", "option", "meta", "cmd", "command"]);

export function isValidAppHotkey(value: string) {
  const parts = value
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  const key = parts.at(-1);

  return Boolean(key && !modifierNames.has(key.toLowerCase()));
}

export function normalizeAppHotkey(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("+");

  return isValidAppHotkey(normalized) ? normalized : fallback;
}

export function normalizeAppHotkeys(value: unknown, fallback: string[]) {
  if (!Array.isArray(value) && typeof value !== "string") {
    return [...fallback];
  }

  const values = Array.isArray(value) ? value : [value];
  const normalized = values
    .map((entry) => normalizeAppHotkey(entry, ""))
    .filter((entry) => entry && isValidAppHotkey(entry));

  return [...new Set(normalized)];
}

export function normalizeAppHotkeyPreferences(input: unknown): AppHotkeyPreferences {
  const parsed = input && typeof input === "object"
    ? (input as Partial<Record<AppHotkeyId | "openProjectSwitcherAlternate", unknown>>)
    : {};
  const hasProjectSwitcherPreference =
    Object.prototype.hasOwnProperty.call(parsed, "openProjectSwitcher") ||
    Object.prototype.hasOwnProperty.call(parsed, "openProjectSwitcherAlternate");

  return {
    openProjectSwitcher: normalizeAppHotkeys(
      hasProjectSwitcherPreference ? [parsed.openProjectSwitcher, parsed.openProjectSwitcherAlternate].flat() : undefined,
      DEFAULT_APP_HOTKEY_PREFERENCES.openProjectSwitcher
    ),
    openProjects: normalizeAppHotkeys(parsed.openProjects, DEFAULT_APP_HOTKEY_PREFERENCES.openProjects),
    openAssistants: normalizeAppHotkeys(parsed.openAssistants, DEFAULT_APP_HOTKEY_PREFERENCES.openAssistants),
    openJobs: normalizeAppHotkeys(parsed.openJobs, DEFAULT_APP_HOTKEY_PREFERENCES.openJobs),
    openRuns: normalizeAppHotkeys(parsed.openRuns, DEFAULT_APP_HOTKEY_PREFERENCES.openRuns),
    openPreferences: normalizeAppHotkeys(parsed.openPreferences, DEFAULT_APP_HOTKEY_PREFERENCES.openPreferences),
    openIde: normalizeAppHotkeys(parsed.openIde, DEFAULT_APP_HOTKEY_PREFERENCES.openIde),
    toggleTerminalDrawer: normalizeAppHotkeys(parsed.toggleTerminalDrawer, DEFAULT_APP_HOTKEY_PREFERENCES.toggleTerminalDrawer),
    toggleTracePanel: normalizeAppHotkeys(parsed.toggleTracePanel, DEFAULT_APP_HOTKEY_PREFERENCES.toggleTracePanel),
    createProjectChat: normalizeAppHotkeys(parsed.createProjectChat, DEFAULT_APP_HOTKEY_PREFERENCES.createProjectChat),
    createAssistant: normalizeAppHotkeys(parsed.createAssistant, DEFAULT_APP_HOTKEY_PREFERENCES.createAssistant),
    createBackgroundJob: normalizeAppHotkeys(parsed.createBackgroundJob, DEFAULT_APP_HOTKEY_PREFERENCES.createBackgroundJob),
    focusCurrentSearch: normalizeAppHotkeys(parsed.focusCurrentSearch, DEFAULT_APP_HOTKEY_PREFERENCES.focusCurrentSearch),
    ideCommandPalette: normalizeAppHotkeys(parsed.ideCommandPalette, DEFAULT_APP_HOTKEY_PREFERENCES.ideCommandPalette),
    ideQuickOpen: normalizeAppHotkeys(parsed.ideQuickOpen, DEFAULT_APP_HOTKEY_PREFERENCES.ideQuickOpen),
    ideFindInFile: normalizeAppHotkeys(parsed.ideFindInFile, DEFAULT_APP_HOTKEY_PREFERENCES.ideFindInFile),
    ideFindInFiles: normalizeAppHotkeys(parsed.ideFindInFiles, DEFAULT_APP_HOTKEY_PREFERENCES.ideFindInFiles),
    ideToggleTerminal: normalizeAppHotkeys(parsed.ideToggleTerminal, DEFAULT_APP_HOTKEY_PREFERENCES.ideToggleTerminal),
    ideExplorer: normalizeAppHotkeys(parsed.ideExplorer, DEFAULT_APP_HOTKEY_PREFERENCES.ideExplorer),
    ideSourceControl: normalizeAppHotkeys(parsed.ideSourceControl, DEFAULT_APP_HOTKEY_PREFERENCES.ideSourceControl),
    ideSave: normalizeAppHotkeys(parsed.ideSave, DEFAULT_APP_HOTKEY_PREFERENCES.ideSave),
    ideCloseEditor: normalizeAppHotkeys(parsed.ideCloseEditor, DEFAULT_APP_HOTKEY_PREFERENCES.ideCloseEditor),
    ideToggleSidebar: normalizeAppHotkeys(parsed.ideToggleSidebar, DEFAULT_APP_HOTKEY_PREFERENCES.ideToggleSidebar),
    ideCloseAllEditors: normalizeAppHotkeys(parsed.ideCloseAllEditors, DEFAULT_APP_HOTKEY_PREFERENCES.ideCloseAllEditors),
    ideToggleWordWrap: normalizeAppHotkeys(parsed.ideToggleWordWrap, DEFAULT_APP_HOTKEY_PREFERENCES.ideToggleWordWrap),
    selectCurrentItem1: normalizeAppHotkeys(parsed.selectCurrentItem1, DEFAULT_APP_HOTKEY_PREFERENCES.selectCurrentItem1),
    selectCurrentItem2: normalizeAppHotkeys(parsed.selectCurrentItem2, DEFAULT_APP_HOTKEY_PREFERENCES.selectCurrentItem2),
    selectCurrentItem3: normalizeAppHotkeys(parsed.selectCurrentItem3, DEFAULT_APP_HOTKEY_PREFERENCES.selectCurrentItem3),
    selectCurrentItem4: normalizeAppHotkeys(parsed.selectCurrentItem4, DEFAULT_APP_HOTKEY_PREFERENCES.selectCurrentItem4),
    selectCurrentItem5: normalizeAppHotkeys(parsed.selectCurrentItem5, DEFAULT_APP_HOTKEY_PREFERENCES.selectCurrentItem5),
    selectCurrentItem6: normalizeAppHotkeys(parsed.selectCurrentItem6, DEFAULT_APP_HOTKEY_PREFERENCES.selectCurrentItem6),
    selectCurrentItem7: normalizeAppHotkeys(parsed.selectCurrentItem7, DEFAULT_APP_HOTKEY_PREFERENCES.selectCurrentItem7),
    selectCurrentItem8: normalizeAppHotkeys(parsed.selectCurrentItem8, DEFAULT_APP_HOTKEY_PREFERENCES.selectCurrentItem8),
    selectCurrentItem9: normalizeAppHotkeys(parsed.selectCurrentItem9, DEFAULT_APP_HOTKEY_PREFERENCES.selectCurrentItem9)
  };
}
