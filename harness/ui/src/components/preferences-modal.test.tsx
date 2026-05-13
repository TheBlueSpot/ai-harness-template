/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import { createUiTest } from "../utils/tests/test-harness";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { PreferenceSectionNav, PreferencesModal } from "./preferences-modal";
import { harnessStore, readBrowserUiSession } from "../harness-store";
import { toastStore } from "../toast-store";
import { captureDispatchedCommands, clearBrowserStateForTests, seedHarnessStoreForTests } from "../utils/tests/store-test-utils";
import { createHarnessStateFixture } from "../utils/tests/test-fixtures";

createUiTest("PreferencesModal", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
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
    expect(screen.getByRole("heading", { name: "Workspace preferences" })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(harnessStore.state.activeLeftTab).toBe("projects");
  });

  it("renders sidebar groups and switches sections", async () => {
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        preferencesModalOpen: true
      })
    );

    renderPreferencesWithSideNav();

    expect(screen.getByRole("button", { name: /General & UI/i })).not.toBeNull();
    expect(screen.getByRole("button", { name: /AI & Providers/i })).not.toBeNull();
    expect(screen.getByRole("button", { name: /Safety & Guardrails/i })).not.toBeNull();
    expect(screen.getByRole("button", { name: /Workspace & Memory/i })).not.toBeNull();
    expect(screen.getByRole("button", { name: /Background Jobs/i })).not.toBeNull();
    expect(screen.getByRole("button", { name: /Developer & Advanced/i })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Safety & Guardrails/i }));
    expect(await screen.findByText("Planning and approval")).not.toBeNull();
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

  it("shows toast when no usable key exists", () => {
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        preferencesModalOpen: true,
        hasUsableApiKey: false,
        hasStoredApiKey: false
      })
    );

    renderPreferencesWithSideNav();
    fireEvent.click(screen.getByRole("button", { name: "Save preferences" }));

    expect(toastStore.toasts.length).toBe(1);
    expect(toastStore.toasts[0]?.title).toBe("API key required");
  });

  it("shows toast when selected provider has no matching key", () => {
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        preferencesModalOpen: true,
        providerBrand: "gemini",
        hasUsableApiKey: true,
        hasStoredApiKey: true,
        hasUsableOpenAiApiKey: true,
        hasStoredOpenAiApiKey: true,
        hasUsableGoogleApiKey: false,
        hasStoredGoogleApiKey: false
      })
    );

    renderPreferencesWithSideNav();
    fireEvent.click(screen.getByRole("button", { name: "Save preferences" }));

    expect(toastStore.toasts.length).toBe(1);
    expect(toastStore.toasts[0]?.title).toBe("Provider key required");
  });

  it("saves preferences through typed command payload", () => {
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
        hasUsableApiKey: true,
        hasStoredApiKey: true,
        hasUsableOpenAiApiKey: true,
        hasStoredOpenAiApiKey: true
      })
    );

    captureDispatchedCommands(commands as never[]);
    renderPreferencesWithSideNav();
    fireEvent.click(screen.getByRole("button", { name: "Save preferences" }));

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
        };
      }).payload.memoryBankRecordRunsDefault
    ).toBe(false);
    expect(harnessStore.state.activeLeftTab).toBe("projects");
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
});
