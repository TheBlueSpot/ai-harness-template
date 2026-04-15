import { createRequestId, type ClientCommand } from "../../../shared/protocol";
import { canSelectProviderBrand, harnessStore, persistLocalPreferences } from "../harness-store";
import { pushToast } from "../toast-store";
import { ModeEditorPanel } from "./mode-editor-panel";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";

type PreferencesModalProps = {
  sendCommand: (command: ClientCommand) => void;
};

export function PreferencesModal(props: PreferencesModalProps) {
  const state = harnessStore.state;
  let importInput: HTMLInputElement | undefined;

  const workspaceModes = () => state.workspace.workspaceModes ?? [];
  const workspaceRuleDraft = () => state.workspace.workspaceRuleSource?.content ?? "";
  const workspaceMemoryDraft = () => state.workspace.workspaceMemorySummary?.content ?? "";

  function handleSave() {
    const openAiApiKey = state.openAiApiKeyDraft.trim() || undefined;
    const googleApiKey = state.googleApiKeyDraft.trim() || undefined;

    if (!openAiApiKey && !googleApiKey && !state.hasUsableApiKey && !state.hasStoredApiKey) {
      pushToast("API key required", "Enter provider key before sending chat.", "error");
      return;
    }

    if (!canSelectProviderBrand(state, state.providerBrand)) {
      pushToast("Provider key required", `Saved ${state.providerBrand === "gemini" ? "Gemini" : "GPT"} key required.`, "error");
      return;
    }

    persistLocalPreferences({
      openAiApiKey,
      googleApiKey,
      providerBrand: state.providerBrand,
      debugEnabled: state.debugEnabled,
      tracePanelDefaultOpen: state.tracePanelDefaultOpen,
      subagentWorktreeStrategyDefault: state.subagentWorktreeStrategyDefault,
      blockChatOnDirtyGitDefault: state.blockChatOnDirtyGitDefault,
      dirtyGitChangeLimitDefault: state.dirtyGitChangeLimitDefault,
      planExecutionModeDefault: state.planExecutionModeDefault,
      planExecutionDelaySecondsDefault: state.planExecutionDelaySecondsDefault,
      correctnessIterationModeDefault: state.correctnessIterationModeDefault,
      uiMode: state.uiMode
    });
    harnessStore.commitLocalPreferences({
      openAiApiKey,
      googleApiKey,
      providerBrand: state.providerBrand,
      debugEnabled: state.debugEnabled,
      tracePanelDefaultOpen: state.tracePanelDefaultOpen,
      subagentWorktreeStrategyDefault: state.subagentWorktreeStrategyDefault,
      blockChatOnDirtyGitDefault: state.blockChatOnDirtyGitDefault,
      dirtyGitChangeLimitDefault: state.dirtyGitChangeLimitDefault,
      planExecutionModeDefault: state.planExecutionModeDefault,
      planExecutionDelaySecondsDefault: state.planExecutionDelaySecondsDefault,
      correctnessIterationModeDefault: state.correctnessIterationModeDefault,
      uiMode: state.uiMode
    });

    props.sendCommand({
      type: "preferences.save",
      requestId: createRequestId(),
      payload: {
        openAiApiKey,
        googleApiKey,
        providerBrand: state.providerBrand,
        debugEnabled: state.debugEnabled,
        tracePanelDefaultOpen: state.tracePanelDefaultOpen,
        subagentWorktreeStrategyDefault: state.subagentWorktreeStrategyDefault,
        blockChatOnDirtyGitDefault: state.blockChatOnDirtyGitDefault,
        dirtyGitChangeLimitDefault: state.dirtyGitChangeLimitDefault,
        planExecutionModeDefault: state.planExecutionModeDefault,
        planExecutionDelaySecondsDefault: state.planExecutionDelaySecondsDefault,
        correctnessIterationModeDefault: state.correctnessIterationModeDefault,
        uiModeDefault: state.uiMode
      }
    });

    harnessStore.closePreferencesModal();
  }

  function handleClearApiKey() {
    persistLocalPreferences({
      openAiApiKey: undefined,
      googleApiKey: undefined,
      providerBrand: state.providerBrand,
      debugEnabled: state.debugEnabled,
      tracePanelDefaultOpen: state.tracePanelDefaultOpen,
      subagentWorktreeStrategyDefault: state.subagentWorktreeStrategyDefault,
      blockChatOnDirtyGitDefault: state.blockChatOnDirtyGitDefault,
      dirtyGitChangeLimitDefault: state.dirtyGitChangeLimitDefault,
      planExecutionModeDefault: state.planExecutionModeDefault,
      planExecutionDelaySecondsDefault: state.planExecutionDelaySecondsDefault,
      correctnessIterationModeDefault: state.correctnessIterationModeDefault
    });
    harnessStore.commitLocalPreferences({
      openAiApiKey: undefined,
      googleApiKey: undefined,
      providerBrand: state.providerBrand,
      debugEnabled: state.debugEnabled,
      tracePanelDefaultOpen: state.tracePanelDefaultOpen,
      subagentWorktreeStrategyDefault: state.subagentWorktreeStrategyDefault,
      blockChatOnDirtyGitDefault: state.blockChatOnDirtyGitDefault,
      dirtyGitChangeLimitDefault: state.dirtyGitChangeLimitDefault,
      planExecutionModeDefault: state.planExecutionModeDefault,
      planExecutionDelaySecondsDefault: state.planExecutionDelaySecondsDefault,
      correctnessIterationModeDefault: state.correctnessIterationModeDefault
    });

    props.sendCommand({
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
      planExecutionModeDefault: state.planExecutionModeDefault,
      planExecutionDelaySecondsDefault: state.planExecutionDelaySecondsDefault,
      correctnessIterationModeDefault: state.correctnessIterationModeDefault,
      uiMode: state.uiMode
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
        providerBrand: "gpt" | "gemini";
        debugEnabled: boolean;
        tracePanelDefaultOpen: boolean;
        subagentWorktreeStrategyDefault: "same-worktree" | "separate-worktrees";
        blockChatOnDirtyGitDefault: boolean;
        dirtyGitChangeLimitDefault: number;
        planExecutionModeDefault: "countdown" | "approve" | "immediate";
        planExecutionDelaySecondsDefault: number;
        correctnessIterationModeDefault: "ask-before-iterate" | "auto-once" | "auto-until-clean";
        uiMode: "simple" | "advanced";
      }>;

      harnessStore.commitLocalPreferences({
        providerBrand: parsed.providerBrand,
        debugEnabled: parsed.debugEnabled,
        tracePanelDefaultOpen: parsed.tracePanelDefaultOpen,
        subagentWorktreeStrategyDefault: parsed.subagentWorktreeStrategyDefault,
        blockChatOnDirtyGitDefault: parsed.blockChatOnDirtyGitDefault,
        dirtyGitChangeLimitDefault: parsed.dirtyGitChangeLimitDefault,
        planExecutionModeDefault: parsed.planExecutionModeDefault,
        planExecutionDelaySecondsDefault: parsed.planExecutionDelaySecondsDefault,
        correctnessIterationModeDefault: parsed.correctnessIterationModeDefault,
        uiMode: parsed.uiMode
      });
      persistLocalPreferences({
        openAiApiKey: state.openAiApiKeyDraft.trim() || undefined,
        googleApiKey: state.googleApiKeyDraft.trim() || undefined,
        providerBrand: parsed.providerBrand ?? state.providerBrand,
        debugEnabled: parsed.debugEnabled ?? state.debugEnabled,
        tracePanelDefaultOpen: parsed.tracePanelDefaultOpen ?? state.tracePanelDefaultOpen,
        subagentWorktreeStrategyDefault: parsed.subagentWorktreeStrategyDefault ?? state.subagentWorktreeStrategyDefault,
        blockChatOnDirtyGitDefault: parsed.blockChatOnDirtyGitDefault ?? state.blockChatOnDirtyGitDefault,
        dirtyGitChangeLimitDefault: parsed.dirtyGitChangeLimitDefault ?? state.dirtyGitChangeLimitDefault,
        planExecutionModeDefault: parsed.planExecutionModeDefault ?? state.planExecutionModeDefault,
        planExecutionDelaySecondsDefault: parsed.planExecutionDelaySecondsDefault ?? state.planExecutionDelaySecondsDefault,
        correctnessIterationModeDefault: parsed.correctnessIterationModeDefault ?? state.correctnessIterationModeDefault,
        uiMode: parsed.uiMode ?? state.uiMode
      });
      pushToast("Preferences imported", "Local defaults updated. Save to sync machine-level defaults.");
    } catch (error) {
      pushToast("Import failed", error instanceof Error ? error.message : "Invalid JSON file.", "error");
    } finally {
      input.value = "";
    }
  }

  function handleSaveWorkspaceContext() {
    props.sendCommand({
      type: "workspace.context.save",
      requestId: createRequestId(),
      payload: {
        rulesContent: workspaceRuleDraft() || undefined,
        memorySummaryContent: workspaceMemoryDraft() || undefined
      }
    });
    pushToast("Workspace context saved", "Rules and workspace memory updated.");
  }

  return (
    <Dialog
      open={state.preferencesModalOpen}
      onClose={() => harnessStore.closePreferencesModal()}
      title="Workspace preferences"
      eyebrow="Preferences"
      description="Manage local GPT and Gemini keys plus default workspace preferences."
      footer={
        <>
          <Button variant="ghost" onClick={() => harnessStore.closePreferencesModal()}>
            Dismiss
          </Button>
          <Button variant="ghost" onClick={handleExportPreferences}>
            Export prefs
          </Button>
          <Button variant="ghost" onClick={() => importInput?.click()}>
            Import prefs
          </Button>
          <Button variant="secondary" onClick={handleClearApiKey}>
            Clear keys
          </Button>
          <Button onClick={handleSave}>Save preferences</Button>
        </>
      }
    >
      <input ref={importInput} type="file" accept="application/json" class="hidden" onChange={handleImportPreferences} />
      <div class="grid gap-3">
        <label class="space-y-2">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">
            Active brand
          </span>
          <select
            class="flex h-9 w-full rounded-xl border border-[color:var(--border)] bg-white/70 px-3 py-2 text-[0.675rem] text-[color:var(--foreground)] shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
            value={state.providerBrand}
            onInput={(event) => harnessStore.setProviderBrand(event.currentTarget.value as "gpt" | "gemini")}
          >
            <option value="gpt" disabled={!canSelectProviderBrand(state, "gpt")}>
              GPT
            </option>
            <option value="gemini" disabled={!canSelectProviderBrand(state, "gemini")}>
              Gemini
            </option>
          </select>
          <p class="text-[0.675rem] leading-5 text-[color:var(--muted)]">Brand switch stays disabled until matching key exists or you type one here.</p>
        </label>

        <label class="space-y-2">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">
            OpenAI API key
          </span>
          <Input
            type="password"
            value={state.openAiApiKeyDraft}
            placeholder="sk-..."
            onInput={(event: InputEvent & { currentTarget: HTMLInputElement; target: Element }) =>
              harnessStore.setOpenAiApiKeyDraft(event.currentTarget.value)
            }
          />
        </label>

        <label class="space-y-2">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">
            Google API key
          </span>
          <Input
            type="password"
            value={state.googleApiKeyDraft}
            placeholder="AIza..."
            onInput={(event: InputEvent & { currentTarget: HTMLInputElement; target: Element }) =>
              harnessStore.setGoogleApiKeyDraft(event.currentTarget.value)
            }
          />
        </label>

        <p class="text-[0.675rem] leading-5 text-[color:var(--muted)]">
          Keys stored in browser storage and local workspace storage on this machine.
        </p>
      </div>

      <div class="grid gap-3 md:grid-cols-2">
        <label class="space-y-2 rounded-[1.25rem] border border-[color:var(--border)] bg-white/55 px-4 py-3">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Default UI</span>
          <select
            class="flex h-9 w-full rounded-xl border border-[color:var(--border)] bg-white/70 px-3 py-2 text-[0.675rem] text-[color:var(--foreground)] shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
            value={state.uiMode}
            onInput={(event) => harnessStore.setUiMode(event.currentTarget.value as "simple" | "advanced")}
          >
            <option value="simple">Simple</option>
            <option value="advanced">Advanced</option>
          </select>
        </label>
      </div>

      <div class="grid gap-3 md:grid-cols-2">
        <label class="flex items-start gap-3 rounded-[1.25rem] border border-[color:var(--border)] bg-white/55 px-4 py-3">
          <input
            class="mt-1"
            type="checkbox"
            checked={state.debugEnabled}
            onInput={(event) => harnessStore.setDebugEnabled(event.currentTarget.checked)}
          />
          <div>
            <div class="text-[0.675rem] font-semibold text-[color:var(--foreground)]">Verbose developer logging</div>
            <div class="mt-1 text-[0.675rem] leading-5 text-[color:var(--muted)]">Default on for new runs in this browser.</div>
          </div>
        </label>

        <label class="flex items-start gap-3 rounded-[1.25rem] border border-[color:var(--border)] bg-white/55 px-4 py-3">
          <input
            class="mt-1"
            type="checkbox"
            checked={state.tracePanelDefaultOpen}
            onInput={(event) => harnessStore.setTracePanelDefaultOpen(event.currentTarget.checked)}
          />
          <div>
            <div class="text-[0.675rem] font-semibold text-[color:var(--foreground)]">Open trace panel by default</div>
            <div class="mt-1 text-[0.675rem] leading-5 text-[color:var(--muted)]">Controls initial layout after refresh.</div>
          </div>
        </label>
      </div>

      <div class="grid gap-3 md:grid-cols-2">
        <label class="space-y-2 rounded-[1.25rem] border border-[color:var(--border)] bg-white/55 px-4 py-3">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">
            Subagent worktree
          </span>
          <select
            class="flex h-9 w-full rounded-xl border border-[color:var(--border)] bg-white/70 px-3 py-2 text-[0.675rem] text-[color:var(--foreground)] shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
            value={state.subagentWorktreeStrategyDefault}
            onInput={(event) =>
              harnessStore.setSubagentWorktreeStrategyDefault(event.currentTarget.value as "same-worktree" | "separate-worktrees")
            }
          >
            <option value="same-worktree">Same worktree</option>
            <option value="separate-worktrees">Separate worktrees</option>
          </select>
        </label>

        <label class="space-y-2 rounded-[1.25rem] border border-[color:var(--border)] bg-white/55 px-4 py-3">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">
            Plan gate mode
          </span>
          <select
            class="flex h-9 w-full rounded-xl border border-[color:var(--border)] bg-white/70 px-3 py-2 text-[0.675rem] text-[color:var(--foreground)] shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
            value={state.planExecutionModeDefault}
            onInput={(event) =>
              harnessStore.setPlanExecutionModeDefault(event.currentTarget.value as "countdown" | "approve" | "immediate")
            }
          >
            <option value="countdown">Countdown</option>
            <option value="approve">Approve first</option>
            <option value="immediate">Immediate</option>
          </select>
        </label>

        <label class="flex items-start gap-3 rounded-[1.25rem] border border-[color:var(--border)] bg-white/55 px-4 py-3">
          <input
            class="mt-1"
            type="checkbox"
            checked={state.blockChatOnDirtyGitDefault}
            onInput={(event) => harnessStore.setBlockChatOnDirtyGitDefault(event.currentTarget.checked)}
          />
          <div>
            <div class="text-[0.675rem] font-semibold text-[color:var(--foreground)]">Restrict chat on dirty git</div>
            <div class="mt-1 text-[0.675rem] leading-5 text-[color:var(--muted)]">
              Warn on dirty repos and block chat-triggered runs above the configured tracked plus untracked change limit.
            </div>
          </div>
        </label>

        <label class="space-y-2 rounded-[1.25rem] border border-[color:var(--border)] bg-white/55 px-4 py-3">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">
            Dirty git change limit
          </span>
          <Input
            type="number"
            min="0"
            max="10000"
            disabled={!state.blockChatOnDirtyGitDefault}
            value={String(state.dirtyGitChangeLimitDefault)}
            onInput={(event: InputEvent & { currentTarget: HTMLInputElement; target: Element }) =>
              harnessStore.setDirtyGitChangeLimitDefault(Math.max(0, Math.min(10000, Number(event.currentTarget.value) || 0)))
            }
          />
          <p class="text-[0.675rem] leading-5 text-[color:var(--muted)]">
            Counts tracked and untracked git status entries before chat-triggered runs are refused.
          </p>
        </label>

        <label class="space-y-2 rounded-[1.25rem] border border-[color:var(--border)] bg-white/55 px-4 py-3">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">
            Countdown seconds
          </span>
          <Input
            type="number"
            min="0"
            max="300"
            value={String(state.planExecutionDelaySecondsDefault)}
            onInput={(event: InputEvent & { currentTarget: HTMLInputElement; target: Element }) =>
              harnessStore.setPlanExecutionDelaySecondsDefault(Math.max(0, Math.min(300, Number(event.currentTarget.value) || 0)))
            }
          />
        </label>

        <label class="space-y-2 rounded-[1.25rem] border border-[color:var(--border)] bg-white/55 px-4 py-3">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">
            Correctness iteration
          </span>
          <select
            class="flex h-9 w-full rounded-xl border border-[color:var(--border)] bg-white/70 px-3 py-2 text-[0.675rem] text-[color:var(--foreground)] shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
            value={state.correctnessIterationModeDefault}
            onInput={(event) =>
              harnessStore.setCorrectnessIterationModeDefault(
                event.currentTarget.value as "ask-before-iterate" | "auto-once" | "auto-until-clean"
              )
            }
          >
            <option value="ask-before-iterate">Ask before iterate</option>
            <option value="auto-once">Auto once</option>
            <option value="auto-until-clean">Auto until clean</option>
          </select>
        </label>
      </div>

      <section class="grid gap-3 rounded-[1.25rem] border border-[color:var(--border)] bg-white/55 px-4 py-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <div class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Workspace context</div>
            <div class="mt-1 text-[0.675rem] leading-5 text-[color:var(--muted)]">
              Shared rules and memory apply before project-specific context.
            </div>
          </div>
          <Button variant="secondary" onClick={handleSaveWorkspaceContext}>
            Save workspace context
          </Button>
        </div>
        <label class="space-y-2">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Workspace rules</span>
          <Textarea
            rows="5"
            value={workspaceRuleDraft()}
            onInput={(event) =>
              harnessStore.applyServerEvent({
                type: "workspace.updated",
                requestId: "local-workspace-rules",
                payload: {
                  workspace: {
                    ...state.workspace,
                    projects: state.workspace.projects,
                    workspaceModes: state.workspace.workspaceModes ?? [],
                    workspaceRuleSource: event.currentTarget.value.trim()
                      ? {
                          id: "workspace-rules",
                          scope: "workspace",
                          label: "Workspace rules",
                          content: event.currentTarget.value,
                          updatedAt: new Date().toISOString()
                        }
                      : undefined,
                    workspaceMemorySummary: state.workspace.workspaceMemorySummary,
                    activeProjectId: state.workspace.activeProjectId
                  }
                }
              })
            }
          />
        </label>
        <label class="space-y-2">
          <span class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Workspace memory</span>
          <Textarea
            rows="5"
            value={workspaceMemoryDraft()}
            onInput={(event) =>
              harnessStore.applyServerEvent({
                type: "workspace.updated",
                requestId: "local-workspace-memory",
                payload: {
                  workspace: {
                    ...state.workspace,
                    projects: state.workspace.projects,
                    workspaceModes: state.workspace.workspaceModes ?? [],
                    workspaceRuleSource: state.workspace.workspaceRuleSource,
                    workspaceMemorySummary: event.currentTarget.value.trim()
                      ? {
                          id: "workspace-memory",
                          scope: "workspace",
                          label: "Workspace memory",
                          content: event.currentTarget.value,
                          updatedAt: new Date().toISOString(),
                          source: "user"
                        }
                      : undefined,
                    activeProjectId: state.workspace.activeProjectId
                  }
                }
              })
            }
          />
        </label>
      </section>

      <ModeEditorPanel
        title="Workspace custom modes"
        scope="workspace"
        modes={workspaceModes()}
        onSave={(mode) =>
          props.sendCommand({
            type: "mode.save",
            requestId: createRequestId(),
            payload: {
              scope: "workspace",
              mode
            }
          })
        }
        onDelete={(modeId) =>
          props.sendCommand({
            type: "mode.delete",
            requestId: createRequestId(),
            payload: {
              scope: "workspace",
              modeId
            }
          })
        }
      />
    </Dialog>
  );
}
