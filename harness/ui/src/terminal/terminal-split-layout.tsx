import { For, Show } from "solid-js";
import { createRequestId, type TerminalPaneLayout, type TerminalSession } from "../../../shared/protocol";
import { harnessStore } from "../harness-store";
import { terminalStore } from "./terminal-store";
import { TerminalPane } from "./terminal-pane";

export function createDefaultTerminalLayout(sessionId?: string): TerminalPaneLayout {
  return {
    type: "leaf",
    id: crypto.randomUUID(),
    sessionId
  };
}

export function TerminalSplitLayout(props: { sessions: TerminalSession[] }) {
  const activeSession = () =>
    props.sessions.find((session) => session.id === terminalStore.state.focusedSessionId) ?? props.sessions[0];

  const saveLayout = (layout: TerminalPaneLayout) => {
    terminalStore.setLayout(layout);
    harnessStore.actions.sendCommand({
      type: "terminal.preferences.save",
      requestId: createRequestId(),
      payload: {
        preferences: terminalStore.state.preferences,
        layout
      }
    });
  };

  const startSplitResize = (event: PointerEvent) => {
    const currentLayout = layout();
    if (!currentLayout || currentLayout.type !== "split") {
      return;
    }
    event.preventDefault();
    const container = (event.currentTarget as HTMLElement | null)?.parentElement;
    if (!container) {
      return;
    }
    const startSizes = currentLayout.sizes.length >= 2 ? currentLayout.sizes : [50, 50];
    const startX = event.clientX;
    const startY = event.clientY;
    const rect = container.getBoundingClientRect();
    const axisSize = currentLayout.direction === "horizontal" ? rect.height : rect.width;
    let nextSizes: [number, number] = [startSizes[0], startSizes[1]];
    let didMove = false;
    let animationFrame: number | undefined;
    const applyPreview = () => {
      animationFrame = undefined;
      terminalStore.setLayout({ ...currentLayout, sizes: nextSizes });
    };
    const onPointerMove = (moveEvent: PointerEvent) => {
      const delta = currentLayout.direction === "horizontal" ? moveEvent.clientY - startY : moveEvent.clientX - startX;
      const deltaPercent = axisSize > 0 ? (delta / axisSize) * 100 : 0;
      const first = Math.max(20, Math.min(80, startSizes[0] + deltaPercent));
      nextSizes = [first, 100 - first];
      didMove = true;
      if (animationFrame === undefined) {
        animationFrame = window.requestAnimationFrame(applyPreview);
      }
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      if (animationFrame !== undefined) {
        window.cancelAnimationFrame(animationFrame);
      }
      if (didMove) {
        saveLayout({ ...currentLayout, sizes: nextSizes });
      }
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  };

  const split = (direction: "horizontal" | "vertical") => {
    const current = activeSession();
    if (!current) {
      return;
    }
    const other = props.sessions.find((session) => session.id !== current.id) ?? current;
    saveLayout({
      type: "split",
      id: crypto.randomUUID(),
      direction,
      sizes: [50, 50],
      children: [
        { type: "leaf", id: crypto.randomUUID(), sessionId: current.id },
        { type: "leaf", id: crypto.randomUUID(), sessionId: other.id }
      ]
    });
  };

  const renderLeaf = (session: TerminalSession) => (
    <TerminalPane
      session={session}
      output={terminalStore.state.outputBySessionId[session.id] ?? ""}
      connected={terminalStore.state.connectedBySessionId[session.id] === true}
      onSplitHorizontal={() => split("horizontal")}
      onSplitVertical={() => split("vertical")}
    />
  );

  const layout = () => terminalStore.state.layout;
  const splitSessions = () => {
    const currentLayout = layout();
    if (!currentLayout || currentLayout.type === "leaf") {
      return [];
    }
    return currentLayout.children
      .map((child) => child.type === "leaf" && child.sessionId ? props.sessions.find((session) => session.id === child.sessionId) : undefined)
      .filter((session): session is TerminalSession => session !== undefined);
  };

  const splitSize = (index: number) => {
    const currentLayout = layout();
    if (!currentLayout || currentLayout.type !== "split") {
      return "50%";
    }
    return `${currentLayout.sizes[index] ?? 50}%`;
  };

  return (
    <Show when={activeSession()} fallback={<div class="flex h-full items-center justify-center text-xs text-(--terminal-muted)">No terminal session.</div>}>
      {(session) => (
        <Show when={splitSessions().length > 1} fallback={renderLeaf(session())}>
          <div class={layoutDirection() === "horizontal" ? "flex h-full min-h-0 flex-col" : "flex h-full min-w-0"}>
            <For each={splitSessions()}>
              {(entry, index) => (
                <>
                  <div class="min-h-0 min-w-0" style={{ flex: `0 0 ${splitSize(index())}` }}>{renderLeaf(entry)}</div>
                  <Show when={index() === 0}>
                    <button
                      type="button"
                      aria-label="Resize terminal split"
                      class={
                        layoutDirection() === "horizontal"
                          ? "h-1 shrink-0 cursor-row-resize bg-(--terminal-border) hover:bg-(--accent)"
                          : "w-1 shrink-0 cursor-col-resize bg-(--terminal-border) hover:bg-(--accent)"
                      }
                      onPointerDown={startSplitResize}
                    />
                  </Show>
                </>
              )}
            </For>
          </div>
        </Show>
      )}
    </Show>
  );
}

function layoutDirection(layout: TerminalPaneLayout | undefined = terminalStore.state.layout) {
  return layout?.type === "split" ? layout.direction : undefined;
}
