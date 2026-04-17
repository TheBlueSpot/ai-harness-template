import { createInitialViewState, harnessStore, type HarnessViewState } from "../../harness-store";
import { resetToastStoreForTests as clearToastStore } from "../../toast-store";

export function resetHarnessStoreForTests() {
  harnessStore.replaceStateForTests(createInitialViewState());
  harnessStore.actions.setCommandDispatcher(() => undefined);
}

export function seedHarnessStoreForTests(stateOverride: Partial<HarnessViewState>) {
  const baseState = createInitialViewState();
  harnessStore.replaceStateForTests({
    ...baseState,
    ...stateOverride,
    workspace: {
      ...baseState.workspace,
      ...stateOverride.workspace
    },
    pendingExecutionModelIds: {
      ...baseState.pendingExecutionModelIds,
      ...stateOverride.pendingExecutionModelIds
    },
    projectPreflights: {
      ...baseState.projectPreflights,
      ...stateOverride.projectPreflights
    }
  });
  harnessStore.actions.setCommandDispatcher(() => undefined);
}

export function resetToastStoreForTests() {
  clearToastStore();
}

export function clearBrowserStateForTests() {
  resetHarnessStoreForTests();
  resetToastStoreForTests();
  harnessStore.actions.setCommandDispatcher(() => undefined);

  if (typeof window !== "undefined") {
    window.localStorage.clear();
  }

  if (typeof document !== "undefined") {
    document.body.innerHTML = "";
  }

  if (typeof navigator !== "undefined" && !("clipboard" in navigator)) {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => undefined
      }
    });
  }
}

export function captureDispatchedCommands(commands: unknown[]) {
  harnessStore.actions.setCommandDispatcher((command) => {
    commands.push(command);
  });
}
