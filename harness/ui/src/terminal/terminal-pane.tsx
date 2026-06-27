import { Show, createSignal } from "solid-js";
import { AlertTriangle, Maximize2, Search, SplitSquareHorizontal, SplitSquareVertical, Square } from "lucide-solid";
import { createRequestId, type TerminalSession } from "../../../shared/protocol";
import { getActiveProject, harnessStore } from "../harness-store";
import { ActionButton } from "../components/action-button";
import { terminalStore } from "./terminal-store";
import { XtermRenderer, type XtermRendererHandle } from "./renderers/xterm-renderer";
import { SolidTerminalRendererPrototype } from "./renderers/solid-renderer-prototype";
import { TerminalSearch } from "./terminal-search";
import { shouldUseSolidTerminalRenderer } from "./terminal-renderer-mode";
import { openTerminalSearch } from "./terminal-search-actions";
import { sendTerminalInput } from "./terminal-transport";

export function TerminalPane(props: {
  session: TerminalSession;
  output: string;
  connected: boolean;
  onSplitHorizontal: () => void;
  onSplitVertical: () => void;
}) {
  const [renderer, setRenderer] = createSignal<XtermRendererHandle>();
  const activeProject = () => getActiveProject(harnessStore.state);
  const source = () => props.session.source ?? { kind: "user" as const };
  const agentSource = () => {
    const current = source();
    return current.kind === "agent" ? current : undefined;
  };
  const readOnly = () => props.session.inputMode === "read-only" && props.session.inputOverride !== true;
  const connectionState = () => (props.connected ? "attached" : "detached");
  const pipeWarningLabel = () => props.session.transportMode === "pipe" ? "pipe mode" : props.session.transportWarning ? "degraded" : undefined;
  const lockReason = () => props.session.inputLockReason ?? "This terminal is locked while an agent or CLI run owns input.";
  const backspaceInput = () => props.session.transportMode === "pipe" ? "\b" : undefined;

  const resize = (cols: number, rows: number) => {
    if (cols === props.session.cols && rows === props.session.rows) {
      return;
    }
    harnessStore.actions.sendCommand({
      type: "terminal.session.resize",
      requestId: createRequestId(),
      payload: {
        projectId: props.session.projectId,
        sessionId: props.session.id,
        cols,
        rows
      }
    });
  };

  const setInputOverride = (allowInput: boolean) => {
    harnessStore.actions.sendCommand({
      type: "terminal.session.set-input-override",
      requestId: createRequestId(),
      payload: {
        projectId: props.session.projectId,
        sessionId: props.session.id,
        allowInput
      }
    });
  };

  return (
    <section class="flex h-full min-h-0 min-w-0 flex-1 flex-col border border-(--terminal-border) bg-(--terminal-shell)" data-test-terminal-pane={props.session.id}>
      <div class="flex min-h-11 shrink-0 items-center justify-between gap-2 border-b border-(--terminal-border) px-3 py-1.5">
        <div class="min-w-0">
          <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[0.72rem] leading-4 text-(--terminal-muted)">
            <span class="truncate font-semibold text-(--terminal-foreground)">{props.session.name}</span>
            <span>{"\u2022"}</span>
            <span>{connectionState()}</span>
            <span>{"\u2022"}</span>
            <span>{props.session.cols}x{props.session.rows}</span>
          </div>
          <div class="flex min-w-0 flex-wrap items-center gap-2 text-[0.62rem] leading-4 text-(--terminal-muted)">
            <Show when={agentSource()}>{(agent) => <span class="truncate">{agent().label}</span>}</Show>
            <span class="uppercase tracking-[0.08em]">{props.session.status}</span>
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <Show when={readOnly()}>
            <TerminalBadge tone="warning">read-only</TerminalBadge>
          </Show>
          <Show when={agentSource() && props.session.inputOverride === true}>
            <TerminalBadge tone="success">override on</TerminalBadge>
            <ActionButton tooltip="Return input control to the agent" ariaLabel="Release terminal input override" variant="ghost" class="h-7 rounded-md px-2 text-[0.68rem] text-(--terminal-muted) hover:bg-(--terminal-hover) hover:text-(--terminal-foreground)" onClick={() => setInputOverride(false)}>
              Release Override
            </ActionButton>
          </Show>
          <Show when={pipeWarningLabel()}>
            {(label) => <WarningBadge label={label()} />}
          </Show>
          {terminalStore.state.searchOpen && (
            <TerminalSearch
              onNext={() => renderer()?.findNext(terminalStore.state.searchQuery)}
              onPrevious={() => renderer()?.findPrevious(terminalStore.state.searchQuery)}
            />
          )}
          <ActionButton tooltip="Search terminal" ariaLabel="Search terminal" variant="ghost" size="icon" class="h-7 w-7 rounded-lg text-(--terminal-muted) hover:bg-(--terminal-hover) hover:text-(--terminal-foreground)" icon={<Search class="h-3.5 w-3.5" />} onClick={openTerminalSearch} />
          <ActionButton tooltip="Split terminal right" ariaLabel="Split terminal right" variant="ghost" size="icon" class="h-7 w-7 rounded-lg text-(--terminal-muted) hover:bg-(--terminal-hover) hover:text-(--terminal-foreground)" icon={<SplitSquareVertical class="h-3.5 w-3.5" />} onClick={props.onSplitVertical} />
          <ActionButton tooltip="Split terminal down" ariaLabel="Split terminal down" variant="ghost" size="icon" class="h-7 w-7 rounded-lg text-(--terminal-muted) hover:bg-(--terminal-hover) hover:text-(--terminal-foreground)" icon={<SplitSquareHorizontal class="h-3.5 w-3.5" />} onClick={props.onSplitHorizontal} />
          <ActionButton tooltip="Restart terminal" ariaLabel="Restart terminal" variant="ghost" size="icon" class="h-7 w-7 rounded-lg text-(--terminal-muted) hover:bg-(--terminal-hover) hover:text-(--terminal-foreground)" icon={<Maximize2 class="h-3.5 w-3.5" />} onClick={() => harnessStore.actions.sendCommand({
            type: "terminal.session.restart",
            requestId: createRequestId(),
            payload: {
              projectId: props.session.projectId,
              sessionId: props.session.id,
              cols: props.session.cols,
              rows: props.session.rows
            }
          })} />
          <ActionButton tooltip="Stop terminal" ariaLabel="Stop terminal" variant="ghost" size="icon" class="h-7 w-7 rounded-lg text-(--terminal-muted) hover:bg-(--terminal-hover) hover:text-(--terminal-foreground)" icon={<Square class="h-3.5 w-3.5" />} onClick={() => harnessStore.actions.sendCommand({
            type: "terminal.session.stop",
            requestId: createRequestId(),
            payload: {
              projectId: props.session.projectId,
              sessionId: props.session.id
            }
          })} />
        </div>
      </div>
      <Show when={readOnly()}>
        <div class="flex shrink-0 items-center justify-between gap-3 border-b border-(--terminal-warning-border) bg-(--terminal-warning-bg) px-3 py-2 text-[0.72rem] text-(--terminal-warning-text)">
          <div class="flex min-w-0 items-center gap-2">
            <AlertTriangle class="h-3.5 w-3.5 shrink-0" />
            <span class="truncate">Caution: {lockReason()}</span>
          </div>
          <ActionButton tooltip="Override terminal input lock" ariaLabel="Override terminal input lock" variant="secondary" class="h-7 shrink-0 rounded-md border-(--terminal-warning-border) bg-(--terminal-warning-button) px-3 text-[0.68rem] text-(--terminal-foreground) hover:bg-(--terminal-warning-button-hover)" onClick={() => setInputOverride(true)}>
            Override Lock
          </ActionButton>
        </div>
      </Show>
      <div class="min-h-0 flex-1 bg-(--terminal-shell)">
        {shouldUseSolidTerminalRenderer(terminalStore.state.preferences.rendererMode) ? (
          <SolidTerminalRendererPrototype
            output={props.output}
            readOnly={readOnly()}
            backspaceInput={backspaceInput()}
            onInput={(input) => sendTerminalInput(props.session.id, input)}
          />
        ) : (
          <XtermRenderer
            sessionId={props.session.id}
            output={props.output}
            outputDelta={terminalStore.state.outputDeltaBySessionId[props.session.id]}
            outputVersion={terminalStore.state.outputVersionBySessionId[props.session.id]}
            outputResetVersion={terminalStore.state.outputResetVersionBySessionId[props.session.id]}
            searchQuery={terminalStore.state.searchQuery}
            copyOnSelect={terminalStore.state.preferences.copyOnSelect}
            ctrlCMode={terminalStore.state.preferences.ctrlCMode}
            sessionCwd={props.session.cwd}
            projectRoot={activeProject()?.rootPath ?? props.session.cwd}
            onOpenFile={(path, line, column) => harnessStore.openIdeFile(path, line, column)}
            onReady={setRenderer}
            onResize={resize}
            readOnly={readOnly()}
            backspaceInput={backspaceInput()}
          />
        )}
      </div>
    </section>
  );
}

function TerminalBadge(props: { tone: "success" | "warning"; children: string }) {
  return (
    <span
      class="inline-flex h-6 shrink-0 items-center rounded-md border px-2 text-[0.62rem] font-semibold uppercase tracking-[0.08em]"
      classList={{
        "border-(--terminal-warning-border) bg-(--terminal-warning-bg) text-(--terminal-warning-text)": props.tone === "warning",
        "border-(--success-strong) bg-[color-mix(in_srgb,var(--success)_15%,transparent)] text-(--success-strong)": props.tone === "success"
      }}
    >
      {props.children}
    </span>
  );
}

function WarningBadge(props: { label: string }) {
  return (
    <span class="inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-(--terminal-warning-border) bg-(--terminal-warning-bg) px-2 text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-(--terminal-warning-text)">
      <AlertTriangle class="h-3 w-3" />
      {props.label}
    </span>
  );
}
