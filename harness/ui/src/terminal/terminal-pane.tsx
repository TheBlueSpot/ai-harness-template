import { createSignal } from "solid-js";
import { Maximize2, Search, SplitSquareHorizontal, SplitSquareVertical, Square } from "lucide-solid";
import { createRequestId, type TerminalSession } from "../../../shared/protocol";
import { getActiveProject, harnessStore } from "../harness-store";
import { ActionButton } from "../components/action-button";
import { terminalStore } from "./terminal-store";
import { XtermRenderer, type XtermRendererHandle } from "./renderers/xterm-renderer";
import { SolidTerminalRendererPrototype } from "./renderers/solid-renderer-prototype";
import { TerminalSearch } from "./terminal-search";

export function TerminalPane(props: {
  session: TerminalSession;
  output: string;
  connected: boolean;
  onSplitHorizontal: () => void;
  onSplitVertical: () => void;
}) {
  const [renderer, setRenderer] = createSignal<XtermRendererHandle>();
  const activeProject = () => getActiveProject(harnessStore.state);

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

  return (
    <section class="flex min-h-0 min-w-0 flex-1 flex-col border border-(--border) bg-(--panel)" data-test-terminal-pane={props.session.id}>
      <div class="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-(--border) px-2">
        <div class="flex min-w-0 items-center gap-2 text-[0.68rem] text-(--muted)">
          <span class="truncate font-semibold text-(--foreground)">{props.session.name}</span>
          <span>{props.connected ? "attached" : "detached"}</span>
          <span>{props.session.cols}x{props.session.rows}</span>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          {terminalStore.state.searchOpen && (
            <TerminalSearch
              onNext={() => renderer()?.findNext(terminalStore.state.searchQuery)}
              onPrevious={() => renderer()?.findPrevious(terminalStore.state.searchQuery)}
            />
          )}
          <ActionButton tooltip="Search terminal" ariaLabel="Search terminal" variant="ghost" size="icon" class="h-7 w-7 rounded-lg" icon={<Search class="h-3.5 w-3.5" />} onClick={() => terminalStore.setSearch(true)} />
          <ActionButton tooltip="Split terminal right" ariaLabel="Split terminal right" variant="ghost" size="icon" class="h-7 w-7 rounded-lg" icon={<SplitSquareVertical class="h-3.5 w-3.5" />} onClick={props.onSplitVertical} />
          <ActionButton tooltip="Split terminal down" ariaLabel="Split terminal down" variant="ghost" size="icon" class="h-7 w-7 rounded-lg" icon={<SplitSquareHorizontal class="h-3.5 w-3.5" />} onClick={props.onSplitHorizontal} />
          <ActionButton tooltip="Restart terminal" ariaLabel="Restart terminal" variant="ghost" size="icon" class="h-7 w-7 rounded-lg" icon={<Maximize2 class="h-3.5 w-3.5" />} onClick={() => harnessStore.actions.sendCommand({
            type: "terminal.session.restart",
            requestId: createRequestId(),
            payload: {
              projectId: props.session.projectId,
              sessionId: props.session.id,
              cols: props.session.cols,
              rows: props.session.rows
            }
          })} />
          <ActionButton tooltip="Stop terminal" ariaLabel="Stop terminal" variant="ghost" size="icon" class="h-7 w-7 rounded-lg" icon={<Square class="h-3.5 w-3.5" />} onClick={() => harnessStore.actions.sendCommand({
            type: "terminal.session.stop",
            requestId: createRequestId(),
            payload: {
              projectId: props.session.projectId,
              sessionId: props.session.id
            }
          })} />
        </div>
      </div>
      <div class="min-h-0 flex-1 bg-(--panel-strong)">
        {terminalStore.state.preferences.rendererMode === "solid-prototype" ? (
          <SolidTerminalRendererPrototype output={props.output} />
        ) : (
          <XtermRenderer
            sessionId={props.session.id}
            output={props.output}
            searchQuery={terminalStore.state.searchQuery}
            copyOnSelect={terminalStore.state.preferences.copyOnSelect}
            ctrlCMode={terminalStore.state.preferences.ctrlCMode}
            sessionCwd={props.session.cwd}
            projectRoot={activeProject()?.rootPath ?? props.session.cwd}
            onOpenFile={(path, line, column) => harnessStore.openIdeFile(path, line, column)}
            onReady={setRenderer}
            onResize={resize}
          />
        )}
      </div>
    </section>
  );
}
