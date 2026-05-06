/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import { createUiTest } from "../utils/tests/test-harness";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { PreferencesModal } from "./preferences-modal";
import { harnessStore, readBrowserUiSession } from "../harness-store";
import { toastStore } from "../toast-store";
import { captureDispatchedCommands, clearBrowserStateForTests, seedHarnessStoreForTests } from "../utils/tests/store-test-utils";
import { createHarnessStateFixture } from "../utils/tests/test-fixtures";

createUiTest("PreferencesModal", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
  });

  it("renders when store says open and closes from close controls and Escape", async () => {
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        preferencesModalOpen: true
      })
    );

    render(() => <PreferencesModal />);
    expect(screen.getByRole("dialog", { name: "Workspace preferences" })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(harnessStore.state.preferencesModalOpen).toBe(false);

    harnessStore.openPreferencesModal();
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(harnessStore.state.preferencesModalOpen).toBe(false);

    harnessStore.openPreferencesModal();
    fireEvent.keyDown(await screen.findByRole("dialog", { name: "Workspace preferences" }), { key: "Escape" });
    expect(harnessStore.state.preferencesModalOpen).toBe(false);
  });

  it("shows toast when no usable key exists", () => {
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        preferencesModalOpen: true,
        hasUsableApiKey: false,
        hasStoredApiKey: false
      })
    );

    render(() => <PreferencesModal />);
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

    render(() => <PreferencesModal />);
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
        hasUsableApiKey: true,
        hasStoredApiKey: true,
        hasUsableOpenAiApiKey: true,
        hasStoredOpenAiApiKey: true
      })
    );

    captureDispatchedCommands(commands as never[]);
    render(() => <PreferencesModal />);
    fireEvent.click(screen.getByRole("button", { name: "Save preferences" }));

    expect(commands.length).toBe(1);
    expect((commands[0] as { type: string }).type).toBe("preferences.save");
    expect(
      (commands[0] as {
        payload: {
          blockChatOnDirtyGitDefault: boolean;
          dirtyGitChangeLimitDefault: number;
          autoCompactContextThresholdPercentDefault: number;
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
        };
      }).payload.autoCompactContextThresholdPercentDefault
    ).toBe(55);
    expect(harnessStore.state.preferencesModalOpen).toBe(false);
  });

  it("disables dirty git change limit input when restriction off", () => {
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        preferencesModalOpen: true,
        blockChatOnDirtyGitDefault: false
      })
    );

    render(() => <PreferencesModal />);
    expect((screen.getByLabelText(/Dirty git change limit/i) as HTMLInputElement).disabled).toBe(true);
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
    render(() => <PreferencesModal />);
    fireEvent.click(screen.getByRole("button", { name: "Clear keys" }));

    expect(commands.length).toBe(1);
    expect((commands[0] as { type: string }).type).toBe("preferences.clearApiKey");
  });

  it("restores panel sizes to defaults", () => {
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        preferencesModalOpen: true,
        mainPanelSizes: { left: 2, center: 4, right: 2 }
      })
    );

    render(() => <PreferencesModal />);
    fireEvent.click(screen.getByRole("button", { name: "Restore panel sizes" }));

    expect(harnessStore.state.mainPanelSizes).toEqual({ left: 1.25, center: 3, right: 1.4 });
    expect(readBrowserUiSession().mainPanelSizes).toEqual({ left: 1.25, center: 3, right: 1.4 });
  });
});
