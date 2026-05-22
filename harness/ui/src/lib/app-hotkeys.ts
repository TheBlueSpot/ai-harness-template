import type { HarnessLeftTab } from "../harness-store";

export type AppHotkeyId =
  | "openProjectSwitcher"
  | "openProjects"
  | "openAssistants"
  | "openJobs"
  | "openRuns"
  | "openPreferences"
  | "createProjectChat"
  | "createAssistant"
  | "createBackgroundJob"
  | "focusCurrentSearch";

export type AppHotkeyPreferences = Record<AppHotkeyId, string[]>;

export const DEFAULT_APP_HOTKEY_PREFERENCES: AppHotkeyPreferences = {
  openProjectSwitcher: ["Mod+K", "Mod+Space"],
  openProjects: ["Mod+1"],
  openAssistants: ["Mod+2"],
  openJobs: ["Mod+3"],
  openRuns: ["Mod+4"],
  openPreferences: ["Mod+5", "Mod+,"],
  createProjectChat: ["Mod+N"],
  createAssistant: ["Mod+Shift+A"],
  createBackgroundJob: ["Mod+Shift+J"],
  focusCurrentSearch: ["Mod+F"]
};

export const appHotkeySettings: Array<{
  id: AppHotkeyId;
  label: string;
  description: string;
  tab?: HarnessLeftTab;
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
  }
];

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
    createProjectChat: normalizeAppHotkeys(parsed.createProjectChat, DEFAULT_APP_HOTKEY_PREFERENCES.createProjectChat),
    createAssistant: normalizeAppHotkeys(parsed.createAssistant, DEFAULT_APP_HOTKEY_PREFERENCES.createAssistant),
    createBackgroundJob: normalizeAppHotkeys(parsed.createBackgroundJob, DEFAULT_APP_HOTKEY_PREFERENCES.createBackgroundJob),
    focusCurrentSearch: normalizeAppHotkeys(parsed.focusCurrentSearch, DEFAULT_APP_HOTKEY_PREFERENCES.focusCurrentSearch)
  };
}
