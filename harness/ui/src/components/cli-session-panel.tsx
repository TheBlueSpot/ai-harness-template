import { Show, createEffect } from "solid-js";
import { createRequestId } from "../../../shared/protocol";
import { getActiveProject, harnessStore } from "../harness-store";
import { sendCliSessionInput } from "../harness-websocket";
import { ActionButton } from "./action-button";
import { Input } from "./primitives/input";

export function CliSessionPanel() {
  let outputRef: HTMLPreElement | undefined;
  const state = harnessStore.state;
  const sendCommand = harnessStore.actions.sendCommand;
  const activeProject = () => getActiveProject(state);
  const activeSession = () => activeProject()?.activeCliSession;
  const terminalState = () =>
    activeSession() ? state.cliSessionTerminal[activeSession()!.id] : undefined;

  createEffect(() => {
    terminalState()?.stdout;
    terminalState()?.stderr;
    queueMicrotask(() => {
      if (outputRef) {
        outputRef.scrollTop = outputRef.scrollHeight;
      }
    });
  });

  const handleReconnect = () => {
    const project = activeProject();
    const session = activeSession();
    if (!project || !session) {
      return;
    }

    sendCommand({
      type: "cli-session.attach",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        sessionId: session.id
      }
    });
  };

  const handleStop = () => {
    const project = activeProject();
    const session = activeSession();
    if (!project || !session) {
      return;
    }

    sendCommand({
      type: "cli-session.stop",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        sessionId: session.id
      }
    });
  };

  const handleCapture = () => {
    const project = activeProject();
    const session = activeSession();
    const terminal = terminalState();
    if (!project || !session || !terminal) {
      return;
    }

    sendCommand({
      type: "cli-session.capture-visible-buffer",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        sessionId: session.id,
        visibleBuffer: terminal.stdout.slice(-64_000),
        stderrTail: terminal.stderr.slice(-32_000)
      }
    });
  };

  return (
    <Show
      when={activeSession()}
      fallback={
        <div class="rounded-[1.35rem] border border-dashed border-(--border) bg-white/40 p-4 text-[0.675rem] text-(--muted)">
          No live CLI session.
        </div>
      }
    >
      {(session) => (
        <div class="space-y-3 rounded-[1.35rem] border border-(--border) bg-white/55 p-4">
          <div class="flex flex-wrap items-center justify-between gap-3 text-[0.625rem] uppercase tracking-[0.14em] text-(--muted)">
            <span>{session().agentId}</span>
            <span>Status: {session().status}</span>
            <span>{terminalState()?.connected ? "Attached" : "Detached"}</span>
          </div>
          <pre
            ref={outputRef}
            class="max-h-72 overflow-auto rounded-2xl border border-(--border) bg-stone-950 p-3 font-mono text-[0.7rem] leading-5 text-stone-100"
          >
            {(terminalState()?.stdout ?? "") + (terminalState()?.stderr ?? "")}
          </pre>
          <div class="flex flex-wrap gap-2">
            <Input
              placeholder="Type terminal input and press Enter"
              onKeyDown={(event) => {
                if (event.key !== "Enter") {
                  return;
                }

                const value = event.currentTarget.value;
                if (!value) {
                  return;
                }

                sendCliSessionInput(session().id, `${value}\n`);
                event.currentTarget.value = "";
              }}
            />
          </div>
          <div class="flex flex-wrap gap-2">
            <ActionButton tooltip="Reconnect PTY stream" variant="secondary" onClick={handleReconnect}>
              Reconnect
            </ActionButton>
            <ActionButton tooltip="Capture current terminal state for follow-up" variant="secondary" onClick={handleCapture}>
              Capture visible state
            </ActionButton>
            <ActionButton tooltip="Stop live CLI session" variant="secondary" onClick={handleStop}>
              Stop session
            </ActionButton>
          </div>
        </div>
      )}
    </Show>
  );
}

