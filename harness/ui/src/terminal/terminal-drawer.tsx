import { Match, Switch, createEffect, createMemo, createSignal, onMount } from "solid-js";
import { ClipboardCheck, ChevronDown, Copy, Plus, RotateCw, Search, Settings2, Square, TerminalSquare } from "lucide-solid";
import { createRequestId, type CliSession, type TerminalEnvVar, type TerminalSession } from "../../../shared/protocol";
import { harnessStore, getActiveProject, type ViewProjectState } from "../harness-store";
import { sendCliSessionInput } from "../harness-websocket";
import { ActionButton } from "../components/action-button";
import { DropdownControl } from "../components/primitives/dropdown";
import { Input } from "../components/primitives/input";
import { Textarea } from "../components/primitives/textarea";
import { Dialog } from "../components/primitives/dialog";
import { terminalStore } from "./terminal-store";
import { TerminalTabs, type TerminalTabItem } from "./terminal-tabs";
import { TerminalSplitLayout, createDefaultTerminalLayout } from "./terminal-split-layout";
import { TerminalSearch } from "./terminal-search";
import { XtermRenderer, type XtermRendererHandle } from "./renderers/xterm-renderer";
import { SolidTerminalRendererPrototype } from "./renderers/solid-renderer-prototype";

type DrawerSession =
  | {
      kind: "terminal";
      id: string;
      name: string;
      status: TerminalSession["status"];
      startedAt: string;
      session: TerminalSession;
    }
  | {
      kind: "cli";
      id: string;
      name: string;
      status: CliSession["status"];
      startedAt: string;
      session: CliSession;
    };

export function TerminalDrawer() {
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [shellId, setShellId] = createSignal("");
  const [envText, setEnvText] = createSignal("");
  const activeProject = () => getActiveProject(harnessStore.state);
  const projectTerminalSessions = createMemo(() => {
    const project = activeProject();
    return project ? terminalStore.state.sessions.filter((session) => session.projectId === project.id) : [];
  });
  const drawerSessions = createMemo<DrawerSession[]>(() => {
    const project = activeProject();
    if (!project) {
      return [];
    }
    return [
      ...projectTerminalSessions().map((session): DrawerSession => ({
        kind: "terminal",
        id: session.id,
        name: session.name,
        status: session.status,
        startedAt: session.startedAt,
        session
      })),
      ...(project.cliSessions ?? []).map((session): DrawerSession => ({
        kind: "cli",
        id: session.id,
        name: formatCliSessionName(session, project),
        status: session.status,
        startedAt: session.startedAt,
        session
      }))
    ].sort((left, right) => left.startedAt.localeCompare(right.startedAt));
  });
  const tabItems = createMemo<TerminalTabItem[]>(() =>
    drawerSessions().map((session) => ({
      id: session.id,
      name: session.name,
      status: session.status,
      renamable: session.kind === "terminal"
    }))
  );
  const activeEntry = () =>
    drawerSessions().find((session) => session.id === terminalStore.state.focusedSessionId) ?? drawerSessions()[0];
  const activeTerminalSession = () => {
    const entry = activeEntry();
    return entry?.kind === "terminal" ? entry.session : undefined;
  };

  onMount(() => {
    harnessStore.actions.sendCommand({ type: "terminal.shells.list", requestId: createRequestId() });
  });

  createEffect(() => {
    const sessions = drawerSessions();
    if (!sessions.length) {
      terminalStore.focusSession(undefined);
      return;
    }
    if (!terminalStore.state.focusedSessionId || !sessions.some((session) => session.id === terminalStore.state.focusedSessionId)) {
      terminalStore.focusSession(sessions[0].id);
    }
  });

  createEffect(() => {
    const entry = activeEntry();
    if (!entry) {
      return;
    }
    if (entry.kind === "terminal") {
      if (terminalStore.state.connectedBySessionId[entry.id]) {
        return;
      }
      harnessStore.actions.sendCommand({
        type: "terminal.session.attach",
        requestId: createRequestId(),
        payload: {
          projectId: entry.session.projectId,
          sessionId: entry.session.id
        }
      });
      return;
    }
    if (
      (entry.session.status === "running" || entry.session.status === "starting") &&
      !harnessStore.state.cliSessionTerminal[entry.id]?.connected
    ) {
      harnessStore.actions.sendCommand({
        type: "cli-session.attach",
        requestId: createRequestId(),
        payload: {
          projectId: entry.session.projectId,
          threadId: entry.session.threadId,
          sessionId: entry.session.id
        }
      });
    }
  });

  const createSession = () => {
    const project = activeProject();
    if (!project) {
      return;
    }
    const parsedEnv = parseEnvText(envText());
    harnessStore.actions.sendCommand({
      type: "terminal.session.create",
      requestId: createRequestId(),
      payload: {
        projectId: project.id,
        shellId: shellId() || terminalStore.state.preferences.defaultShellId,
        cols: activeEntry()?.session.cols ?? 100,
        rows: activeEntry()?.session.rows ?? 24,
        env: parsedEnv.length ? parsedEnv : undefined
      }
    });
  };

  const closeSession = (session: TerminalSession) => {
    const running = session.status === "running" || session.status === "starting";
    if (running && !window.confirm(`Stop and close ${session.name}?`)) {
      return;
    }
    harnessStore.actions.sendCommand({
      type: "terminal.session.close",
      requestId: createRequestId(),
      payload: {
        projectId: session.projectId,
        sessionId: session.id
      }
    });
  };

  const closeEntry = (sessionId: string) => {
    const entry = drawerSessions().find((session) => session.id === sessionId);
    if (!entry) {
      return;
    }
    if (entry.kind === "terminal") {
      closeSession(entry.session);
      return;
    }
    const running = entry.session.status === "running" || entry.session.status === "starting";
    if (running && !window.confirm(`Stop and close ${entry.name}?`)) {
      return;
    }
    harnessStore.actions.sendCommand({
      type: "cli-session.stop",
      requestId: createRequestId(),
      payload: {
        projectId: entry.session.projectId,
        threadId: entry.session.threadId,
        sessionId: entry.session.id
      }
    });
  };

  const savePreferences = () => {
    harnessStore.actions.sendCommand({
      type: "terminal.preferences.save",
      requestId: createRequestId(),
      payload: {
        preferences: {
          ...terminalStore.state.preferences,
          defaultShellId: shellId() || terminalStore.state.preferences.defaultShellId
        },
        layout: terminalStore.state.layout ?? createDefaultTerminalLayout(activeTerminalSession()?.id)
      }
    });
  };

  const startResize = (event: PointerEvent) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = terminalStore.state.height;
    const onPointerMove = (moveEvent: PointerEvent) => {
      terminalStore.setHeight(startHeight - (moveEvent.clientY - startY));
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  };

  return (
    <>
      <section
        data-test-terminal-drawer=""
        class="fixed inset-x-0 bottom-0 z-40 flex min-h-0 flex-col border-t border-(--border) bg-(--panel) shadow-2xl transition-transform"
        classList={{ "translate-y-full": !terminalStore.state.open }}
        style={{ height: `${terminalStore.state.height}px` }}
      >
        <button
          type="button"
          class="h-2 cursor-row-resize border-b border-(--border) bg-transparent transition hover:bg-(--panel-strong)"
          aria-label="Resize terminal drawer"
          onPointerDown={startResize}
        />
        <header class="flex h-11 shrink-0 items-center gap-2 border-b border-(--border) px-3">
          <TerminalSquare class="h-4 w-4 shrink-0 text-(--muted)" />
          <TerminalTabs
            sessions={tabItems()}
            activeSessionId={activeEntry()?.id}
            onCreate={createSession}
            onSelect={terminalStore.focusSession}
            onRename={(sessionId, name) => {
              const session = projectTerminalSessions().find((entry) => entry.id === sessionId);
              if (!session) {
                return;
              }
              harnessStore.actions.sendCommand({
                type: "terminal.session.rename",
                requestId: createRequestId(),
                payload: {
                  projectId: session.projectId,
                  sessionId,
                  name
                }
              });
            }}
            onClose={closeEntry}
          />
          <div class="flex shrink-0 items-center gap-1">
            <DropdownControl
              kind="select"
              icon={<TerminalSquare class="h-3.5 w-3.5" />}
              ariaLabel="Select terminal shell"
              value={shellId() || terminalStore.state.preferences.defaultShellId || ""}
              options={terminalStore.state.shells.map((shell) => ({
                value: shell.id,
                label: shell.label,
                description: shell.available ? shell.executableLabel : "Unavailable",
                disabled: !shell.available
              }))}
              onChange={(value) => setShellId(value)}
              class="w-40"
            />
            <ActionButton tooltip="New terminal" ariaLabel="New terminal" variant="secondary" size="icon" class="h-8 w-8 rounded-lg" icon={<Plus class="h-4 w-4" />} onClick={createSession} />
            <ActionButton tooltip="Terminal preferences" ariaLabel="Terminal preferences" variant="ghost" size="icon" class="h-8 w-8 rounded-lg" icon={<Settings2 class="h-4 w-4" />} onClick={() => setSettingsOpen(true)} />
            <ActionButton tooltip="Copy terminal buffer" ariaLabel="Copy terminal buffer" variant="ghost" size="icon" class="h-8 w-8 rounded-lg" icon={<Copy class="h-4 w-4" />} onClick={() => {
              const entry = activeEntry();
              if (entry?.kind === "terminal") {
                void navigator.clipboard?.writeText(terminalStore.state.outputBySessionId[entry.id] ?? "");
              } else if (entry?.kind === "cli") {
                const terminal = harnessStore.state.cliSessionTerminal[entry.id];
                void navigator.clipboard?.writeText(`${terminal?.stdout ?? ""}${terminal?.stderr ?? ""}`);
              }
            }} />
            <ActionButton tooltip="Close terminal drawer" ariaLabel="Close terminal drawer" variant="ghost" size="icon" class="h-8 w-8 rounded-lg" icon={<ChevronDown class="h-4 w-4" />} onClick={() => terminalStore.setOpen(false)} />
          </div>
        </header>
        <div class="min-h-0 flex-1 p-1">
          <Switch fallback={<div class="flex h-full items-center justify-center text-xs text-(--muted)">No terminal session.</div>}>
            <Match when={activeEntry()?.kind === "cli" ? activeEntry() : undefined}>
              {(entry) => (
                <CliSessionDrawerPane
                  session={(entry() as Extract<DrawerSession, { kind: "cli" }>).session}
                  name={entry().name}
                />
              )}
            </Match>
            <Match when={activeEntry()?.kind === "terminal"}>
              <TerminalSplitLayout sessions={projectTerminalSessions()} />
            </Match>
          </Switch>
        </div>
      </section>
      <Dialog
        open={settingsOpen()}
        title="Terminal Preferences"
        description="Configure integrated terminal defaults."
        onClose={() => setSettingsOpen(false)}
        footer={
          <ActionButton tooltip="Save terminal preferences" variant="secondary" onClick={() => { savePreferences(); setSettingsOpen(false); }}>
            Save
          </ActionButton>
        }
      >
        <div class="grid gap-4">
          <label class="grid gap-1 text-xs font-medium">
            Scrollback limit
            <Input
              type="number"
              min="1000"
              max="200000"
              value={terminalStore.state.preferences.scrollbackLimit}
              onInput={(event) => terminalStore.applyServerEvent({
                type: "terminal.preferences.saved",
                requestId: createRequestId(),
                payload: {
                  preferences: {
                    ...terminalStore.state.preferences,
                    scrollbackLimit: Math.max(1000, Math.min(200000, Number(event.currentTarget.value) || 10000))
                  },
                  layout: terminalStore.state.layout
                }
              })}
            />
          </label>
          <label class="grid gap-1 text-xs font-medium">
            Environment variables
            <Textarea rows="5" value={envText()} placeholder={"NAME=value\nSECRET_TOKEN=***"} onInput={(event) => setEnvText(event.currentTarget.value)} />
          </label>
        </div>
      </Dialog>
    </>
  );
}

function CliSessionDrawerPane(props: { session: CliSession; name: string }) {
  const [renderer, setRenderer] = createSignal<XtermRendererHandle>();
  const activeProject = () => getActiveProject(harnessStore.state);
  const terminalState = () => harnessStore.state.cliSessionTerminal[props.session.id];
  const output = () => `${terminalState()?.stdout ?? ""}${terminalState()?.stderr ?? ""}`;

  const stopSession = () => {
    harnessStore.actions.sendCommand({
      type: "cli-session.stop",
      requestId: createRequestId(),
      payload: {
        projectId: props.session.projectId,
        threadId: props.session.threadId,
        sessionId: props.session.id
      }
    });
  };

  const attachSession = () => {
    harnessStore.actions.sendCommand({
      type: "cli-session.attach",
      requestId: createRequestId(),
      payload: {
        projectId: props.session.projectId,
        threadId: props.session.threadId,
        sessionId: props.session.id
      }
    });
  };

  const captureVisibleState = () => {
    const terminal = terminalState();
    if (!terminal) {
      return;
    }
    harnessStore.actions.sendCommand({
      type: "cli-session.capture-visible-buffer",
      requestId: createRequestId(),
      payload: {
        projectId: props.session.projectId,
        threadId: props.session.threadId,
        sessionId: props.session.id,
        visibleBuffer: terminal.stdout.slice(-64_000),
        stderrTail: terminal.stderr.slice(-32_000)
      }
    });
  };

  return (
    <section class="flex h-full min-h-0 min-w-0 flex-1 flex-col border border-(--border) bg-(--panel)" data-test-cli-terminal-pane={props.session.id}>
      <div class="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-(--border) px-2">
        <div class="flex min-w-0 items-center gap-2 text-[0.68rem] text-(--muted)">
          <span class="truncate font-semibold text-(--foreground)">{props.name}</span>
          <span>{terminalState()?.connected ? "attached" : "detached"}</span>
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
          <ActionButton tooltip="Reconnect CLI terminal" ariaLabel="Reconnect CLI terminal" variant="ghost" size="icon" class="h-7 w-7 rounded-lg" icon={<RotateCw class="h-3.5 w-3.5" />} onClick={attachSession} />
          <ActionButton tooltip="Capture current terminal state for follow-up" ariaLabel="Capture CLI terminal state" variant="ghost" size="icon" class="h-7 w-7 rounded-lg" icon={<ClipboardCheck class="h-3.5 w-3.5" />} onClick={captureVisibleState} />
          <ActionButton tooltip="Stop CLI terminal" ariaLabel="Stop CLI terminal" variant="ghost" size="icon" class="h-7 w-7 rounded-lg" icon={<Square class="h-3.5 w-3.5" />} onClick={stopSession} />
        </div>
      </div>
      <div class="min-h-0 flex-1 bg-(--panel-strong)">
        {terminalStore.state.preferences.rendererMode === "solid-prototype" ? (
          <SolidTerminalRendererPrototype output={output()} />
        ) : (
          <XtermRenderer
            sessionId={props.session.id}
            output={output()}
            searchQuery={terminalStore.state.searchQuery}
            copyOnSelect={terminalStore.state.preferences.copyOnSelect}
            ctrlCMode={terminalStore.state.preferences.ctrlCMode}
            sessionCwd={props.session.cwd}
            projectRoot={activeProject()?.rootPath ?? props.session.cwd}
            onOpenFile={(path, line, column) => harnessStore.openIdeFile(path, line, column)}
            onInput={(input) => sendCliSessionInput(props.session.id, input)}
            onReady={setRenderer}
          />
        )}
      </div>
    </section>
  );
}

function formatCliSessionName(session: CliSession, project: ViewProjectState) {
  const agentLabel = session.agentId === "codex-cli" ? "Codex CLI" : "Copilot CLI";
  const threadTitle = project.threads.find((thread) => thread.id === session.threadId)?.title;
  const suffix = threadTitle ?? session.runId ?? session.threadId;
  return `${agentLabel} - ${suffix}`.slice(0, 128);
}

function parseEnvText(input: string): TerminalEnvVar[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 64)
    .map((line) => {
      const [name, ...valueParts] = line.split("=");
      return {
        name,
        value: valueParts.join("="),
        secret: /\b(secret|token|key|password)\b/i.test(name)
      };
    })
    .filter((entry) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(entry.name));
}
