/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import { createUiTest } from "../utils/tests/test-harness";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { PreferenceSectionNav, PreferencesModal } from "./preferences-modal";
import { harnessStore, readBrowserUiSession, readLocalPreferences } from "../harness-store";
import { toastStore } from "../toast-store";
import { captureDispatchedCommands, clearBrowserStateForTests, seedHarnessStoreForTests } from "../utils/tests/store-test-utils";
import { createHarnessStateFixture } from "../utils/tests/test-fixtures";
import { clearCurrentTabItemSelectorsForTests, selectCurrentTabItem } from "../lib/current-tab-item-hotkeys";

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
    expect(screen.getByRole("button", { name: /AI & Providers/i })).not.toBeNull();
    expect(screen.getByRole("button", { name: /Safety & Guardrails/i })).not.toBeNull();
    expect(screen.getByRole("button", { name: /Workspace & Memory/i })).not.toBeNull();
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
    expect(harnessStore.state.preferencesActiveSectionId).toBe("ai-providers");
    expect(harnessStore.state.preferencesSearchQuery).toBe("");
    expect(await screen.findByText("Provider API keys")).not.toBeNull();
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

  it("does not render a save preferences button", () => {
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        preferencesModalOpen: true
      })
    );

    renderPreferencesWithSideNav();

    expect(screen.queryByRole("button", { name: "Save preferences" })).toBeNull();
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
