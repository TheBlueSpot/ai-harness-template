/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import { createUiTest } from "../utils/tests/test-harness";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { PreferenceSectionNav, PreferencesModal } from "./preferences-modal";
import { harnessStore, readBrowserUiSession, readLocalPreferences, readTokenUsageLifetime } from "../harness-store";
import { toastStore } from "../toast-store";
import { captureDispatchedCommands, clearBrowserStateForTests, seedHarnessStoreForTests } from "../utils/tests/store-test-utils";
import { createHarnessStateFixture, createViewProjectFixture } from "../utils/tests/test-fixtures";
import { clearCurrentTabItemSelectorsForTests, selectCurrentTabItem } from "../lib/current-tab-item-hotkeys";
import { CUSTOM_THEME_FONT_OPTIONS, createDefaultCustomTheme } from "../theme/theme-model";
import type { BackgroundJob } from "../../../shared/protocol";

createUiTest("PreferencesModal", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
    clearCurrentTabItemSelectorsForTests();
  });

  function renderPreferencesWithSideNav() {
    return render(() => (
      <>
        <PreferenceSectionNav />
        <PreferencesModal />
      </>
    ));
  }

  function createBackgroundJobFixture(overrides: Partial<BackgroundJob> = {}): BackgroundJob {
    const now = new Date().toISOString();
    return {
      id: overrides.id ?? `job-${crypto.randomUUID()}`,
      projectId: overrides.projectId ?? "project-jobs",
      ...(overrides.assistantId ? { assistantId: overrides.assistantId } : {}),
      automationThreadId: overrides.automationThreadId ?? `thread-${crypto.randomUUID()}`,
      kind: overrides.kind ?? "ai-routine",
      name: overrides.name ?? "Assistant job",
      ...(overrides.description ? { description: overrides.description } : {}),
      lane: overrides.lane ?? "exclusive",
      status: overrides.status ?? "enabled",
      riskLevel: overrides.riskLevel ?? "safe",
      definition: overrides.definition ?? {
        kind: "ai-routine",
        prompt: "Do background work."
      },
      schedule: overrides.schedule ?? {
        type: "one-off",
        runAt: now,
        sourceText: "now"
      },
      scheduleInput: overrides.scheduleInput ?? "now",
      nextRunAt: overrides.nextRunAt ?? now,
      createdAt: overrides.createdAt ?? now,
      updatedAt: overrides.updatedAt ?? now
    };
  }

  it("renders as a panel and dismisses back to projects", async () => {
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        activeLeftTab: "preferences",
        activeSurface: "preferences"
      })
    );

    renderPreferencesWithSideNav();
    expect(screen.getByText("Preferences")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(harnessStore.state.activeLeftTab).toBe("projects");
  });

  it("keeps preferences body and footer in responsive scroll flow", () => {
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        preferencesModalOpen: true
      })
    );

    renderPreferencesWithSideNav();

    const panel = document.querySelector("[data-test-preferences-panel]");
    const footer = panel?.querySelector("footer");
    expect(panel?.className).toContain("overflow-visible");
    expect(panel?.className).toContain("lg:overflow-hidden");
    expect(footer?.className).toContain("shrink-0");
  });

  it("does not expose hidden interactive test shims", () => {
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        preferencesModalOpen: true
      })
    );

    renderPreferencesWithSideNav();

    const hiddenButtons = [...document.querySelectorAll(".sr-only button")];
    const hiddenInputs = [...document.querySelectorAll(".sr-only input")];
    expect(hiddenButtons).toHaveLength(0);
    expect(hiddenInputs).toHaveLength(0);
  });

  it("renders sidebar groups and switches sections", async () => {
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        preferencesModalOpen: true
      })
    );

    renderPreferencesWithSideNav();

    expect(screen.getByRole("button", { name: /General & UI/i })).not.toBeNull();
    expect(screen.getByRole("button", { name: /Keybinds/i })).not.toBeNull();
    expect(screen.getByRole("button", { name: /IDE Settings/i })).not.toBeNull();
    expect(screen.getByRole("button", { name: /AI & Providers/i })).not.toBeNull();
    expect(screen.getByRole("button", { name: /Safety & Guardrails/i })).not.toBeNull();
    expect(screen.getByRole("button", { name: /Workspace & Memory/i })).not.toBeNull();
    expect(screen.getByRole("button", { name: /Usage/i })).not.toBeNull();
    expect(screen.getByRole("button", { name: /Background Jobs/i })).not.toBeNull();
    expect(screen.getByRole("button", { name: /Developer & Advanced/i })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Safety & Guardrails/i }));
    expect(await screen.findByText("Planning and approval")).not.toBeNull();
  });

  it("selects preference sections from current-tab item hotkeys", async () => {
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        preferencesModalOpen: true,
        preferencesSearchQuery: "dirty"
      })
    );

    renderPreferencesWithSideNav();

    expect(selectCurrentTabItem("preferences", 2)).toBe(true);
    expect(harnessStore.state.preferencesActiveSectionId).toBe("ide-settings");
    expect(harnessStore.state.preferencesSearchQuery).toBe("");
    expect(await screen.findByText("IDE behavior")).not.toBeNull();
  });

  it("labels each IDE setting control", async () => {
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        preferencesModalOpen: true,
        preferencesActiveSectionId: "ide-settings"
      })
    );

    renderPreferencesWithSideNav();
    fireEvent.click(screen.getByRole("button", { name: /IDE Settings/i }));

    expect(await screen.findByText("Auto save")).not.toBeNull();
    expect(screen.getByText("Choose when dirty IDE files save without pressing the save command.")).not.toBeNull();
    expect(screen.getByText("Word wrap")).not.toBeNull();
    expect(screen.getByText("Indent style")).not.toBeNull();
    expect(screen.getByText("Tab size")).not.toBeNull();
    expect(screen.getByText("Format on save")).not.toBeNull();
    expect(screen.getByText("Breadcrumbs")).not.toBeNull();
    expect(screen.getByText("Bracket pair colorization")).not.toBeNull();
  });

  it("search flattens results and opens the result section", async () => {
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        preferencesModalOpen: true
      })
    );

    renderPreferencesWithSideNav();
    fireEvent.input(screen.getByLabelText("Search settings"), { target: { value: "dirty" } });

    expect(await screen.findByText("Search results")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Worktree and git safety/i }));

    expect((screen.getByLabelText("Search settings") as HTMLInputElement).value).toBe("");
    expect(await screen.findByText("Worktree and git safety")).not.toBeNull();
  });

  it("search opens keybind results and scrolls to the matching keybind", async () => {
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        preferencesModalOpen: true
      })
    );
    const scrolledTargetIds: string[] = [];
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function () {
      scrolledTargetIds.push((this as HTMLElement).id);
    };

    try {
      renderPreferencesWithSideNav();
      fireEvent.input(screen.getByLabelText("Search settings"), { target: { value: "new assistant" } });

      expect(await screen.findByText("Search results")).not.toBeNull();
      fireEvent.click(screen.getByRole("button", { name: /New assistant/i }));

      expect(await screen.findByRole("heading", { name: "Keybinds" })).not.toBeNull();
      await Promise.resolve();
      expect((screen.getByLabelText("Search keybindings") as HTMLInputElement).value).toBe("new assistant");
      expect(document.querySelector("[data-test-keybind-row='createAssistant']")).not.toBeNull();
      expect(scrolledTargetIds).toContain("keybind-createAssistant");
    } finally {
      Element.prototype.scrollIntoView = originalScrollIntoView;
    }
  });

  it("sends branchfs cleanup and renders compact result", async () => {
    const commands: unknown[] = [];
    const project = createViewProjectFixture({ id: "project-branchfs-cleanup" });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        preferencesModalOpen: true,
        preferencesActiveSectionId: "safety-guardrails",
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        },
        branchfsCleanupSummary: {
          rootsScanned: 4,
          rootsDeleted: 3,
          rootsRetained: 1,
          bytesDeleted: 2048,
          staleRunsStopped: 2,
          warnings: []
        }
      })
    );
    captureDispatchedCommands(commands as never[]);

    renderPreferencesWithSideNav();
    fireEvent.click(screen.getByRole("button", { name: /Safety & Guardrails/i }));
    expect(await screen.findByText("Worktree and git safety")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Delete retained BranchFS workspaces and stop stale interrupted runs" }));

    expect((commands[0] as { type: string }).type).toBe("branchfs.cleanup");
    expect((commands[0] as { payload: { projectId: string; mode: string } }).payload.projectId).toBe(project.id);
    expect((commands[0] as { payload: { mode: string } }).payload.mode).toBe("all");
    expect(screen.getByText(/3 roots deleted/)).not.toBeNull();
    expect(screen.getByText(/2 stale runs stopped/)).not.toBeNull();
  });

  it("sends pause-all assistant jobs from settings while global pause is active", async () => {
    const commands: unknown[] = [];
    const project = createViewProjectFixture({ id: "project-assistant-jobs" });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        preferencesModalOpen: true,
        preferencesActiveSectionId: "background-jobs",
        executionControl: {
          isPaused: true,
          deferredPlanningQuestionCount: 0,
          deferredAssistantQuestionCount: 0,
          deferredBrowserApprovalCount: 0
        },
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        },
        backgroundJobs: {
          jobs: [
            createBackgroundJobFixture({
              id: "job-assistant-enabled",
              projectId: project.id,
              assistantId: "assistant-1",
              status: "enabled"
            })
          ],
          runs: [],
          templates: []
        }
      })
    );
    captureDispatchedCommands(commands as never[]);

    renderPreferencesWithSideNav();
    fireEvent.click(screen.getByRole("button", { name: /Background Jobs/i }));
    expect(await screen.findByText("Assistant job controls")).not.toBeNull();
    const pauseButton = screen.getByRole("button", { name: "Pause assistant jobs" }) as HTMLButtonElement;
    expect(pauseButton.disabled).toBe(false);
    fireEvent.click(pauseButton);

    expect(commands).toHaveLength(1);
    expect((commands[0] as { type: string }).type).toBe("background-job.pause-assistant-jobs");
  });

  it("shows token usage totals and resets them after confirmation", async () => {
    const usageTotals = {
      inputTokens: 1200,
      outputTokens: 300,
      cachedInputTokens: 500,
      totalProcessedTokens: 1500,
      totalTokensIncludingCached: 2000,
      events: 2,
      updatedAt: "2026-06-25T12:00:00.000Z"
    };
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        preferencesModalOpen: true,
        preferencesActiveSectionId: "usage",
        tokenUsage: {
          session: usageTotals,
          lifetime: {
            inputTokens: 5000,
            outputTokens: 1500,
            cachedInputTokens: 2500,
            totalProcessedTokens: 6500,
            totalTokensIncludingCached: 9000,
            events: 6,
            updatedAt: "2026-06-25T12:00:00.000Z"
          }
        }
      })
    );

    renderPreferencesWithSideNav();
    fireEvent.click(screen.getByRole("button", { name: /Usage/i }));

    expect(await screen.findByText("Current session")).not.toBeNull();
    expect(screen.getByText("Lifetime")).not.toBeNull();
    expect(screen.getByText("2,000")).not.toBeNull();
    expect(screen.getByText("9,000")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Reset token usage" }));
    expect(harnessStore.state.tokenUsageResetDialogOpen).toBe(true);
    expect(await screen.findByText("Token counters will start again from the next observed model usage event.")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Confirm token usage reset" }));

    expect(harnessStore.state.tokenUsage.session.totalTokensIncludingCached).toBe(0);
    expect(harnessStore.state.tokenUsage.lifetime.totalTokensIncludingCached).toBe(0);
    expect(readTokenUsageLifetime().totalTokensIncludingCached).toBe(0);
  });

  it("autosaves non-blocking assistant question approval preference", async () => {
    const commands: unknown[] = [];
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        preferencesModalOpen: true,
        preferencesActiveSectionId: "background-jobs",
        assistantAutoApproveNonBlockingQuestionsDefault: true
      })
    );
    captureDispatchedCommands(commands as never[]);

    renderPreferencesWithSideNav();
    fireEvent.click(screen.getByRole("button", { name: /Background Jobs/i }));
    const toggle = (await screen.findByLabelText("Auto-approve non-blocking questions")) as HTMLInputElement;
    fireEvent.click(toggle);

    expect(commands).toHaveLength(1);
    expect((commands[0] as { type: string }).type).toBe("preferences.save");
    expect(
      (commands[0] as { payload: { assistantAutoApproveNonBlockingQuestionsDefault: boolean } }).payload
        .assistantAutoApproveNonBlockingQuestionsDefault
    ).toBe(false);
    expect(readLocalPreferences().assistantAutoApproveNonBlockingQuestionsDefault).toBe(false);
  });

  it("does not render a save preferences button", () => {
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        preferencesModalOpen: true
      })
    );

    renderPreferencesWithSideNav();

    expect(screen.queryByRole("button", { name: "Save preferences" })).toBeNull();
  });

  it("renders theme selector and cycles local-only mode from one button", async () => {
    const commands: unknown[] = [];
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        preferencesModalOpen: true,
        preferencesActiveSectionId: "general-ui"
      })
    );

    captureDispatchedCommands(commands as never[]);
    renderPreferencesWithSideNav();
    fireEvent.click(screen.getByRole("button", { name: /General & UI/i }));

    expect(await screen.findByLabelText("Theme")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Theme mode: System" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Use light mode" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Use dark mode" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Theme mode: System" }));
    expect(readLocalPreferences().themePreference).toMatchObject({
      themeId: "harness",
      mode: "light"
    });

    fireEvent.click(screen.getByRole("button", { name: "Theme mode: Light" }));
    expect(readLocalPreferences().themePreference).toMatchObject({
      themeId: "harness",
      mode: "dark"
    });

    fireEvent.click(screen.getByRole("button", { name: "Theme mode: Dark" }));

    expect(readLocalPreferences().themePreference).toMatchObject({
      themeId: "harness",
      mode: "system"
    });
    expect(commands).toHaveLength(0);
  });

  it("shows custom theme color and font controls", async () => {
    const commands: unknown[] = [];
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        preferencesModalOpen: true,
        preferencesActiveSectionId: "general-ui",
        themePreference: {
          themeId: "custom",
          mode: "light",
          custom: createDefaultCustomTheme("graphite")
        }
      })
    );

    captureDispatchedCommands(commands as never[]);
    renderPreferencesWithSideNav();
    fireEvent.click(screen.getByRole("button", { name: /General & UI/i }));

    const accentInput = await screen.findByLabelText("Accent color") as HTMLInputElement;
    fireEvent.input(accentInput, { target: { value: "#286f6b" } });
    fireEvent.change(screen.getByLabelText("Accent hex"), { target: { value: "nope" } });
    const uiFontButton = screen.getByRole("button", { name: "UI font" });
    expect((uiFontButton as HTMLButtonElement).disabled).toBe(false);
    expect(document.querySelector('input[aria-label="UI font"]')).toBeNull();
    const systemUiFont = CUSTOM_THEME_FONT_OPTIONS["--font-ui"].find((option) => option.label === "System UI")?.value;
    expect(systemUiFont).toBeTruthy();
    const selectedFont = systemUiFont ?? "";
    harnessStore.setCustomTheme({
      ...createDefaultCustomTheme("graphite"),
      light: {
        ...(readLocalPreferences().themePreference?.custom?.light ?? {}),
        "--font-ui": selectedFont
      }
    });

    expect(readLocalPreferences().themePreference?.custom?.light?.["--accent"]).toBe("#286f6b");
    expect(readLocalPreferences().themePreference?.custom?.light?.["--font-ui"]).toBe(selectedFont);
    expect(toastStore.toasts.at(-1)?.title).toBe("Invalid theme color");

    fireEvent.click(screen.getByRole("button", { name: "Reset custom theme" }));
    expect(readLocalPreferences().themePreference?.custom?.light).toBeUndefined();
    expect(commands).toHaveLength(0);
  });

  it("autosaves preferences without API keys", () => {
    const commands: unknown[] = [];
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        preferencesModalOpen: true,
        providerBrand: "claude",
        hasUsableApiKey: false,
        hasStoredApiKey: false,
        hasUsableOpenAiApiKey: false,
        hasStoredOpenAiApiKey: false,
        hasUsableGoogleApiKey: false,
        hasStoredGoogleApiKey: false,
        hasUsableAnthropicApiKey: false,
        hasStoredAnthropicApiKey: false
      })
    );

    captureDispatchedCommands(commands as never[]);
    renderPreferencesWithSideNav();
    fireEvent.click(screen.getByRole("button", { name: "GPT" }));

    expect(toastStore.toasts.length).toBe(0);
    expect(commands.length).toBe(1);
    expect((commands[0] as { type: string }).type).toBe("preferences.save");
    expect((commands[0] as { payload: { providerBrand: string; anthropicApiKey?: string } }).payload.providerBrand).toBe(
      "gpt"
    );
    expect((commands[0] as { payload: { anthropicApiKey?: string } }).payload.anthropicApiKey).toBeUndefined();
  });

  it("autosaves preferences through typed command payload", () => {
    const commands: unknown[] = [];
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        preferencesModalOpen: true,
        openAiApiKeyDraft: "sk-local-123",
        blockChatOnDirtyGitDefault: false,
        dirtyGitChangeLimitDefault: 4,
        autoCompactContextThresholdPercentDefault: 55,
        autoArchiveCompletedThreadsDefault: true,
        memoryBankEnabledDefault: false,
        memoryBankRecordRunsDefault: false,
        checkCliUpdatesDefault: false,
        hasUsableApiKey: true,
        hasStoredApiKey: true,
        hasUsableOpenAiApiKey: true,
        hasStoredOpenAiApiKey: true
      })
    );

    captureDispatchedCommands(commands as never[]);
    renderPreferencesWithSideNav();
    fireEvent.input(screen.getByPlaceholderText("sk-..."), { target: { value: "sk-local-456" } });

    expect(commands.length).toBe(1);
    expect((commands[0] as { type: string }).type).toBe("preferences.save");
    expect(
      (commands[0] as {
        payload: {
          blockChatOnDirtyGitDefault: boolean;
          dirtyGitChangeLimitDefault: number;
          autoCompactContextThresholdPercentDefault: number;
          autoArchiveCompletedThreadsDefault: boolean;
          memoryBankEnabledDefault: boolean;
          memoryBankRecordRunsDefault: boolean;
          checkCliUpdatesDefault: boolean;
        };
      }).payload
        .blockChatOnDirtyGitDefault
    ).toBe(false);
    expect(
      (commands[0] as {
        payload: {
          blockChatOnDirtyGitDefault: boolean;
          dirtyGitChangeLimitDefault: number;
          autoCompactContextThresholdPercentDefault: number;
          memoryBankEnabledDefault: boolean;
          memoryBankRecordRunsDefault: boolean;
          checkCliUpdatesDefault: boolean;
        };
      }).payload
        .dirtyGitChangeLimitDefault
    ).toBe(4);
    expect(
      (commands[0] as {
        payload: {
          blockChatOnDirtyGitDefault: boolean;
          dirtyGitChangeLimitDefault: number;
          autoCompactContextThresholdPercentDefault: number;
          memoryBankEnabledDefault: boolean;
          memoryBankRecordRunsDefault: boolean;
          checkCliUpdatesDefault: boolean;
        };
      }).payload.autoCompactContextThresholdPercentDefault
    ).toBe(55);
    expect(
      (commands[0] as {
        payload: {
          autoArchiveCompletedThreadsDefault: boolean;
        };
      }).payload.autoArchiveCompletedThreadsDefault
    ).toBe(true);
    expect(
      (commands[0] as {
        payload: {
          memoryBankEnabledDefault: boolean;
          memoryBankRecordRunsDefault: boolean;
        };
      }).payload.memoryBankEnabledDefault
    ).toBe(false);
    expect(
      (commands[0] as {
        payload: {
          memoryBankEnabledDefault: boolean;
          memoryBankRecordRunsDefault: boolean;
          checkCliUpdatesDefault: boolean;
        };
      }).payload.memoryBankRecordRunsDefault
    ).toBe(false);
    expect(
      (commands[0] as {
        payload: {
          checkCliUpdatesDefault: boolean;
        };
      }).payload.checkCliUpdatesDefault
    ).toBe(false);
  });

  it("renders memory bank preference toggles", async () => {
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        preferencesModalOpen: true
      })
    );

    renderPreferencesWithSideNav();
    fireEvent.click(screen.getByRole("button", { name: /Workspace & Memory/i }));

    expect(await screen.findByText("Use memory bank in runs")).not.toBeNull();
    expect(await screen.findByText("Record run memories")).not.toBeNull();
  });

  it("disables dirty git change limit input when restriction off", async () => {
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        preferencesModalOpen: true,
        blockChatOnDirtyGitDefault: false
      })
    );

    renderPreferencesWithSideNav();
    fireEvent.click(screen.getByRole("button", { name: /Safety & Guardrails/i }));
    await screen.findByText("Worktree and git safety");
    fireEvent.click(screen.getByRole("button", { name: /Advanced git guard/i }));

    expect((screen.getByLabelText(/Dirty git change limit/i) as HTMLInputElement).disabled).toBe(true);
  });

  it("sliders clamp thresholds and countdown delay", async () => {
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        preferencesModalOpen: true,
        hasUsableApiKey: true,
        hasStoredApiKey: true
      })
    );

    renderPreferencesWithSideNav();
    fireEvent.click(screen.getByRole("button", { name: /Safety & Guardrails/i }));
    await screen.findByText("Planning and approval");

    fireEvent.input(screen.getByLabelText("Countdown delay"), { target: { value: "500" } });
    fireEvent.input(screen.getByLabelText("Auto-compact threshold"), { target: { value: "1" } });

    expect(harnessStore.state.planExecutionDelaySecondsDefault).toBe(300);
    expect(harnessStore.state.autoCompactContextThresholdPercentDefault).toBe(10);
  });

  it("segmented controls update store", () => {
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        preferencesModalOpen: true,
        openAiApiKeyDraft: "sk-local-123"
      })
    );

    renderPreferencesWithSideNav();
    fireEvent.click(screen.getByRole("button", { name: "Medium" }));

    expect(harnessStore.state.selectedReasoningStrength).toBe("medium");
  });

  it("toggles API key visibility", () => {
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        preferencesModalOpen: true,
        openAiApiKeyDraft: "sk-local-123"
      })
    );

    renderPreferencesWithSideNav();
    const input = screen.getByPlaceholderText("sk-...") as HTMLInputElement;
    expect(input.type).toBe("password");

    fireEvent.click(screen.getByRole("button", { name: "Show OpenAI API key" }));

    expect(input.type).toBe("text");
  });

  it("tests provider connection without saving key and renders result", async () => {
    const commands: unknown[] = [];
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        preferencesModalOpen: true,
        openAiApiKeyDraft: "sk-local-123"
      })
    );

    captureDispatchedCommands(commands as never[]);
    renderPreferencesWithSideNav();
    fireEvent.click(screen.getByRole("button", { name: "Test OpenAI API key" }));

    expect((commands[0] as { type: string }).type).toBe("preferences.testProviderConnection");
    expect((commands[0] as { payload: { apiKey?: string } }).payload.apiKey).toBe("sk-local-123");
    expect(harnessStore.state.providerConnectionTests.openai.status).toBe("pending");

    harnessStore.applyServerEvent({
      type: "preferences.providerConnectionTested",
      requestId: "req-test",
      payload: {
        provider: "openai",
        status: "ready",
        message: "Connection ready. 2 models visible.",
        modelCount: 2
      }
    });

    expect(await screen.findByText("Connection ready. 2 models visible.")).not.toBeNull();
  });

  it("clears keys through typed command payload", () => {
    const commands: unknown[] = [];
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        preferencesModalOpen: true,
        openAiApiKeyDraft: "sk-local-123",
        googleApiKeyDraft: "AIza-local-456"
      })
    );

    captureDispatchedCommands(commands as never[]);
    renderPreferencesWithSideNav();
    fireEvent.click(screen.getByRole("button", { name: "Clear keys" }));

    expect(commands.length).toBe(1);
    expect((commands[0] as { type: string }).type).toBe("preferences.clearApiKey");
  });

  it("restores panel sizes to defaults", async () => {
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        preferencesModalOpen: true,
        mainPanelSizes: { left: 2, center: 4, right: 2 }
      })
    );

    renderPreferencesWithSideNav();
    fireEvent.click(screen.getByRole("button", { name: /General & UI/i }));
    await screen.findByText("Sidebar and layout");
    fireEvent.click(screen.getByRole("button", { name: "Restore panel sizes" }));

    expect(harnessStore.state.mainPanelSizes).toEqual({ left: 1.25, center: 3, right: 1.4 });
    expect(readBrowserUiSession().mainPanelSizes).toEqual({ left: 1.25, center: 3, right: 1.4 });
  });

  it("configures and autosaves app hotkeys", async () => {
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        preferencesModalOpen: true
      })
    );

    renderPreferencesWithSideNav();
    fireEvent.click(screen.getByRole("button", { name: /Keybinds/i }));
    await screen.findByRole("heading", { name: "Keybinds" });

    expect(screen.getByText("New assistant")).not.toBeNull();
    expect(screen.getByText("New AI job")).not.toBeNull();
    expect(screen.getByText("Select current tab item 1")).not.toBeNull();
    expect(screen.getByText("Select current tab item 9")).not.toBeNull();

    const preferencesHotkeyInput = screen.getAllByLabelText("Workspace preferences hotkey")[0] as HTMLInputElement;
    preferencesHotkeyInput.value = "Alt+,";
    fireEvent.input(preferencesHotkeyInput);
    fireEvent.blur(preferencesHotkeyInput);

    expect(readLocalPreferences().appHotkeyPreferences?.openPreferences).toContain("Alt+,");
  });

  it("deletes individual app hotkeys", async () => {
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        preferencesModalOpen: true
      })
    );

    renderPreferencesWithSideNav();
    fireEvent.click(screen.getByRole("button", { name: /Keybinds/i }));
    await screen.findByRole("heading", { name: "Keybinds" });

    fireEvent.click(screen.getAllByRole("button", { name: "Delete Workspace preferences keybinding" })[0] as HTMLButtonElement);

    expect(readLocalPreferences().appHotkeyPreferences?.openPreferences).toEqual(["Mod+,"]);
  });
});
