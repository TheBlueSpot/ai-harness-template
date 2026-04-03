import { create } from "zustand";
import {
  createEmptySession,
  type ChatMessage,
  type ChatSessionState,
  type ConnectionState,
  type ModelOption
} from "../../../shared/protocol";
import { defaultModelCatalog } from "../../../shared/model-catalog";

type HarnessStore = {
  connectionState: ConnectionState;
  connectionError?: string;
  commandError?: string;
  availableModels: ModelOption[];
  selectedModelId: string;
  session: ChatSessionState;
  draft: string;
  setConnectionState: (state: ConnectionState, error?: string) => void;
  setCommandError: (error?: string) => void;
  setAvailableModels: (models: ModelOption[]) => void;
  setSelectedModelId: (modelId: string) => void;
  setDraft: (draft: string) => void;
  resetSession: (sessionId?: string) => void;
  appendMessage: (message: ChatMessage) => void;
  updateSession: (session: ChatSessionState) => void;
};

const initialModels = [...defaultModelCatalog];

export const useHarnessStore = create<HarnessStore>((set, get) => {
  const initialSession = createEmptySession();

  return {
    connectionState: "disconnected",
    connectionError: undefined,
    commandError: undefined,
    availableModels: initialModels,
    selectedModelId: initialModels[0]?.id ?? "",
    session: initialSession,
    draft: "",
    setConnectionState: (state, error) =>
      set({
        connectionState: state,
        connectionError: error
      }),
    setCommandError: (error) => set({ commandError: error }),
    setAvailableModels: (models) =>
      set((current) => {
        const hasCurrentModel = models.some((model) => model.id === current.selectedModelId);

        return {
          availableModels: models,
          selectedModelId: hasCurrentModel ? current.selectedModelId : models[0]?.id ?? ""
        };
      }),
    setSelectedModelId: (modelId) =>
      set((current) => ({
        selectedModelId: modelId,
        session: {
          ...current.session,
          selectedModelId: modelId
        }
      })),
    setDraft: (draft) => set({ draft }),
    resetSession: (sessionId) =>
      set({
        session: createEmptySession(sessionId ?? get().session.sessionId),
        draft: "",
        commandError: undefined
      }),
    appendMessage: (message) =>
      set((current) => ({
        session: {
          ...current.session,
          messages: [...current.session.messages, message]
        }
      })),
    updateSession: (session) =>
      set({
        session,
        selectedModelId: session.selectedModelId ?? get().selectedModelId
      })
  };
});
