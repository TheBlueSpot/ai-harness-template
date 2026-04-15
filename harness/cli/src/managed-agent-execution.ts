import type {
  PiAgentAdapter,
  PiAgentExecutionController,
  PiAgentExecutionEvent,
  PiAgentPromptRequest,
  PiAgentPromptResult
} from "./pi-agent-adapter";
import type { ManagedExecutionKind, ManagedExecutionState, ManagedRefreshAction } from "./execution-runtime";

type ManagedExecutionStore = {
  getState: () => ManagedExecutionState | undefined;
  setState: (state: ManagedExecutionState) => void;
  clearState: () => void;
};

export async function runManagedAgentExecution(
  adapter: PiAgentAdapter,
  options: {
    runId: string;
    kind: Exclude<ManagedExecutionKind, "planner">;
    subagentId?: string;
    originalRequest: PiAgentPromptRequest;
    continuationRequest: PiAgentPromptRequest;
    abortSignal?: AbortSignal;
    store: ManagedExecutionStore;
    onRefreshComplete?: (mode: ManagedRefreshAction | "deferred") => void;
    onSettledState?: (state: ManagedExecutionState | undefined) => void;
  }
): Promise<PiAgentPromptResult> {
  let controller: PiAgentExecutionController | undefined;
  let nextRequest = options.originalRequest;

  while (true) {
    controller = await adapter.startExecution(
      withLifecycleCallbacks(nextRequest, (event) => {
        handleExecutionEvent(options.store, options, controller, event);
      })
    );
    const abortHandler = async () => {
      await controller?.abort();
    };
    options.abortSignal?.addEventListener("abort", abortHandler, { once: true });

    const existingState = options.store.getState();
    options.store.setState({
      runId: options.runId,
      kind: options.kind,
      subagentId: options.subagentId,
      phase: existingState?.phase ?? "api-starting",
      hasReceivedActivity: existingState?.hasReceivedActivity ?? false,
      lastProgressAt: existingState?.lastProgressAt ?? Date.now(),
      refreshRequested: existingState?.refreshRequested ?? false,
      refreshDeferred: existingState?.refreshDeferred ?? false,
      pendingRefreshAction: existingState?.pendingRefreshAction,
      originalRequest: snapshotRequest(options.originalRequest),
      continuationRequest: snapshotRequest(options.continuationRequest),
      controller,
      spawnTiming: existingState?.spawnTiming
    });

    try {
      const result = await controller.result;
      const latestState = options.store.getState();
      if (latestState?.refreshDeferred) {
        options.store.setState({
          ...latestState,
          phase: "done",
          controller: undefined,
          refreshRequested: false,
          refreshDeferred: false,
          pendingRefreshAction: undefined,
          lastProgressAt: Date.now()
        });
        options.onRefreshComplete?.("deferred");
      } else if (latestState) {
        options.store.setState({
          ...latestState,
          phase: "done",
          controller: undefined,
          lastProgressAt: Date.now()
        });
      }
      options.onSettledState?.(options.store.getState());
      options.store.clearState();
      options.abortSignal?.removeEventListener("abort", abortHandler);
      controller.dispose();
      return result;
    } catch (error) {
      const latestState = options.store.getState();
      const refreshAction = latestState?.pendingRefreshAction;
      if (!isAbortLike(error) || !refreshAction) {
        if (latestState) {
          options.store.setState({
            ...latestState,
            phase: "failed",
            controller: undefined,
            lastProgressAt: Date.now()
          });
        }
        options.onSettledState?.(options.store.getState());
        options.store.clearState();
        options.abortSignal?.removeEventListener("abort", abortHandler);
        controller.dispose();
        throw error;
      }

      const baseState = {
        ...(latestState ?? {
          runId: options.runId,
          kind: options.kind,
          subagentId: options.subagentId,
          originalRequest: snapshotRequest(options.originalRequest),
          continuationRequest: snapshotRequest(options.continuationRequest),
          spawnTiming: undefined
        }),
        phase: "api-starting" as const,
        controller,
        refreshRequested: false,
        refreshDeferred: false,
        pendingRefreshAction: undefined,
        lastProgressAt: Date.now()
      };

      if (refreshAction === "continue") {
        try {
          options.store.setState(baseState);
          const continuedResult = await controller.continueWithPrompt(options.continuationRequest.prompt);
          options.onRefreshComplete?.("continue");
          options.store.clearState();
          options.abortSignal?.removeEventListener("abort", abortHandler);
          controller.dispose();
          return continuedResult;
        } catch (continueError) {
          if (!isAbortLike(continueError)) {
            controller.dispose();
            throw continueError;
          }

          nextRequest = options.continuationRequest;
          options.store.setState(baseState);
          options.onRefreshComplete?.("continue");
          options.abortSignal?.removeEventListener("abort", abortHandler);
          controller.dispose();
          continue;
        }
      }

      nextRequest = options.originalRequest;
      options.store.setState(baseState);
      options.onRefreshComplete?.("restart");
      options.abortSignal?.removeEventListener("abort", abortHandler);
      controller.dispose();
    }
  }
}

function handleExecutionEvent(
  store: ManagedExecutionStore,
  options: Pick<Parameters<typeof runManagedAgentExecution>[1], "runId" | "kind" | "subagentId" | "originalRequest" | "continuationRequest">,
  controller: PiAgentExecutionController | undefined,
  event: PiAgentExecutionEvent
) {
  const current = store.getState() ?? {
    runId: options.runId,
    kind: options.kind,
    subagentId: options.subagentId,
    phase: "api-starting" as const,
    hasReceivedActivity: false,
    lastProgressAt: Date.now(),
    refreshRequested: false,
    refreshDeferred: false,
    pendingRefreshAction: undefined,
    originalRequest: snapshotRequest(options.originalRequest),
    continuationRequest: snapshotRequest(options.continuationRequest)
  };

  if (event.type === "session-created") {
    store.setState({
      ...current,
      controller,
      phase: current.phase === "provisioning" ? "provisioning" : "api-starting",
      lastProgressAt: Date.now(),
      spawnTiming: {
        ...current.spawnTiming,
        sessionCreatedAt: current.spawnTiming?.sessionCreatedAt ?? Date.now()
      }
    });
    return;
  }

  store.setState({
    ...current,
    controller,
    phase: event.type === "tool-end" ? "finishing" : "active",
    hasReceivedActivity: true,
    lastProgressAt: Date.now(),
    spawnTiming: {
      ...current.spawnTiming,
      firstActivityAt: current.spawnTiming?.firstActivityAt ?? Date.now(),
      firstToolStartAt:
        event.type === "tool-start"
          ? current.spawnTiming?.firstToolStartAt ?? Date.now()
          : current.spawnTiming?.firstToolStartAt
    }
  });
}

function snapshotRequest(request: PiAgentPromptRequest) {
  return {
    cwd: request.cwd,
    modelId: request.modelId,
    prompt: request.prompt,
    readOnly: request.readOnly
  };
}

function withLifecycleCallbacks(
  request: PiAgentPromptRequest,
  onExecutionEvent: (event: PiAgentExecutionEvent) => void
): PiAgentPromptRequest {
  return {
    ...request,
    onExecutionEvent(event) {
      request.onExecutionEvent?.(event);
      onExecutionEvent(event);
    }
  };
}

function isAbortLike(error: unknown) {
  return error instanceof Error && error.message.toLowerCase().includes("abort");
}
