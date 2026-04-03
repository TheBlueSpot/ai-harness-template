import { beforeEach, describe, expect, test } from "bun:test";
import { createChatMessage, createEmptySession } from "../../../shared/protocol";
import { useHarnessStore } from "./use-harness-store";

beforeEach(() => {
  useHarnessStore.setState({
    connectionState: "disconnected",
    connectionError: undefined,
    commandError: undefined,
    availableModels: useHarnessStore.getState().availableModels,
    selectedModelId: useHarnessStore.getState().availableModels[0]?.id ?? "",
    session: createEmptySession(useHarnessStore.getState().session.sessionId),
    draft: ""
  });
});

describe("harness store", () => {
  test("retains chat history in memory", () => {
    useHarnessStore.getState().appendMessage(createChatMessage("user", "hello"));
    const session = useHarnessStore.getState().session;

    expect(session.messages.at(-1)?.content).toBe("hello");
  });

  test("updates selected model in zustand state", () => {
    useHarnessStore.getState().setSelectedModelId("gpt-4.1-mini");

    expect(useHarnessStore.getState().selectedModelId).toBe("gpt-4.1-mini");
    expect(useHarnessStore.getState().session.selectedModelId).toBe("gpt-4.1-mini");
  });
});

