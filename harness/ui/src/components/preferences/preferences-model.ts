import type { Component } from "solid-js";
import { Bell, Bot, BriefcaseBusiness, Code2, Keyboard, MonitorCog, Palette, ShieldCheck } from "lucide-solid";

export type PreferencesSectionId =
  | "general-ui"
  | "keybinds"
  | "ide-settings"
  | "ai-providers"
  | "safety-guardrails"
  | "workspace-memory"
  | "background-jobs"
  | "developer-advanced";

export type PreferencesSettingId =
  | "appearance-density"
  | "navigation-sidebar"
  | "keyboard-shortcuts"
  | "ide-editor-settings"
  | "notifications"
  | "provider-keys"
  | "provider-brand"
  | "composer-defaults"
  | "plan-gate"
  | "worktree-git"
  | "run-safety"
  | "workspace-context"
  | "memory-bank"
  | "auto-archive"
  | "job-defaults"
  | "assistant-job-controls"
  | "jobs-view"
  | "logging-trace"
  | "portable-json"
  | "advanced-reset";

export type PreferencesSectionMeta = {
  id: PreferencesSectionId;
  label: string;
  description: string;
  icon: Component<{ class?: string }>;
};

export type PreferencesSettingMeta = {
  id: PreferencesSettingId;
  sectionId: PreferencesSectionId;
  title: string;
  description: string;
  keywords: string[];
};

export const preferencesSections: PreferencesSectionMeta[] = [
  {
    id: "general-ui",
    label: "General & UI",
    description: "Layout, navigation, notifications, density.",
    icon: Palette
  },
  {
    id: "keybinds",
    label: "Keybinds",
    description: "App and IDE keyboard shortcuts.",
    icon: Keyboard
  },
  {
    id: "ide-settings",
    label: "IDE Settings",
    description: "IDE behavior and formatting defaults.",
    icon: MonitorCog
  },
  {
    id: "ai-providers",
    label: "AI & Providers",
    description: "Provider keys and composer defaults.",
    icon: Bot
  },
  {
    id: "safety-guardrails",
    label: "Safety & Guardrails",
    description: "Plan gates, worktrees, git, run safety.",
    icon: ShieldCheck
  },
  {
    id: "workspace-memory",
    label: "Workspace & Memory",
    description: "Workspace rules, memory, archive defaults.",
    icon: BriefcaseBusiness
  },
  {
    id: "background-jobs",
    label: "Background Jobs",
    description: "Job approvals, notifications, view defaults.",
    icon: Bell
  },
  {
    id: "developer-advanced",
    label: "Developer & Advanced",
    description: "Logging, trace UI, import/export, reset controls.",
    icon: Code2
  }
];

export const preferencesSettings: PreferencesSettingMeta[] = [
  {
    id: "appearance-density",
    sectionId: "general-ui",
    title: "Appearance and density",
    description: "Warm cream palette and compact workspace density.",
    keywords: ["theme", "cream", "density", "appearance"]
  },
  {
    id: "navigation-sidebar",
    sectionId: "general-ui",
    title: "Navigation and sidebar layout",
    description: "Restore panel widths and tune project sidebar sorting.",
    keywords: ["navigation", "sidebar", "layout", "sort", "grouping", "panel"]
  },
  {
    id: "keyboard-shortcuts",
    sectionId: "keybinds",
    title: "Keyboard shortcuts",
    description: "Configure app and IDE hotkeys.",
    keywords: ["hotkeys", "keyboard", "shortcuts", "command", "keys", "ide"]
  },
  {
    id: "ide-editor-settings",
    sectionId: "ide-settings",
    title: "IDE settings",
    description: "Autosave, wrapping, indentation, formatting, breadcrumbs, and bracket pair colorization.",
    keywords: ["ide", "editor", "autosave", "word wrap", "tabs", "spaces", "format", "breadcrumbs", "bracket"]
  },
  {
    id: "notifications",
    sectionId: "general-ui",
    title: "Notifications",
    description: "Desktop notifications and CLI update checks.",
    keywords: ["desktop", "notification", "alerts", "background", "cli", "updates"]
  },
  {
    id: "provider-keys",
    sectionId: "ai-providers",
    title: "Provider API keys",
    description: "OpenAI, Google, and Anthropic credentials.",
    keywords: ["openai", "google", "gemini", "anthropic", "claude", "api", "key", "test"]
  },
  {
    id: "provider-brand",
    sectionId: "ai-providers",
    title: "Active provider",
    description: "Default provider brand for Pi runs.",
    keywords: ["provider", "brand", "gpt", "gemini", "claude"]
  },
  {
    id: "composer-defaults",
    sectionId: "ai-providers",
    title: "Composer defaults",
    description: "Reasoning effort and fast mode for new composer sends.",
    keywords: ["composer", "reasoning", "effort", "fast", "model"]
  },
  {
    id: "plan-gate",
    sectionId: "safety-guardrails",
    title: "Planning and approval",
    description: "Plan gate mode and countdown delay.",
    keywords: ["plan", "approval", "countdown", "delay", "immediate"]
  },
  {
    id: "worktree-git",
    sectionId: "safety-guardrails",
    title: "Worktree and git safety",
    description: "Subagent worktree defaults and dirty git guard.",
    keywords: ["worktree", "branchfs", "git", "dirty", "guard", "subagent"]
  },
  {
    id: "run-safety",
    sectionId: "safety-guardrails",
    title: "Run safety",
    description: "Auto-compaction, execution model preference, and correctness iteration controls.",
    keywords: ["context", "compaction", "correctness", "loop", "run", "inference", "intelligence", "subagents", "model"]
  },
  {
    id: "workspace-context",
    sectionId: "workspace-memory",
    title: "Workspace rules and context",
    description: "Shared workspace rules and memory text.",
    keywords: ["workspace", "rules", "context", "memory"]
  },
  {
    id: "memory-bank",
    sectionId: "workspace-memory",
    title: "Memory bank settings",
    description: "Memory bank injection and run memory recording.",
    keywords: ["memory", "bank", "record", "runs"]
  },
  {
    id: "auto-archive",
    sectionId: "workspace-memory",
    title: "Auto-archive",
    description: "Default archive behavior for completed threads.",
    keywords: ["archive", "completed", "threads"]
  },
  {
    id: "job-defaults",
    sectionId: "background-jobs",
    title: "Background job defaults",
    description: "Approval, notification, and congestion defaults.",
    keywords: ["jobs", "background", "approval", "notifications", "congestion", "capacity"]
  },
  {
    id: "assistant-job-controls",
    sectionId: "background-jobs",
    title: "Assistant job controls",
    description: "Pause enabled assistant-owned background jobs.",
    keywords: ["jobs", "background", "assistant", "pause", "paused", "global pause"]
  },
  {
    id: "jobs-view",
    sectionId: "background-jobs",
    title: "Jobs view and sync state",
    description: "Current jobs pane filters and sorting summary.",
    keywords: ["jobs", "view", "sync", "sort", "filter"]
  },
  {
    id: "logging-trace",
    sectionId: "developer-advanced",
    title: "Logging and trace UI",
    description: "Verbose logging and trace panel default state.",
    keywords: ["debug", "logging", "trace", "developer"]
  },
  {
    id: "portable-json",
    sectionId: "developer-advanced",
    title: "Import and export JSON",
    description: "Portable preference JSON without API keys.",
    keywords: ["import", "export", "json", "portable"]
  },
  {
    id: "advanced-reset",
    sectionId: "developer-advanced",
    title: "Advanced reset controls",
    description: "Local reset and partial state controls.",
    keywords: ["reset", "advanced", "local", "tutorial"]
  }
];

export function getPreferencesSection(sectionId: PreferencesSectionId) {
  return preferencesSections.find((section) => section.id === sectionId) ?? preferencesSections[0];
}

export function getPreferencesSetting(settingId: PreferencesSettingId) {
  return preferencesSettings.find((setting) => setting.id === settingId);
}
