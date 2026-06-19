/** @jsxImportSource solid-js */
import { createMemo, createSignal, For, onCleanup, onMount, Show, type JSX } from "solid-js";
import { render as renderSolidRoot } from "solid-js/web";
import { formatForDisplay } from "@tanstack/solid-hotkeys";
import { createRequestId, type ComposerReasoningStrength, type ProviderBrand, type RunModelPreference } from "../../../shared/protocol";
import {
  AlertTriangle,
  Archive,
  Bell,
  BriefcaseBusiness,
  CirclePause,
  Download,
  FileJson,
  FolderOpen,
  HelpCircle,
  Import,
  Keyboard,
  LayoutPanelLeft,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
  X
} from "lucide-solid";
import {
  harnessStore,
  persistMergedLocalPreferences,
  type PreferencesActiveSectionId,
  type ProviderConnectionProvider
} from "../harness-store";
import {
  appHotkeySettings,
  DEFAULT_APP_HOTKEY_PREFERENCES,
  isValidAppHotkey,
  normalizeAppHotkey,
  normalizeAppHotkeyPreferences,
  type AppHotkeyId
} from "../lib/app-hotkeys";
import { registerCurrentTabItemSelector } from "../lib/current-tab-item-hotkeys";
import { DEFAULT_IDE_EDITOR_SETTINGS, ideStore, type IdeAutoSaveMode, type IdeEditorSettings, type IdeIndentStyle, type IdeTabSize, type IdeWordWrapMode } from "../ide/ide-store";
import { pushToast } from "../toast-store";
import { ActionButton } from "./action-button";
import { ModeEditorPanel } from "./mode-editor-panel";
import { Dialog } from "./primitives/dialog";
import { DropdownControl } from "./primitives/dropdown";
import { Input } from "./primitives/input";
import { LeftPaneSearchInput } from "./primitives/left-pane";
import { Textarea } from "./primitives/textarea";
import { Tooltip } from "./primitives/tooltip";
import {
  AdvancedDisclosure,
  PasswordKeyInput,
  PreferenceRow,
  PreferenceSection,
  RangeControl,
  SegmentedControl
} from "./preferences/preferences-controls";
import {
  getPreferencesSection,
  preferencesSections,
  preferencesSettings,
  type PreferencesSettingMeta
} from "./preferences/preferences-model";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} bytes`;
}

const PREFERENCES_SECTION_EVENT = "preferences-section-change";
const PREFERENCES_SEARCH_EVENT = "preferences-search-change";

function emitPreferencesSectionChange(sectionId: PreferencesActiveSectionId) {
  window.dispatchEvent(new CustomEvent(PREFERENCES_SECTION_EVENT, { detail: { sectionId } }));
}

function emitPreferencesSearchChange() {
  window.dispatchEvent(new CustomEvent(PREFERENCES_SEARCH_EVENT));
}

function isPreferencesSectionEvent(event: Event): event is CustomEvent<{ sectionId: PreferencesActiveSectionId }> {
  return event instanceof CustomEvent && typeof event.detail?.sectionId === "string";
}

function Highlight(props: { value: string; query: string }) {
  const normalizedQuery = () => props.query.trim();
  const parts = createMemo(() => {
    if (!normalizedQuery()) {
      return [props.value];
    }
    return props.value.split(new RegExp(`(${escapeRegExp(normalizedQuery())})`, "ig"));
  });

  return (
    <>
      <For each={parts()}>
        {(part) =>
          part.toLowerCase() === normalizedQuery().toLowerCase() ? (
            <mark class="rounded bg-amber-100 px-0.5 text-(--foreground)">{part}</mark>
          ) : (
            part
          )
        }
      </For>
    </>
  );
}

const recordedModifierKeys = new Set(["Control", "Shift", "Alt", "Meta"]);

function formatRecordedChord(event: KeyboardEvent) {
  const parts: string[] = [];
  if (event.ctrlKey) {
    parts.push("Ctrl");
  }
  if (event.altKey) {
    parts.push("Alt");
  }
  if (event.shiftKey) {
    parts.push("Shift");
  }
  if (event.metaKey) {
    parts.push("Meta");
  }

  if (!recordedModifierKeys.has(event.key)) {
    const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
    parts.push(key === " " ? "Space" : key);
  }

  return parts.join("+");
}

function chordsMatch(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase() || formatForDisplay(left).toLowerCase() === formatForDisplay(right).toLowerCase();
}

function formatHotkeyForDisplay(value: string) {
  return formatForDisplay(value)
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" + ");
}

type PreferencesSearchResult = {
  id: string;
  sectionId: PreferencesActiveSectionId;
  title: string;
  description: string;
  keywords: string[];
  targetId: string;
  kind: "setting" | "keybind";
  keybindId?: AppHotkeyId;
};

function keybindRowElementId(id: AppHotkeyId) {
  return `keybind-${id}`;
}

function scrollToPreferenceTarget(targetId: string) {
  const target = document.getElementById(targetId);
  if (!target) {
    return;
  }
  target.scrollIntoView?.({ block: "center", inline: "nearest" });
  target.focus({ preventScroll: true });
}

function settingSearchResult(setting: PreferencesSettingMeta): PreferencesSearchResult {
  return {
    id: setting.id,
    sectionId: setting.sectionId,
    title: setting.title,
    description: setting.description,
    keywords: setting.keywords,
    targetId: setting.id,
    kind: "setting"
  };
}

function keybindSearchResult(
  setting: (typeof appHotkeySettings)[number],
  hotkeys: string[]
): PreferencesSearchResult {
  const scopeLabel = setting.scope === "ide" ? "IDE keybind" : "App keybind";
  return {
    id: `keybind-${setting.id}`,
    sectionId: "keybinds",
    title: setting.label,
    description: `${scopeLabel}: ${setting.description}`,
    keywords: [
      "keybind",
      "keybinding",
      "hotkey",
      "shortcut",
      scopeLabel,
      setting.scope ?? "app",
      ...hotkeys,
      ...hotkeys.map(formatHotkeyForDisplay)
    ],
    targetId: keybindRowElementId(setting.id),
    kind: "keybind",
    keybindId: setting.id
  };
}

function matchesPreferencesSearchResult(result: PreferencesSearchResult, query: string) {
  const section = getPreferencesSection(result.sectionId);
  const searchableValues =
    result.kind === "setting"
      ? [result.title, result.description, section.label, ...result.keywords]
      : [result.title, result.description, ...result.keywords];
  return searchableValues.some((value) => value.toLowerCase().includes(query));
}

export function PreferencesPanel() {
  const store = harnessStore;
  const state = store.state;
  const sendCommand = store.actions.sendCommand;
  let importInput: HTMLInputElement | undefined;
  let detailContainer: HTMLDivElement | undefined;
  let disposeDetailRoot: (() => void) | undefined;
  const [selectedSectionId, setSelectedSectionId] = createSignal<PreferencesActiveSectionId>(
    state.preferencesActiveSectionId
  );
  const [searchQuery, setSearchQuery] = createSignal(state.preferencesSearchQuery);
  const [hotkeyDrafts, setHotkeyDrafts] = createSignal(normalizeAppHotkeyPreferences(state.appHotkeyPreferences));
  const [keybindSearchQuery, setKeybindSearchQuery] = createSignal("");
  const [pendingDuplicateHotkey, setPendingDuplicateHotkey] = createSignal<{
    id: AppHotkeyId;
    index: number;
    value: string;
    conflictLabel: string;
  }>();

  const handleSectionChange = (event: Event) => {
    if (!isPreferencesSectionEvent(event)) {
      return;
    }
    setSelectedSectionId(event.detail.sectionId);
    setSearchQuery("");
    renderDetailRoot();
  };
  const handleSearchChange = () => {
    setSearchQuery(state.preferencesSearchQuery);
    renderDetailRoot();
  };
  window.addEventListener(PREFERENCES_SECTION_EVENT, handleSectionChange);
  window.addEventListener(PREFERENCES_SEARCH_EVENT, handleSearchChange);
  onCleanup(() => {
    window.removeEventListener(PREFERENCES_SECTION_EVENT, handleSectionChange);
    window.removeEventListener(PREFERENCES_SEARCH_EVENT, handleSearchChange);
    disposeDetailRoot?.();
  });

  const workspaceModes = () => state.workspace.workspaceModes ?? [];
  const workspaceRuleDraft = () => state.workspace.workspaceRuleSource?.content ?? "";
  const workspaceMemoryDraft = () => state.workspace.workspaceMemorySummary?.content ?? "";
  const enabledAssistantBackgroundJobCount = createMemo(
    () => state.backgroundJobs.jobs.filter((job) => job.assistantId && job.status === "enabled").length
  );

  const searchResults = () => {
    const query = searchQuery().trim().toLowerCase();
    if (!query) {
      return [];
    }

    const hotkeys = normalizeAppHotkeyPreferences(state.appHotkeyPreferences);
    return [
      ...preferencesSettings.map(settingSearchResult),
      ...appHotkeySettings.map((setting) => keybindSearchResult(setting, hotkeys[setting.id]))
    ].filter((setting) => matchesPreferencesSearchResult(setting, query));
  };

  const groupedSearchResults = () =>
    preferencesSections
      .map((section) => ({
        section,
        results: searchResults().filter((setting) => setting.sectionId === section.id)
      }))
      .filter((entry) => entry.results.length > 0)
  ;
  const subagentWorktreeOptions = () => [
    { value: "same-worktree", label: "Same checkout", description: "Subagents edit inside current working tree." },
    {
      value: "separate-worktrees",
      label: "Isolated mounts (BranchFS)",
      description: "Subagents work in isolated BranchFS mounts before merge."
    }
  ];
  const projectSortOptions = () => [
    { value: "last-user-message", label: "Last message" },
    { value: "created-at", label: "Created" },
    { value: "manual", label: "Manual" }
  ];
  const threadSortOptions = () => [
    { value: "last-user-message", label: "Last message" },
    { value: "created-at", label: "Created" }
  ];
  const groupingOptions = () => [
    { value: "repository", label: "Repository" },
    { value: "repository-path", label: "Repository path" },
    { value: "separate", label: "Separate" }
  ];

  function handleSave() {
    const openAiApiKey = state.openAiApiKeyDraft.trim() || undefined;
    const googleApiKey = state.googleApiKeyDraft.trim() || undefined;
    const anthropicApiKey = state.anthropicApiKeyDraft.trim() || undefined;

    const localPreferences = {
      openAiApiKey,
      googleApiKey,
      anthropicApiKey,
      providerBrand: state.providerBrand,
      debugEnabled: state.debugEnabled,
      tracePanelDefaultOpen: state.tracePanelDefaultOpen,
      subagentWorktreeStrategyDefault: state.subagentWorktreeStrategyDefault,
      blockChatOnDirtyGitDefault: state.blockChatOnDirtyGitDefault,
      dirtyGitChangeLimitDefault: state.dirtyGitChangeLimitDefault,
      autoCompactContextThresholdPercentDefault: state.autoCompactContextThresholdPercentDefault,
      planExecutionModeDefault: state.planExecutionModeDefault,
      planExecutionDelaySecondsDefault: state.planExecutionDelaySecondsDefault,
      singleAgentModelPreferenceDefault: state.singleAgentModelPreferenceDefault,
      subagentModelPreferenceDefault: state.subagentModelPreferenceDefault,
      correctnessIterationModeDefault: state.correctnessIterationModeDefault,
      backgroundJobApprovalPolicyDefault: state.backgroundJobApprovalPolicyDefault,
      assistantCongestionControlEnabledDefault: state.assistantCongestionControlEnabledDefault,
      assistantMaxCongestionDefault: state.assistantMaxCongestionDefault,
      autoArchiveCompletedThreadsDefault: state.autoArchiveCompletedThreadsDefault,
      backgroundJobNotificationsEnabled: state.backgroundJobNotificationsEnabled,
      memoryBankEnabledDefault: state.memoryBankEnabledDefault,
      memoryBankRecordRunsDefault: state.memoryBankRecordRunsDefault,
      checkCliUpdatesDefault: state.checkCliUpdatesDefault,
      selectedReasoningStrength: state.selectedReasoningStrength,
      selectedFastMode: state.selectedFastMode,
      appHotkeyPreferences: state.appHotkeyPreferences
    };

    persistMergedLocalPreferences(localPreferences);
    store.commitLocalPreferences(localPreferences);

    sendCommand({
      type: "preferences.save",
      requestId: createRequestId(),
      payload: {
        openAiApiKey,
        googleApiKey,
        anthropicApiKey,
        providerBrand: state.providerBrand,
        debugEnabled: state.debugEnabled,
        tracePanelDefaultOpen: state.tracePanelDefaultOpen,
        subagentWorktreeStrategyDefault: state.subagentWorktreeStrategyDefault,
        blockChatOnDirtyGitDefault: state.blockChatOnDirtyGitDefault,
        dirtyGitChangeLimitDefault: state.dirtyGitChangeLimitDefault,
        autoCompactContextThresholdPercentDefault: state.autoCompactContextThresholdPercentDefault,
        planExecutionModeDefault: state.planExecutionModeDefault,
        planExecutionDelaySecondsDefault: state.planExecutionDelaySecondsDefault,
        singleAgentModelPreferenceDefault: state.singleAgentModelPreferenceDefault,
        subagentModelPreferenceDefault: state.subagentModelPreferenceDefault,
        correctnessIterationModeDefault: state.correctnessIterationModeDefault,
        backgroundJobApprovalPolicyDefault: state.backgroundJobApprovalPolicyDefault,
        assistantCongestionControlEnabledDefault: state.assistantCongestionControlEnabledDefault,
        assistantMaxCongestionDefault: state.assistantMaxCongestionDefault,
        autoArchiveCompletedThreadsDefault: state.autoArchiveCompletedThreadsDefault,
        memoryBankEnabledDefault: state.memoryBankEnabledDefault,
        memoryBankRecordRunsDefault: state.memoryBankRecordRunsDefault,
        checkCliUpdatesDefault: state.checkCliUpdatesDefault
      }
    });

  }

  function updateSavedPreference(update: () => void) {
    update();
    handleSave();
  }

  function handleBranchfsCleanup() {
    const projectId = state.workspace.activeProjectId;
    if (!projectId) {
      pushToast("No active project", "Open a project before cleaning BranchFS.", "error");
      return;
    }
    sendCommand({
      type: "branchfs.cleanup",
      requestId: createRequestId(),
      payload: {
        projectId,
        mode: "all"
      }
    });
  }

  function handlePauseAssistantBackgroundJobs() {
    sendCommand({
      type: "background-job.pause-assistant-jobs",
      requestId: createRequestId()
    });
  }

  function handleClearApiKey() {
    persistMergedLocalPreferences({
      openAiApiKey: undefined,
      googleApiKey: undefined,
      anthropicApiKey: undefined,
      providerBrand: state.providerBrand,
      debugEnabled: state.debugEnabled,
      tracePanelDefaultOpen: state.tracePanelDefaultOpen,
      subagentWorktreeStrategyDefault: state.subagentWorktreeStrategyDefault,
      blockChatOnDirtyGitDefault: state.blockChatOnDirtyGitDefault,
      dirtyGitChangeLimitDefault: state.dirtyGitChangeLimitDefault,
      autoCompactContextThresholdPercentDefault: state.autoCompactContextThresholdPercentDefault,
      planExecutionModeDefault: state.planExecutionModeDefault,
      planExecutionDelaySecondsDefault: state.planExecutionDelaySecondsDefault,
      singleAgentModelPreferenceDefault: state.singleAgentModelPreferenceDefault,
      subagentModelPreferenceDefault: state.subagentModelPreferenceDefault,
      correctnessIterationModeDefault: state.correctnessIterationModeDefault,
      backgroundJobApprovalPolicyDefault: state.backgroundJobApprovalPolicyDefault,
      assistantCongestionControlEnabledDefault: state.assistantCongestionControlEnabledDefault,
      assistantMaxCongestionDefault: state.assistantMaxCongestionDefault,
      autoArchiveCompletedThreadsDefault: state.autoArchiveCompletedThreadsDefault,
      backgroundJobNotificationsEnabled: state.backgroundJobNotificationsEnabled,
      memoryBankEnabledDefault: state.memoryBankEnabledDefault,
      memoryBankRecordRunsDefault: state.memoryBankRecordRunsDefault,
      checkCliUpdatesDefault: state.checkCliUpdatesDefault,
      selectedReasoningStrength: state.selectedReasoningStrength,
      selectedFastMode: state.selectedFastMode,
      appHotkeyPreferences: state.appHotkeyPreferences
    });
    store.commitLocalPreferences({
      openAiApiKey: undefined,
      googleApiKey: undefined,
      anthropicApiKey: undefined,
      providerBrand: state.providerBrand,
      debugEnabled: state.debugEnabled,
      tracePanelDefaultOpen: state.tracePanelDefaultOpen,
      subagentWorktreeStrategyDefault: state.subagentWorktreeStrategyDefault,
      blockChatOnDirtyGitDefault: state.blockChatOnDirtyGitDefault,
      dirtyGitChangeLimitDefault: state.dirtyGitChangeLimitDefault,
      autoCompactContextThresholdPercentDefault: state.autoCompactContextThresholdPercentDefault,
      planExecutionModeDefault: state.planExecutionModeDefault,
      planExecutionDelaySecondsDefault: state.planExecutionDelaySecondsDefault,
      singleAgentModelPreferenceDefault: state.singleAgentModelPreferenceDefault,
      subagentModelPreferenceDefault: state.subagentModelPreferenceDefault,
      correctnessIterationModeDefault: state.correctnessIterationModeDefault,
      backgroundJobApprovalPolicyDefault: state.backgroundJobApprovalPolicyDefault,
      assistantCongestionControlEnabledDefault: state.assistantCongestionControlEnabledDefault,
      assistantMaxCongestionDefault: state.assistantMaxCongestionDefault,
      autoArchiveCompletedThreadsDefault: state.autoArchiveCompletedThreadsDefault,
      memoryBankEnabledDefault: state.memoryBankEnabledDefault,
      memoryBankRecordRunsDefault: state.memoryBankRecordRunsDefault,
      checkCliUpdatesDefault: state.checkCliUpdatesDefault,
      selectedReasoningStrength: state.selectedReasoningStrength,
      selectedFastMode: state.selectedFastMode,
      appHotkeyPreferences: state.appHotkeyPreferences
    });

    sendCommand({
      type: "preferences.clearApiKey",
      requestId: createRequestId()
    });
  }

  function handleExportPreferences() {
    const payload = {
      providerBrand: state.providerBrand,
      debugEnabled: state.debugEnabled,
      tracePanelDefaultOpen: state.tracePanelDefaultOpen,
      subagentWorktreeStrategyDefault: state.subagentWorktreeStrategyDefault,
      blockChatOnDirtyGitDefault: state.blockChatOnDirtyGitDefault,
      dirtyGitChangeLimitDefault: state.dirtyGitChangeLimitDefault,
      autoCompactContextThresholdPercentDefault: state.autoCompactContextThresholdPercentDefault,
      planExecutionModeDefault: state.planExecutionModeDefault,
      planExecutionDelaySecondsDefault: state.planExecutionDelaySecondsDefault,
      singleAgentModelPreferenceDefault: state.singleAgentModelPreferenceDefault,
      subagentModelPreferenceDefault: state.subagentModelPreferenceDefault,
      correctnessIterationModeDefault: state.correctnessIterationModeDefault,
      backgroundJobApprovalPolicyDefault: state.backgroundJobApprovalPolicyDefault,
      assistantCongestionControlEnabledDefault: state.assistantCongestionControlEnabledDefault,
      assistantMaxCongestionDefault: state.assistantMaxCongestionDefault,
      autoArchiveCompletedThreadsDefault: state.autoArchiveCompletedThreadsDefault,
      backgroundJobNotificationsEnabled: state.backgroundJobNotificationsEnabled,
      memoryBankEnabledDefault: state.memoryBankEnabledDefault,
      memoryBankRecordRunsDefault: state.memoryBankRecordRunsDefault,
      checkCliUpdatesDefault: state.checkCliUpdatesDefault,
      selectedReasoningStrength: state.selectedReasoningStrength,
      selectedFastMode: state.selectedFastMode,
      appHotkeyPreferences: state.appHotkeyPreferences
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "pi-harness-preferences.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportPreferences(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    try {
      const parsed = JSON.parse(await file.text()) as Partial<{
        providerBrand: ProviderBrand;
        debugEnabled: boolean;
        tracePanelDefaultOpen: boolean;
        subagentWorktreeStrategyDefault: "same-worktree" | "separate-worktrees";
        blockChatOnDirtyGitDefault: boolean;
        dirtyGitChangeLimitDefault: number;
        autoCompactContextThresholdPercentDefault: number;
        planExecutionModeDefault: "countdown" | "approve" | "immediate";
        planExecutionDelaySecondsDefault: number;
        singleAgentModelPreferenceDefault: RunModelPreference;
        subagentModelPreferenceDefault: RunModelPreference;
        correctnessIterationModeDefault: "ask-before-iterate" | "auto-once" | "auto-until-clean";
        backgroundJobApprovalPolicyDefault: "allow-all" | "allow-safe" | "ask-risky" | "always-ask";
        assistantCongestionControlEnabledDefault: boolean;
        assistantMaxCongestionDefault: number;
        autoArchiveCompletedThreadsDefault: boolean;
        backgroundJobNotificationsEnabled: boolean;
        memoryBankEnabledDefault: boolean;
        memoryBankRecordRunsDefault: boolean;
        checkCliUpdatesDefault: boolean;
        selectedReasoningStrength: ComposerReasoningStrength;
        selectedFastMode: boolean;
        appHotkeyPreferences: unknown;
      }>;

      store.commitLocalPreferences({
        providerBrand: parsed.providerBrand,
        debugEnabled: parsed.debugEnabled,
        tracePanelDefaultOpen: parsed.tracePanelDefaultOpen,
        subagentWorktreeStrategyDefault: parsed.subagentWorktreeStrategyDefault,
        blockChatOnDirtyGitDefault: parsed.blockChatOnDirtyGitDefault,
        dirtyGitChangeLimitDefault: parsed.dirtyGitChangeLimitDefault,
        autoCompactContextThresholdPercentDefault: parsed.autoCompactContextThresholdPercentDefault,
        planExecutionModeDefault: parsed.planExecutionModeDefault,
        planExecutionDelaySecondsDefault: parsed.planExecutionDelaySecondsDefault,
        singleAgentModelPreferenceDefault: parsed.singleAgentModelPreferenceDefault,
        subagentModelPreferenceDefault: parsed.subagentModelPreferenceDefault,
        correctnessIterationModeDefault: parsed.correctnessIterationModeDefault,
        backgroundJobApprovalPolicyDefault: parsed.backgroundJobApprovalPolicyDefault,
        assistantCongestionControlEnabledDefault: parsed.assistantCongestionControlEnabledDefault,
        assistantMaxCongestionDefault: parsed.assistantMaxCongestionDefault,
        autoArchiveCompletedThreadsDefault: parsed.autoArchiveCompletedThreadsDefault,
        backgroundJobNotificationsEnabled: parsed.backgroundJobNotificationsEnabled,
        memoryBankEnabledDefault: parsed.memoryBankEnabledDefault,
        memoryBankRecordRunsDefault: parsed.memoryBankRecordRunsDefault,
        checkCliUpdatesDefault: parsed.checkCliUpdatesDefault,
        selectedReasoningStrength: parsed.selectedReasoningStrength,
        selectedFastMode: parsed.selectedFastMode,
        appHotkeyPreferences: normalizeAppHotkeyPreferences(parsed.appHotkeyPreferences)
      });
      persistMergedLocalPreferences({
        openAiApiKey: state.openAiApiKeyDraft.trim() || undefined,
        googleApiKey: state.googleApiKeyDraft.trim() || undefined,
        anthropicApiKey: state.anthropicApiKeyDraft.trim() || undefined,
        providerBrand: parsed.providerBrand ?? state.providerBrand,
        debugEnabled: parsed.debugEnabled ?? state.debugEnabled,
        tracePanelDefaultOpen: parsed.tracePanelDefaultOpen ?? state.tracePanelDefaultOpen,
        subagentWorktreeStrategyDefault: parsed.subagentWorktreeStrategyDefault ?? state.subagentWorktreeStrategyDefault,
        blockChatOnDirtyGitDefault: parsed.blockChatOnDirtyGitDefault ?? state.blockChatOnDirtyGitDefault,
        dirtyGitChangeLimitDefault: parsed.dirtyGitChangeLimitDefault ?? state.dirtyGitChangeLimitDefault,
        autoCompactContextThresholdPercentDefault:
          parsed.autoCompactContextThresholdPercentDefault ?? state.autoCompactContextThresholdPercentDefault,
        planExecutionModeDefault: parsed.planExecutionModeDefault ?? state.planExecutionModeDefault,
        planExecutionDelaySecondsDefault: parsed.planExecutionDelaySecondsDefault ?? state.planExecutionDelaySecondsDefault,
        singleAgentModelPreferenceDefault:
          parsed.singleAgentModelPreferenceDefault ?? state.singleAgentModelPreferenceDefault,
        subagentModelPreferenceDefault: parsed.subagentModelPreferenceDefault ?? state.subagentModelPreferenceDefault,
        correctnessIterationModeDefault: parsed.correctnessIterationModeDefault ?? state.correctnessIterationModeDefault,
        backgroundJobApprovalPolicyDefault:
          parsed.backgroundJobApprovalPolicyDefault ?? state.backgroundJobApprovalPolicyDefault,
        assistantCongestionControlEnabledDefault:
          parsed.assistantCongestionControlEnabledDefault ?? state.assistantCongestionControlEnabledDefault,
        assistantMaxCongestionDefault:
          parsed.assistantMaxCongestionDefault ?? state.assistantMaxCongestionDefault,
        autoArchiveCompletedThreadsDefault:
          parsed.autoArchiveCompletedThreadsDefault ?? state.autoArchiveCompletedThreadsDefault,
        backgroundJobNotificationsEnabled: parsed.backgroundJobNotificationsEnabled ?? state.backgroundJobNotificationsEnabled,
        memoryBankEnabledDefault: parsed.memoryBankEnabledDefault ?? state.memoryBankEnabledDefault,
        memoryBankRecordRunsDefault: parsed.memoryBankRecordRunsDefault ?? state.memoryBankRecordRunsDefault,
        checkCliUpdatesDefault: parsed.checkCliUpdatesDefault ?? state.checkCliUpdatesDefault,
        selectedReasoningStrength: parsed.selectedReasoningStrength ?? state.selectedReasoningStrength,
        selectedFastMode: parsed.selectedFastMode ?? state.selectedFastMode,
        appHotkeyPreferences: normalizeAppHotkeyPreferences(parsed.appHotkeyPreferences ?? state.appHotkeyPreferences)
      });
      pushToast("Preferences imported", "Local defaults updated. Save to sync machine-level defaults.");
    } catch (error) {
      pushToast("Import failed", error instanceof Error ? error.message : "Invalid JSON file.", "error");
    } finally {
      input.value = "";
    }
  }

  function handleSaveWorkspaceContext() {
    sendCommand({
      type: "workspace.context.save",
      requestId: createRequestId(),
      payload: {
        rulesContent: workspaceRuleDraft() || undefined,
        memorySummaryContent: workspaceMemoryDraft() || undefined
      }
    });
    pushToast("Workspace context saved", "Rules and workspace memory updated.");
  }

  function handleResetPanelSizes() {
    store.resetMainPanelSizes();
    pushToast("Panel sizes reset", "Main panel widths restored to defaults.");
  }

  function handleTestProvider(provider: ProviderConnectionProvider, apiKey: string) {
    store.beginProviderConnectionTest(provider);
    sendCommand({
      type: "preferences.testProviderConnection",
      requestId: createRequestId(),
      payload: {
        provider,
        apiKey: apiKey.trim() || undefined
      }
    });
  }

  function keyStatus(provider: ProviderConnectionProvider) {
    const test = state.providerConnectionTests[provider];
    if (test.status === "pending") {
      return "Testing";
    }
    if (test.status === "ready") {
      return "Ready";
    }
    if (test.status === "failed") {
      return "Failed";
    }
    if (provider === "openai" && state.openAiApiKeyDraft.trim()) {
      return state.hasStoredOpenAiApiKey || state.hasLocalOpenAiApiKey ? "Stored + draft" : "Draft only";
    }
    if (provider === "google" && state.googleApiKeyDraft.trim()) {
      return state.hasStoredGoogleApiKey || state.hasLocalGoogleApiKey ? "Stored + draft" : "Draft only";
    }
    if (provider === "anthropic" && state.anthropicApiKeyDraft.trim()) {
      return state.hasStoredAnthropicApiKey || state.hasLocalAnthropicApiKey ? "Stored + draft" : "Draft only";
    }
    if (
      (provider === "openai" && (state.hasStoredOpenAiApiKey || state.hasLocalOpenAiApiKey)) ||
      (provider === "google" && (state.hasStoredGoogleApiKey || state.hasLocalGoogleApiKey)) ||
      (provider === "anthropic" && (state.hasStoredAnthropicApiKey || state.hasLocalAnthropicApiKey))
    ) {
      return "Stored";
    }
    return "No key";
  }

  function openSearchResult(setting: PreferencesSearchResult) {
    const sectionId = setting.sectionId;
    const keybindQuery = setting.kind === "keybind" ? searchQuery().trim() : "";
    setKeybindSearchQuery(keybindQuery);
    setSelectedSectionId(sectionId);
    setSearchQuery("");
    const searchInput = document.querySelector<HTMLInputElement>('[aria-label="Search settings"]');
    if (searchInput) {
      searchInput.value = "";
    }
    store.setPreferencesActiveSectionId(sectionId);
    emitPreferencesSectionChange(sectionId);
    renderDetailRoot();
    queueMicrotask(() => scrollToPreferenceTarget(setting.targetId));
  }

  function renderToggle(checked: boolean, onInput: (checked: boolean) => void, label: string) {
    return (
      <label class="inline-flex min-h-9 cursor-pointer items-center justify-between gap-3 rounded-xl border border-(--border) bg-white/60 px-3 py-2 transition hover:bg-[color-mix(in_srgb,rgb(255_255_255_/_0.6)_80%,black)]">
        <span class="text-xs font-medium text-(--foreground)">{label}</span>
        <input
          class="h-4 w-4 accent-(--accent)"
          type="checkbox"
          checked={checked}
          onInput={(event) => updateSavedPreference(() => onInput(event.currentTarget.checked))}
        />
      </label>
    );
  }

  function renderSettingControl(title: string, description: string, control: JSX.Element) {
    return (
      <div class="grid min-w-0 gap-2 rounded-xl border border-(--border) bg-white/45 p-3 md:grid-cols-[minmax(10rem,0.8fr)_minmax(0,1.4fr)] md:items-center">
        <div class="min-w-0">
          <div class="text-xs font-semibold text-(--foreground)">{title}</div>
          <div class="mt-1 text-[0.7rem] leading-4 text-(--muted)">{description}</div>
        </div>
        <div class="min-w-0">{control}</div>
      </div>
    );
  }

  function renderModelPreferenceControl(
    ariaLabel: string,
    value: RunModelPreference,
    onChange: (value: RunModelPreference) => void,
    tooltip: string
  ) {
    return (
      <div class="grid gap-2">
        <div class="flex min-w-0 items-center gap-2 text-[0.585rem] font-semibold tracking-[0.18em] text-(--muted)">
          <span class="truncate">{ariaLabel}</span>
          <Tooltip content={tooltip} side="right">
            <span tabIndex={0} aria-label={`${ariaLabel} help`} class="inline-flex cursor-help text-(--muted)">
              <HelpCircle class="h-3.5 w-3.5" />
            </span>
          </Tooltip>
        </div>
        <SegmentedControl
          ariaLabel={ariaLabel}
          value={value}
          options={[
            { value: "inference", label: "Inference" },
            { value: "intelligence", label: "Intelligence" }
          ]}
          onChange={(nextValue) => updateSavedPreference(() => onChange(nextValue))}
        />
      </div>
    );
  }

  function saveHotkeyPreference(id: AppHotkeyId, index: number, value: string, allowDuplicate = false) {
    const normalized = normalizeAppHotkey(value, "");
    if (!normalized) {
      return false;
    }
    const duplicate = appHotkeySettings.find((setting) => {
      const existingHotkeys = normalizeAppHotkeyPreferences(state.appHotkeyPreferences)[setting.id];
      return existingHotkeys.some((existing, existingIndex) => {
        if (setting.id === id && existingIndex === index) {
          return false;
        }
        return chordsMatch(existing, normalized);
      });
    });

    if (duplicate && !allowDuplicate) {
      setPendingDuplicateHotkey({ id, index, value: normalized, conflictLabel: duplicate.label });
      return false;
    }

    const currentHotkeys = hotkeyDrafts()[id];
    const nextHotkeys = currentHotkeys.map((hotkey, hotkeyIndex) => (hotkeyIndex === index ? normalized : hotkey));
    updateSavedPreference(() => store.setAppHotkeyPreference(id, nextHotkeys));
    setHotkeyDrafts((drafts) => ({ ...drafts, [id]: nextHotkeys }));
    setPendingDuplicateHotkey(undefined);
    return true;
  }

  function addHotkeyDraft(id: AppHotkeyId) {
    setHotkeyDrafts((drafts) => ({ ...drafts, [id]: [...drafts[id], ""] }));
  }

  function updateHotkeyDraft(id: AppHotkeyId, index: number, value: string) {
    setHotkeyDrafts((drafts) => ({
      ...drafts,
      [id]: drafts[id].map((hotkey, hotkeyIndex) => (hotkeyIndex === index ? value : hotkey))
    }));
  }

  function deleteHotkeyPreference(id: AppHotkeyId, index: number) {
    const nextHotkeys = hotkeyDrafts()[id].filter((_, hotkeyIndex) => hotkeyIndex !== index);
    setHotkeyDrafts((drafts) => ({ ...drafts, [id]: nextHotkeys }));
    updateSavedPreference(() => store.setAppHotkeyPreference(id, nextHotkeys));
  }

  function renderKeybinds() {
    const preferences = () => normalizeAppHotkeyPreferences(state.appHotkeyPreferences);
    const filteredSettings = () => {
      const query = keybindSearchQuery().trim().toLowerCase();
      if (!query) {
        return appHotkeySettings;
      }
      return appHotkeySettings.filter((setting) =>
        [setting.label, setting.description, preferences()[setting.id].join(" ")].some((value) =>
          value.toLowerCase().includes(query)
        )
      );
    };

    return (
      <PreferenceSection title="Keybinds" description="Customize app and IDE hotkeys for this browser.">
        <div id="keyboard-shortcuts" tabIndex={-1} class="grid gap-4">
          <div class="flex flex-wrap items-center justify-between gap-3 border-b border-(--border) pb-3">
            <div class="text-[0.675rem] leading-5 text-(--muted)">{filteredSettings().length} keybindings</div>
            <div class="flex min-w-0 flex-wrap items-center gap-2">
              <label class="relative min-w-48 flex-1">
                <Search class="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-(--muted)" />
                <Input
                  class="h-9 pl-8"
                  aria-label="Search keybindings"
                  value={keybindSearchQuery()}
                  placeholder="Search keybindings..."
                  onInput={(event) => setKeybindSearchQuery(event.currentTarget.value)}
                />
              </label>
            </div>
          </div>

          <div class="grid gap-4">
            {renderHotkeyGroup("App keybinds", filteredSettings().filter((setting) => setting.scope !== "ide"))}
            {renderHotkeyGroup("IDE keybinds", filteredSettings().filter((setting) => setting.scope === "ide"))}
          </div>

          <div>
            <ActionButton
              tooltip="Restore default keyboard shortcuts"
              variant="secondary"
              icon={<RotateCcw class="h-4 w-4" />}
              onClick={() => {
                setHotkeyDrafts({ ...DEFAULT_APP_HOTKEY_PREFERENCES });
                for (const setting of appHotkeySettings) {
                  store.setAppHotkeyPreference(setting.id, DEFAULT_APP_HOTKEY_PREFERENCES[setting.id]);
                }
                handleSave();
              }}
            >
              Restore shortcuts
            </ActionButton>
          </div>
        </div>
      </PreferenceSection>
    );
  }

  function renderHotkeyGroup(title: string, settings: typeof appHotkeySettings) {
    const preferences = () => normalizeAppHotkeyPreferences(state.appHotkeyPreferences);
    return (
      <section class="grid gap-2" data-test-keybind-group={title.toLowerCase().replace(/\s+/g, "-")}>
        <div class="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">{title}</div>
        <For each={settings}>
              {(setting) => {
                const draftValue = () => hotkeyDrafts()[setting.id];
                const duplicate = () =>
                  preferences()[setting.id].some((hotkey, hotkeyIndex) =>
                    appHotkeySettings.some((candidate) =>
                      preferences()[candidate.id].some((candidateHotkey, candidateIndex) => {
                        if (candidate.id === setting.id && candidateIndex === hotkeyIndex) {
                          return false;
                        }
                        return chordsMatch(candidateHotkey, hotkey);
                      })
                    )
                  );
                return (
                  <div
                    id={keybindRowElementId(setting.id)}
                    data-test-keybind-row={setting.id}
                    tabIndex={-1}
                    class="rounded-2xl border border-(--border) bg-white/55 px-4 py-3 shadow-sm transition hover:bg-white/70"
                  >
                    <div class="grid items-center gap-4 md:grid-cols-[minmax(12rem,0.85fr)_minmax(0,2.15fr)_auto]">
                      <div class="min-w-0">
                        <div class="flex min-w-0 items-center gap-2">
                          <Keyboard class="h-3.5 w-3.5 shrink-0 text-(--muted)" />
                          <h4 class="truncate text-[0.62rem] font-semibold tracking-[0.16em] text-(--muted)">{setting.label}</h4>
                          <ActionButton
                            tooltip={setting.description}
                            ariaLabel={`${setting.label} description`}
                            variant="ghost"
                            size="icon"
                            class="h-6 w-6 rounded-lg text-(--muted)"
                            icon={<HelpCircle class="h-3.5 w-3.5" />}
                          />
                        </div>
                      </div>
                      <div class="min-w-0">
                        <div class="flex min-w-0 flex-wrap items-center gap-2.5">
                          <For each={draftValue()}>
                            {(hotkey, index) => (
                              <label class="relative inline-flex min-w-0 rounded-xl">
                                <Input
                                  aria-label={`${setting.label} hotkey`}
                                  value={formatHotkeyForDisplay(hotkey)}
                                  placeholder="Press keys..."
                                  class="h-10 rounded-xl border-(--border) bg-white px-4 pr-8 text-center text-[0.72rem] font-semibold shadow-md"
                                  style={{ width: `${Math.max(9, formatHotkeyForDisplay(hotkey).length + 4)}ch`, "min-width": "7.5rem" }}
                                  onKeyDown={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    const chord = formatRecordedChord(event);
                                    updateHotkeyDraft(setting.id, index(), chord);
                                    saveHotkeyPreference(setting.id, index(), chord);
                                  }}
                                  onInput={(event) => updateHotkeyDraft(setting.id, index(), event.currentTarget.value)}
                                  onBlur={(event) => {
                                    if (isValidAppHotkey(event.currentTarget.value)) {
                                      saveHotkeyPreference(setting.id, index(), event.currentTarget.value);
                                    }
                                  }}
                                />
                                <ActionButton
                                  tooltip="Delete keybinding"
                                  ariaLabel={`Delete ${setting.label} keybinding`}
                                  variant="ghost"
                                  size="icon"
                                  class="absolute -right-2 -top-2 h-5 w-5 rounded-full border border-(--border) bg-(--panel) p-0 shadow-sm"
                                  icon={<X class="h-3 w-3" />}
                                  onClick={() => deleteHotkeyPreference(setting.id, index())}
                                />
                              </label>
                            )}
                          </For>
                          <ActionButton
                            tooltip={`Add ${setting.label} keybinding`}
                            ariaLabel={`Add ${setting.label} keybinding`}
                            variant="secondary"
                            size="icon"
                            class="h-10 w-10 rounded-xl shadow-sm"
                            icon={<Plus class="h-3.5 w-3.5" />}
                            onClick={() => addHotkeyDraft(setting.id)}
                          />
                        </div>
                      </div>
                      <div class="flex min-w-0 items-center justify-end gap-2">
                        <Show when={duplicate()}>
                          <AlertTriangle class="h-4 w-4 text-amber-600" />
                        </Show>
                        <div class="rounded-xl border border-(--border) bg-white/60 px-3 py-2 text-[0.675rem] font-medium text-(--muted)">Always</div>
                      </div>
                    </div>
                  </div>
                );
              }}
            </For>
      </section>
    );
  }

  function renderIdeSettings() {
    const settings = () => ideStore.state.editorSettings;
    const setSetting = <K extends keyof IdeEditorSettings>(key: K, value: IdeEditorSettings[K]) => {
      ideStore.setEditorSetting(key, value);
    };
    return (
      <PreferenceSection title="IDE Settings" description="IDE behavior and formatting defaults for this browser.">
        <PreferenceRow
          id="ide-editor-settings"
          title="IDE behavior"
          description="Each IDE default is labeled with its effect."
          class="md:grid-cols-[minmax(0,0.45fr)_minmax(0,1.55fr)]"
        >
          <div class="grid gap-2">
            {renderSettingControl(
              "Auto save",
              "Choose when dirty IDE files save without pressing the save command.",
              <SegmentedControl<IdeAutoSaveMode>
                ariaLabel="Auto save"
                value={settings().autoSave}
                options={[
                  { value: "off", label: "Off" },
                  { value: "afterDelay", label: "After delay" },
                  { value: "onFocusChange", label: "On focus change" }
                ]}
                onChange={(value) => setSetting("autoSave", value)}
              />
            )}
            {renderSettingControl(
              "Word wrap",
              "Wrap long lines in the IDE viewport instead of scrolling horizontally.",
              <SegmentedControl<IdeWordWrapMode>
                ariaLabel="Word wrap"
                value={settings().wordWrap}
                options={[
                  { value: "off", label: "Off" },
                  { value: "on", label: "On" }
                ]}
                onChange={(value) => setSetting("wordWrap", value)}
              />
            )}
            {renderSettingControl(
              "Indent style",
              "Pick whether Tab inserts spaces or tab characters.",
              <SegmentedControl<IdeIndentStyle>
                ariaLabel="Indent style"
                value={settings().insertSpaces}
                options={[
                  { value: "spaces", label: "Spaces" },
                  { value: "tabs", label: "Tabs" }
                ]}
                onChange={(value) => setSetting("insertSpaces", value)}
              />
            )}
            {renderSettingControl(
              "Tab size",
              "Set indentation width for tab stops and inserted spaces.",
              <SegmentedControl<IdeTabSize>
                ariaLabel="Tab size"
                value={settings().tabSize}
                options={[
                  { value: 2, label: "2" },
                  { value: 4, label: "4" }
                ]}
                onChange={(value) => setSetting("tabSize", value)}
              />
            )}
            {renderSettingControl(
              "Format on save",
              "Run available formatting when an editable file is saved.",
              renderToggle(settings().formatOnSave, (value) => setSetting("formatOnSave", value), "Enabled")
            )}
            {renderSettingControl(
              "Breadcrumbs",
              "Show the current file path above the IDE.",
              renderToggle(settings().breadcrumbsEnabled, (value) => setSetting("breadcrumbsEnabled", value), "Enabled")
            )}
            {renderSettingControl(
              "Bracket pair colorization",
              "Use matching colors for nested brackets in code.",
              renderToggle(settings().bracketPairColorization, (value) => setSetting("bracketPairColorization", value), "Enabled")
            )}
            <ActionButton
              tooltip="Restore IDE defaults"
              variant="secondary"
              class="justify-self-start"
              icon={<RotateCcw class="h-4 w-4" />}
              onClick={() => {
                for (const [key, value] of Object.entries(DEFAULT_IDE_EDITOR_SETTINGS)) {
                  ideStore.setEditorSetting(key as keyof typeof DEFAULT_IDE_EDITOR_SETTINGS, value as never);
                }
              }}
            >
              Restore IDE defaults
            </ActionButton>
          </div>
        </PreferenceRow>
      </PreferenceSection>
    );
  }

  function renderGeneralUi() {
    return (
      <PreferenceSection title="General & UI" description="Compact workspace defaults using the existing warm cream palette.">
        <PreferenceRow id="appearance-density" title="Appearance and density" description="Theme is fixed to the existing light cream palette for this harness.">
          <div class="grid gap-2 text-xs text-(--muted)">
            <div class="rounded-xl border border-(--border) bg-(--panel-strong) p-3 text-(--foreground)">Light cream theme active</div>
            <div>Density follows current compact harness layout.</div>
          </div>
        </PreferenceRow>
        <PreferenceRow id="navigation-sidebar" title="Sidebar and layout" description="Restore main panel sizes and choose project sidebar sorting/grouping.">
          <div class="grid gap-3">
            <ActionButton tooltip="Restore panel sizes" variant="secondary" icon={<LayoutPanelLeft class="h-4 w-4" />} onClick={handleResetPanelSizes}>
              Restore panel sizes
            </ActionButton>
            <div class="grid gap-2 sm:grid-cols-3">
              <DropdownControl
                kind="select"
                ariaLabel="Project sort"
                icon={<FolderOpen class="h-3.5 w-3.5" />}
                size="md"
                value={state.projectSidebarPreferences.projectSort}
                options={projectSortOptions()}
                onChange={(value) => store.setProjectSidebarPreferences({ projectSort: value as never })}
              />
              <DropdownControl
                kind="select"
                ariaLabel="Thread sort"
                icon={<FolderOpen class="h-3.5 w-3.5" />}
                size="md"
                value={state.projectSidebarPreferences.threadSort}
                options={threadSortOptions()}
                onChange={(value) => store.setProjectSidebarPreferences({ threadSort: value as never })}
              />
              <DropdownControl
                kind="select"
                ariaLabel="Project grouping"
                icon={<FolderOpen class="h-3.5 w-3.5" />}
                size="md"
                value={state.projectSidebarPreferences.grouping}
                options={groupingOptions()}
                onChange={(value) => store.setProjectSidebarPreferences({ grouping: value as never })}
              />
            </div>
          </div>
        </PreferenceRow>
        <PreferenceRow id="notifications" title="Notifications" description="Background job alerts and CLI update checks.">
          <div class="grid gap-2">
            {renderToggle(state.backgroundJobNotificationsEnabled, store.setBackgroundJobNotificationsEnabled, "Background job notifications")}
            {renderToggle(state.checkCliUpdatesDefault, store.setCheckCliUpdatesDefault, "Check CLI updates")}
          </div>
        </PreferenceRow>
      </PreferenceSection>
    );
  }

  function renderAiProviders() {
    return (
      <PreferenceSection title="AI & Providers" description="Credentials and composer defaults for AI runs.">
        <PreferenceRow id="provider-keys" title="Provider API keys" description="Keys stay local to this machine; test checks provider model-list access without saving drafts.">
          <div class="grid gap-4">
            <PasswordKeyInput
              label="OpenAI API key"
              value={state.openAiApiKeyDraft}
              placeholder="sk-..."
              status={keyStatus("openai")}
              testStatus={state.providerConnectionTests.openai.status}
              testMessage={state.providerConnectionTests.openai.message}
              testMessageId="openai"
              onInput={(value) => updateSavedPreference(() => store.setOpenAiApiKeyDraft(value))}
              onTest={() => handleTestProvider("openai", state.openAiApiKeyDraft)}
            />
            <PasswordKeyInput
              label="Google API key"
              value={state.googleApiKeyDraft}
              placeholder="AIza..."
              status={keyStatus("google")}
              testStatus={state.providerConnectionTests.google.status}
              testMessage={state.providerConnectionTests.google.message}
              testMessageId="google"
              onInput={(value) => updateSavedPreference(() => store.setGoogleApiKeyDraft(value))}
              onTest={() => handleTestProvider("google", state.googleApiKeyDraft)}
            />
            <PasswordKeyInput
              label="Anthropic API key"
              value={state.anthropicApiKeyDraft}
              placeholder="sk-ant-..."
              status={keyStatus("anthropic")}
              testStatus={state.providerConnectionTests.anthropic.status}
              testMessage={state.providerConnectionTests.anthropic.message}
              testMessageId="anthropic"
              onInput={(value) => updateSavedPreference(() => store.setAnthropicApiKeyDraft(value))}
              onTest={() => handleTestProvider("anthropic", state.anthropicApiKeyDraft)}
            />
          </div>
        </PreferenceRow>
        <PreferenceRow id="provider-brand" title="Active provider" description="Provider preference for new chat and model defaults.">
          <SegmentedControl
            ariaLabel="Active provider"
            value={state.providerBrand}
            options={[
              { value: "gpt", label: "GPT" },
              { value: "gemini", label: "Gemini" },
              { value: "claude", label: "Claude" }
            ]}
            onChange={(value) => updateSavedPreference(() => store.setProviderBrand(value))}
          />
        </PreferenceRow>
        <PreferenceRow id="composer-defaults" title="Composer defaults" description="Browser-local defaults for reasoning effort and fast mode.">
          <div class="grid gap-3">
            <SegmentedControl
              ariaLabel="Reasoning effort"
              value={state.selectedReasoningStrength}
              options={[
                { value: "low", label: "Low" },
                { value: "medium", label: "Medium" },
                { value: "high", label: "High" }
              ]}
              onChange={(value) => updateSavedPreference(() => store.setSelectedReasoningStrength(value))}
            />
            {renderToggle(state.selectedFastMode, store.setSelectedFastMode, "Fast mode")}
          </div>
        </PreferenceRow>
      </PreferenceSection>
    );
  }

  function renderSafetyGuardrails() {
    return (
      <PreferenceSection title="Safety & Guardrails" description="Execution gates, worktree strategy, and run-risk defaults.">
        <PreferenceRow id="plan-gate" title="Planning and approval" description="Choose what happens after an execution plan is ready.">
          <div class="grid gap-3">
            <SegmentedControl
              ariaLabel="Plan gate mode"
              value={state.planExecutionModeDefault}
              options={[
                { value: "countdown", label: "Countdown" },
                { value: "approve", label: "Approve" },
                { value: "immediate", label: "Immediate" }
              ]}
              onChange={(value) => updateSavedPreference(() => store.setPlanExecutionModeDefault(value))}
            />
            <Show when={state.planExecutionModeDefault === "countdown"}>
              <RangeControl
                label="Countdown delay"
                min={0}
                max={300}
                suffix="s"
                value={state.planExecutionDelaySecondsDefault}
                onChange={(value) => updateSavedPreference(() => store.setPlanExecutionDelaySecondsDefault(value))}
              />
            </Show>
          </div>
        </PreferenceRow>
        <PreferenceRow id="worktree-git" title="Worktree and git safety" description="Control subagent isolation and dirty working tree guardrails.">
          <div class="grid gap-3">
            <DropdownControl
              kind="select"
              ariaLabel="Select subagent worktree strategy"
              icon={<FolderOpen class="h-3.5 w-3.5" />}
              size="md"
              class="w-full"
              value={state.subagentWorktreeStrategyDefault}
              options={subagentWorktreeOptions()}
              onChange={(value) =>
                updateSavedPreference(() => store.setSubagentWorktreeStrategyDefault(value as "same-worktree" | "separate-worktrees"))
              }
            />
            {renderToggle(state.blockChatOnDirtyGitDefault, store.setBlockChatOnDirtyGitDefault, "Restrict chat on dirty git")}
            <AdvancedDisclosure title="Advanced git guard" description="Dirty git change limit before chat-triggered runs are refused.">
              <Input
                aria-label="Dirty git change limit"
                type="number"
                min="0"
                max="10000"
                disabled={!state.blockChatOnDirtyGitDefault}
                value={String(state.dirtyGitChangeLimitDefault)}
                onInput={(event) =>
                  updateSavedPreference(() => store.setDirtyGitChangeLimitDefault(Number(event.currentTarget.value) || 0))
                }
              />
            </AdvancedDisclosure>
            <div class="flex flex-wrap items-center gap-2">
              <ActionButton
                tooltip="Delete retained BranchFS workspaces and stop stale interrupted runs"
                icon={<Trash2 class="h-3.5 w-3.5" />}
                size="sm"
                variant="secondary"
                onClick={handleBranchfsCleanup}
              >
                Clean BranchFS
              </ActionButton>
              <Show when={state.branchfsCleanupSummary}>
                {(summary) => (
                  <span class="text-[0.675rem] text-(--muted)">
                    {summary().rootsDeleted} roots deleted | {formatBytes(summary().bytesDeleted)} freed
                    {summary().staleRunsStopped ? ` | ${summary().staleRunsStopped} stale runs stopped` : ""}
                  </span>
                )}
              </Show>
            </div>
          </div>
        </PreferenceRow>
        <PreferenceRow id="run-safety" title="Run safety" description="Context compaction and correctness follow-up defaults.">
          <div class="grid gap-3">
            <RangeControl
              label="Auto-compact threshold"
              min={10}
              max={95}
              suffix="%"
              value={state.autoCompactContextThresholdPercentDefault}
              onChange={(value) => updateSavedPreference(() => store.setAutoCompactContextThresholdPercentDefault(value))}
            />
            {renderModelPreferenceControl(
              "Single agent",
              state.singleAgentModelPreferenceDefault,
              store.setSingleAgentModelPreferenceDefault,
              "Controls the main executor when a plan runs without subagents. Inference will cost less and be faster, while Intelligence will be more precise."
            )}
            {renderModelPreferenceControl(
              "Sub agents",
              state.subagentModelPreferenceDefault,
              store.setSubagentModelPreferenceDefault,
              "Controls spawned parallel subagents. Inference will cost less and be faster, while Intelligence will keep subagents closer to the selected execution model and be more precise."
            )}
            <SegmentedControl
              ariaLabel="Correctness iteration"
              value={state.correctnessIterationModeDefault}
              options={[
                { value: "ask-before-iterate", label: "Ask" },
                { value: "auto-once", label: "Auto once" },
                { value: "auto-until-clean", label: "Until clean" }
              ]}
              onChange={(value) => updateSavedPreference(() => store.setCorrectnessIterationModeDefault(value))}
            />
            <AdvancedDisclosure title="Context compaction details" description="Pi compacts session context after threshold crossing, then continues with reduced history.">
              <p class="text-xs leading-5 text-(--muted)">Lower values compact sooner. Higher values preserve more transcript before compaction.</p>
            </AdvancedDisclosure>
          </div>
        </PreferenceRow>
      </PreferenceSection>
    );
  }

  function renderWorkspaceMemory() {
    return (
      <PreferenceSection title="Workspace & Memory" description="Shared context, memory bank defaults, and archive behavior.">
        <PreferenceRow id="workspace-context" title="Workspace rules and context" description="Shared rules and memory apply before project-specific context.">
          <div class="grid gap-3">
            <label class="grid gap-2">
              <span class="text-xs font-medium text-(--foreground)">Workspace rules</span>
              <Textarea rows="5" value={workspaceRuleDraft()} onInput={(event) => updateWorkspaceDraft("rules", event.currentTarget.value)} />
            </label>
            <label class="grid gap-2">
              <span class="text-xs font-medium text-(--foreground)">Workspace memory</span>
              <Textarea rows="5" value={workspaceMemoryDraft()} onInput={(event) => updateWorkspaceDraft("memory", event.currentTarget.value)} />
            </label>
            <ActionButton tooltip="Save workspace context" variant="secondary" icon={<Save class="h-4 w-4" />} onClick={handleSaveWorkspaceContext}>
              Save workspace context
            </ActionButton>
          </div>
        </PreferenceRow>
        <PreferenceRow id="memory-bank" title="Memory bank settings" description="Inject active memories and record compact run memories.">
          <div class="grid gap-2">
            {renderToggle(state.memoryBankEnabledDefault, store.setMemoryBankEnabledDefault, "Use memory bank in runs")}
            {renderToggle(state.memoryBankRecordRunsDefault, store.setMemoryBankRecordRunsDefault, "Record run memories")}
          </div>
        </PreferenceRow>
        <PreferenceRow id="auto-archive" title="Auto-archive preferences" description="Default behavior for completed threads.">
          {renderToggle(state.autoArchiveCompletedThreadsDefault, store.setAutoArchiveCompletedThreadsDefault, "Auto-archive completed threads")}
        </PreferenceRow>
        <ModeEditorPanel
          title="Workspace custom modes"
          scope="workspace"
          modes={workspaceModes()}
          onSave={(mode) =>
            sendCommand({
              type: "mode.save",
              requestId: createRequestId(),
              payload: {
                scope: "workspace",
                mode
              }
            })
          }
          onDelete={(modeId) =>
            sendCommand({
              type: "mode.delete",
              requestId: createRequestId(),
              payload: {
                scope: "workspace",
                modeId
              }
            })
          }
        />
      </PreferenceSection>
    );
  }

  function updateWorkspaceDraft(kind: "rules" | "memory", value: string) {
    store.applyServerEvent({
      type: "workspace.updated",
      requestId: kind === "rules" ? "local-workspace-rules" : "local-workspace-memory",
      payload: {
        workspace: {
          ...state.workspace,
          projects: state.workspace.projects,
          workspaceModes: state.workspace.workspaceModes ?? [],
          workspaceRuleSource:
            kind === "rules"
              ? value.trim()
                ? {
                    id: "workspace-rules",
                    scope: "workspace",
                    label: "Workspace rules",
                    content: value,
                    updatedAt: new Date().toISOString()
                  }
                : undefined
              : state.workspace.workspaceRuleSource,
          workspaceMemorySummary:
            kind === "memory"
              ? value.trim()
                ? {
                    id: "workspace-memory",
                    scope: "workspace",
                    label: "Workspace memory",
                    content: value,
                    updatedAt: new Date().toISOString(),
                    source: "user"
                  }
                : undefined
              : state.workspace.workspaceMemorySummary,
          activeProjectId: state.workspace.activeProjectId
        }
      }
    });
  }

  function renderBackgroundJobs() {
    return (
      <PreferenceSection title="Background Jobs" description="Approval policy, notifications, and current jobs pane defaults.">
        <PreferenceRow id="job-defaults" title="Background job defaults" description="Choose approval posture for background work.">
          <div class="grid gap-3">
            <SegmentedControl
              ariaLabel="Background approval policy"
              value={state.backgroundJobApprovalPolicyDefault}
              options={[
                { value: "allow-all", label: "Allow all" },
                { value: "allow-safe", label: "Allow safe" },
                { value: "ask-risky", label: "Ask risky" },
                { value: "always-ask", label: "Always ask" }
              ]}
              onChange={(value) => updateSavedPreference(() => store.setBackgroundJobApprovalPolicyDefault(value))}
            />
            {renderToggle(state.backgroundJobNotificationsEnabled, store.setBackgroundJobNotificationsEnabled, "Desktop notifications")}
            <RangeControl
              label="Assistant max congestion"
              value={state.assistantMaxCongestionDefault}
              min={0.25}
              max={3}
              step={0.25}
              suffix="x"
              tooltip="Higher values allow more assistant job load before congestion delays apply, which can lead to jobs running over each other."
              formatValue={(value) => value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}
              onChange={(value) => updateSavedPreference(() => store.setAssistantMaxCongestionDefault(value))}
            />
          </div>
        </PreferenceRow>
        <PreferenceRow id="assistant-job-controls" title="Assistant job controls" description="Pause enabled jobs owned by assistants across projects.">
          <div class="grid gap-2">
            <ActionButton
              tooltip="Pause every enabled assistant-owned background job"
              disabled={enabledAssistantBackgroundJobCount() === 0}
              disabledReason="No enabled assistant-owned background jobs"
              variant="secondary"
              icon={<CirclePause class="h-4 w-4" />}
              ariaLabel="Pause assistant jobs"
              onClick={handlePauseAssistantBackgroundJobs}
            >
              Pause assistant jobs
            </ActionButton>
            <div class="text-[0.675rem] leading-5 text-(--muted)">
              Enabled assistant jobs: {enabledAssistantBackgroundJobCount()}
            </div>
          </div>
        </PreferenceRow>
        <PreferenceRow id="jobs-view" title="Jobs view and sync state" description="Current jobs pane view preferences saved in this browser.">
          <div class="grid gap-2 text-xs text-(--muted)">
            <div class="rounded-xl border border-(--border) bg-white/60 p-3 text-(--foreground)">Segment: {state.jobsPanePreferences.segment}</div>
            <div>Sort: {state.jobsPanePreferences.jobSort}</div>
            <div>Search: {state.jobsPanePreferences.search || "None"}</div>
          </div>
        </PreferenceRow>
      </PreferenceSection>
    );
  }

  function renderDeveloperAdvanced() {
    return (
      <PreferenceSection title="Developer & Advanced" description="Developer logging, trace defaults, portability, and reset controls.">
        <PreferenceRow id="logging-trace" title="Logging and trace UI" description="Defaults for developer visibility in new sessions.">
          <div class="grid gap-2">
            {renderToggle(state.debugEnabled, store.setDebugEnabled, "Verbose developer logging")}
            {renderToggle(state.tracePanelDefaultOpen, store.setTracePanelDefaultOpen, "Open trace panel by default")}
          </div>
        </PreferenceRow>
        <PreferenceRow id="portable-json" title="Import and export JSON" description="Portable preferences exclude API keys.">
          <div class="flex flex-wrap gap-2">
            <ActionButton tooltip="Export preferences JSON" variant="secondary" icon={<Download class="h-4 w-4" />} onClick={handleExportPreferences}>
              Export prefs
            </ActionButton>
            <ActionButton tooltip="Import preferences JSON" variant="secondary" icon={<Import class="h-4 w-4" />} onClick={() => importInput?.click()}>
              Import prefs
            </ActionButton>
          </div>
        </PreferenceRow>
        <PreferenceRow id="advanced-reset" title="Advanced reset controls" description="Clear provider keys or reset local layout state.">
          <div class="flex flex-wrap gap-2">
            <ActionButton tooltip="Clear all provider keys" variant="secondary" icon={<Trash2 class="h-4 w-4" />} onClick={handleClearApiKey}>
              Clear keys
            </ActionButton>
            <ActionButton tooltip="Restore panel sizes" variant="secondary" icon={<RotateCcw class="h-4 w-4" />} onClick={handleResetPanelSizes}>
              Reset layout
            </ActionButton>
          </div>
        </PreferenceRow>
      </PreferenceSection>
    );
  }

  function renderSearchResults() {
    return (
      <PreferenceSection title="Search results" description={`${searchResults().length} matching settings`}>
        <Show when={searchResults().length > 0} fallback={<div class="rounded-xl border border-dashed border-(--border) bg-white/45 p-4 text-xs text-(--muted)">No matching settings.</div>}>
          <div class="grid gap-4">
            <For each={groupedSearchResults()}>
              {(group) => (
                <section class="grid gap-2">
                  <div class="text-[0.7rem] font-semibold tracking-[0.14em] text-(--muted)">{group.section.label}</div>
                  <div class="grid gap-2">
                    <For each={group.results}>
                      {(setting) => (
                        <button
                          type="button"
                          class="cursor-pointer rounded-xl border border-(--border) bg-white/60 p-3 text-left transition hover:bg-white/80"
                          onClick={() => openSearchResult(setting)}
                        >
                          <div class="text-sm font-semibold text-(--foreground)">
                            <Highlight value={setting.title} query={searchQuery()} />
                          </div>
                          <div class="mt-1 text-xs leading-5 text-(--muted)">
                            <Highlight value={setting.description} query={searchQuery()} />
                          </div>
                        </button>
                      )}
                    </For>
                  </div>
                </section>
              )}
            </For>
          </div>
        </Show>
      </PreferenceSection>
    );
  }

  function renderSelectedSection() {
    if (searchQuery().trim()) {
      return renderSearchResults();
    }

    switch (selectedSectionId()) {
      case "keybinds":
        return renderKeybinds();
      case "ide-settings":
        return renderIdeSettings();
      case "general-ui":
        return renderGeneralUi();
      case "safety-guardrails":
        return renderSafetyGuardrails();
      case "workspace-memory":
        return renderWorkspaceMemory();
      case "background-jobs":
        return renderBackgroundJobs();
      case "developer-advanced":
        return renderDeveloperAdvanced();
      default:
        return renderAiProviders();
    }
  }

  function renderDetailRoot() {
    if (!detailContainer) {
      return;
    }
    disposeDetailRoot?.();
    detailContainer.replaceChildren();
    disposeDetailRoot = renderSolidRoot(() => renderSelectedSection(), detailContainer);
  }

  onMount(renderDetailRoot);

  return (
    <section data-test-preferences-panel="" class="panel-shell flex min-h-0 flex-col overflow-visible rounded-2xl bg-(--panel) lg:h-full lg:overflow-hidden">
      <input ref={importInput} type="file" accept="application/json" class="hidden" onChange={handleImportPreferences} />
      <div class="flex min-h-0 flex-1 overflow-visible lg:overflow-hidden">
        <main class="flex min-w-0 flex-1 flex-col bg-(--panel)">
          <div ref={detailContainer} class="min-h-0 flex-1 overflow-visible p-4 lg:overflow-auto">
            {renderAiProviders()}
          </div>
        </main>
      </div>
      <Dialog
        open={Boolean(pendingDuplicateHotkey())}
        title="Duplicate keybind"
        description={`This keybind is already assigned to ${pendingDuplicateHotkey()?.conflictLabel ?? "another command"}.`}
        onClose={() => setPendingDuplicateHotkey(undefined)}
        footer={
          <>
            <ActionButton tooltip="Cancel duplicate keybind save" variant="ghost" onClick={() => setPendingDuplicateHotkey(undefined)}>
              Cancel
            </ActionButton>
            <ActionButton
              tooltip="Save this duplicate keybind anyway"
              icon={<AlertTriangle class="h-4 w-4" />}
              onClick={() => {
                const pending = pendingDuplicateHotkey();
                if (!pending) {
                  return;
                }
                saveHotkeyPreference(pending.id, pending.index, pending.value, true);
              }}
            >
              Save both
            </ActionButton>
          </>
        }
      >
        <p class="text-sm leading-6 text-(--muted)">Both commands can keep the same keybind. The command that handles it first may win when pressed.</p>
      </Dialog>
      <footer class="flex w-full shrink-0 flex-wrap justify-end gap-2 border-t border-(--border) bg-(--panel-strong) px-5 py-4">
          <ActionButton tooltip="Close preferences" ariaLabel="Dismiss" variant="ghost" onClick={() => store.closePreferencesModal()}>
            Dismiss
          </ActionButton>
          <ActionButton tooltip="Export preferences JSON" ariaLabel="Export" variant="ghost" icon={<FileJson class="h-4 w-4" />} onClick={handleExportPreferences}>
            Export
          </ActionButton>
          <ActionButton tooltip="Import preferences JSON" ariaLabel="Import" variant="ghost" icon={<Import class="h-4 w-4" />} onClick={() => importInput?.click()}>
            Import
          </ActionButton>
          <ActionButton tooltip="Clear all provider keys" ariaLabel="Clear keys" variant="secondary" icon={<Trash2 class="h-4 w-4" />} onClick={handleClearApiKey}>
            Clear keys
          </ActionButton>
      </footer>
    </section>
  );
}

export const PreferencesModal = PreferencesPanel;

export function PreferenceSectionNav(props: { onNavigate?: () => void } = {}) {
  const store = harnessStore;
  const state = store.state;
  const [activeSectionId, setActiveSectionId] = createSignal(state.preferencesActiveSectionId);

  const handleSectionChange = (event: Event) => {
    if (!isPreferencesSectionEvent(event)) {
      return;
    }
    setActiveSectionId(event.detail.sectionId);
  };
  window.addEventListener(PREFERENCES_SECTION_EVENT, handleSectionChange);
  const selectSection = (sectionId: PreferencesActiveSectionId) => {
    setActiveSectionId(sectionId);
    store.setPreferencesSearchQuery("");
    store.setPreferencesActiveSectionId(sectionId);
    emitPreferencesSearchChange();
    emitPreferencesSectionChange(sectionId);
    props.onNavigate?.();
  };
  const unregisterItemSelector = registerCurrentTabItemSelector("preferences", (index) => {
    const section = preferencesSections[index];
    if (!section) {
      return false;
    }
    selectSection(section.id as PreferencesActiveSectionId);
    return true;
  });
  onCleanup(() => {
    unregisterItemSelector();
    window.removeEventListener(PREFERENCES_SECTION_EVENT, handleSectionChange);
  });

  return (
    <nav class="grid gap-3 p-3" aria-label="Preference sections">
      <div class="grid gap-3 border-b border-(--border) pb-3">
        <div class="flex items-center gap-2">
          <div class="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">Preferences</div>
          <Tooltip content="Manage provider keys and workspace defaults.">
            <span class="inline-flex h-6 w-6 items-center justify-center rounded-lg text-(--muted)">
              <HelpCircle class="h-3.5 w-3.5" />
            </span>
          </Tooltip>
        </div>
        <LeftPaneSearchInput
          aria-label="Search settings"
          value={state.preferencesSearchQuery}
          placeholder="Search settings..."
          onInput={(event) => {
            store.setPreferencesSearchQuery(event.currentTarget.value);
            emitPreferencesSearchChange();
          }}
        />
      </div>
      <div class="grid gap-1">
      <For each={preferencesSections}>
        {(section) => {
          const Icon = section.icon;
          const active = () => !state.preferencesSearchQuery.trim() && activeSectionId() === section.id;
          return (
            <Tooltip content={`${section.label}\n${section.description}`} triggerClass="block min-w-0">
              <button
                type="button"
                class="preference-section-nav-button flex w-full cursor-pointer items-center gap-2 overflow-hidden rounded-2xl px-3 py-2 text-left text-xs font-medium text-(--muted) transition hover:bg-white/60 hover:text-(--foreground)"
                classList={{ "bg-white/75": active(), "text-(--foreground)": active(), "shadow-sm": active() }}
                aria-label={section.label}
                aria-current={active() ? "page" : undefined}
                onClick={() => {
                  selectSection(section.id as PreferencesActiveSectionId);
                }}
              >
                <Icon class="h-4 w-4 shrink-0" />
                <span class="preference-section-nav-copy min-w-0 flex-1 overflow-hidden">
                  <span class="block truncate">{section.label}</span>
                  <span class="mt-0.5 block truncate text-[0.65rem] font-normal text-(--muted)">{section.description}</span>
                </span>
              </button>
            </Tooltip>
          );
        }}
      </For>
      </div>
    </nav>
  );
}

