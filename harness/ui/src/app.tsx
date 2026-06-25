import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show, type Component } from "solid-js";
import { createHotkeys, formatForDisplay } from "@tanstack/solid-hotkeys";
import type { CreateHotkeyDefinition } from "@tanstack/solid-hotkeys";
import { Bot, BriefcaseBusiness, Clock3, Cog, ExternalLink, FolderKanban, Maximize2, Menu, Minimize2, Pause, Play, PanelsTopLeft, Workflow, CircleQuestionMark, X } from "lucide-solid";
import { createRequestId } from "../../shared/protocol";
import { AssistantEditorDialog } from "./components/assistant-editor-dialog";
import { AssistantsPanel } from "./components/assistants-panel";
import { BackgroundJobEditorDialog } from "./components/background-job-editor-dialog";
import { BackgroundJobsPanel } from "./components/background-jobs-panel";
import { ChatPanel } from "./components/chat-panel";
import { ConnectionBanner } from "./components/connection-banner";
import { ExecutionPlanDialog } from "./components/execution-plan-dialog";
import { HelpTutorialDialog } from "./components/help-tutorial-dialog";
import { NotificationInbox } from "./components/notification-inbox";
import { PreferenceSectionNav, PreferencesPanel } from "./components/preferences-modal";
import { ProjectSidebar } from "./components/project-sidebar";
import { ProjectSwitcherDialog } from "./components/project-switcher-dialog";
import { Toaster } from "./components/toaster";
import { TracePanel, TracePeekRail } from "./components/trace-panel";
import { getTutorialDefinition } from "./components/tutorial-definitions";
import { TutorialOverlay } from "./components/tutorial-overlay";
import { ActionButton } from "./components/action-button";
import { LeftPaneShell } from "./components/primitives/left-pane";
import { SheetContent, SheetRoot, SheetTrigger } from "./components/primitives/sheet";
import { Tooltip } from "./components/primitives/tooltip";
import { connectHarnessWebSocket } from "./harness-websocket";
import { harnessStore, type AssistantEditorDraft, type BackgroundJobEditorDraft, type HarnessLeftTab, type MainPanelSizes } from "./harness-store";
import { IdeWorkbench } from "./ide/ide-workbench";
import { ideStore } from "./ide/ide-store";
import { resolveBrowserTimezone } from "./lib/time-format";
import { appHotkeySettings, currentTabItemHotkeyIds, normalizeAppHotkeyPreferences, type AppHotkeyId } from "./lib/app-hotkeys";
import { selectCurrentTabItem } from "./lib/current-tab-item-hotkeys";
import { createIdeWindowUrl, IDE_POP_IN_EVENT, OPEN_IDE_WINDOW_EVENT, type OpenIdeWindowInput } from "./lib/ide-window";
import { createCurrentToastSourceNavigation } from "./source-navigation";
import { TerminalDrawer } from "./terminal/terminal-drawer";
import { terminalStore } from "./terminal/terminal-store";
import { reportUiError, setDefaultToastSourceResolver } from "./toast-store";

type IdeWindowBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const IDE_WINDOW_STORAGE_KEY = "pi-harness:ide-window-state:v1";

export function App() {
  let connection: ReturnType<typeof connectHarnessWebSocket> | undefined;
  const persistedIdeWindow = readPersistedIdeWindowState();
  const [sidebarOpen, setSidebarOpen] = createSignal(false);
  const [ideWindowOpen, setIdeWindowOpen] = createSignal(persistedIdeWindow.open);
  const [ideWindowMaximized, setIdeWindowMaximized] = createSignal(persistedIdeWindow.maximized);
  const [ideWindowBounds, setIdeWindowBounds] = createSignal<IdeWindowBounds>(persistedIdeWindow.bounds);

  const openIdeVirtualWindow = () => {
    setIdeWindowOpen(true);
    harnessStore.setActiveSurface("ide");
  };
  const popOutIdeWindow = () => {
    const projectId = harnessStore.state.workspace.activeProjectId ?? undefined;
    const child = window.open(createIdeWindowUrl({ projectId }), "pi-harness-ide", "popup=yes,width=1280,height=860");
    child?.focus();
    closeIdeVirtualWindow();
  };
  const closeIdeVirtualWindow = () => {
    setIdeWindowOpen(false);
    setIdeWindowMaximized(false);
    if (harnessStore.state.activeSurface === "ide") {
      harnessStore.setActiveSurface("chat");
    }
  };

  const appHotkeys = (): CreateHotkeyDefinition[] => {
    const hotkeys = normalizeAppHotkeyPreferences(harnessStore.state.appHotkeyPreferences);
    return appHotkeySettings.filter((setting) => setting.id !== "focusCurrentSearch" && setting.scope !== "ide").flatMap((setting) =>
      hotkeys[setting.id].map((hotkey) => ({
        hotkey: hotkey as CreateHotkeyDefinition["hotkey"],
        callback: () => handleAppHotkey(setting.id, { openIde: openIdeVirtualWindow }),
        options: {
          meta: {
            name: setting.label,
            description: setting.description
          }
        }
      }))
    );
  };
  const projectSwitcherHotkeys = (): CreateHotkeyDefinition[] => {
    const hotkeys = normalizeAppHotkeyPreferences(harnessStore.state.appHotkeyPreferences);
    return hotkeys.openProjectSwitcher.map((hotkey) => ({
      hotkey: hotkey as CreateHotkeyDefinition["hotkey"],
      callback: () => handleAppHotkey("openProjectSwitcher"),
      options: {
        meta: {
          name: "Project switcher",
          description: "Open projects and active threads."
        }
      }
    }));
  };
  const searchHotkeys = (): CreateHotkeyDefinition[] => {
    const hotkeys = normalizeAppHotkeyPreferences(harnessStore.state.appHotkeyPreferences);
    return hotkeys.focusCurrentSearch.map((hotkey) => ({
      hotkey: hotkey as CreateHotkeyDefinition["hotkey"],
      callback: () => focusCurrentTabSearch(),
      options: {
        meta: {
          name: "Focus search",
          description: "Focus search for the current sidepanel"
        }
      }
    }));
  };

  createHotkeys(
    appHotkeys,
    () => ({
      enabled: harnessStore.state.activeSurface !== "ide" && !harnessStore.state.projectSwitcherOpen && !isProjectSwitcherInputFocused(),
      ignoreInputs: false,
      preventDefault: true,
      stopPropagation: true
    })
  );
  createHotkeys(
    projectSwitcherHotkeys,
    () => ({
      enabled: harnessStore.state.activeSurface === "ide" && !harnessStore.state.projectSwitcherOpen && !isProjectSwitcherInputFocused(),
      ignoreInputs: false,
      preventDefault: true,
      stopPropagation: true
    })
  );

  createEffect(() => {
    persistIdeWindowState({
      open: ideWindowOpen(),
      maximized: ideWindowMaximized(),
      bounds: ideWindowBounds()
    });
  });
  createHotkeys(
    searchHotkeys,
    () => ({
      enabled: harnessStore.state.activeSurface !== "ide" && !harnessStore.state.projectSwitcherOpen && !isProjectSwitcherInputFocused(),
      ignoreInputs: false,
      preventDefault: true,
      stopPropagation: true
    })
  );
  createHotkeys(
    () => [
      {
        hotkey: "Escape",
        callback: () => {
          if (harnessStore.state.projectSwitcherOpen) {
            harnessStore.closeProjectSwitcher();
            return;
          }
          if (closeIdeOverlay()) {
            return;
          }
          closeIdeVirtualWindow();
        },
        options: {
          meta: {
            name: "Close IDE",
            description: "Close the IDE window"
          }
        }
      }
    ],
    () => ({
      enabled: harnessStore.state.activeSurface === "ide",
      ignoreInputs: false,
      preventDefault: true,
      stopPropagation: true
    })
  );

  onMount(() => {
    harnessStore.hydrateLocalPreferences();
    harnessStore.actions.hydrateBrowserUiSession();
    harnessStore.hydrateTutorialProgress();
    setDefaultToastSourceResolver(() => createCurrentToastSourceNavigation(harnessStore.state));
    connection = connectHarnessWebSocket();
    harnessStore.actions.setCommandDispatcher((command) => connection?.sendCommand(command));
    if (window.location.pathname === "/ide") {
      harnessStore.setActiveSurface("ide");
      applyIdeRouteSelection();
    } else if (ideWindowOpen()) {
      harnessStore.setActiveSurface("ide");
    }
    const onOpenIdeWindow = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail as OpenIdeWindowInput : {};
      openIdeVirtualWindow();
      applyIdeSelection(detail);
    };

    const onWindowError = (event: ErrorEvent) => {
      if (isResizeObserverLoopError(event.message)) {
        event.preventDefault();
        return;
      }
      console.error("Unexpected UI error", event.error ?? event.message);
      reportUiError(event.error ?? event.message, "Unexpected UI error", { rethrow: "never" });
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error("Unhandled promise rejection", event.reason);
      reportUiError(event.reason, "Unhandled promise rejection", { rethrow: "never" });
    };

    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    window.addEventListener(OPEN_IDE_WINDOW_EVENT, onOpenIdeWindow);
    window.addEventListener(IDE_POP_IN_EVENT, onOpenIdeWindow);

    onCleanup(() => {
      setDefaultToastSourceResolver(undefined);
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      window.removeEventListener(OPEN_IDE_WINDOW_EVENT, onOpenIdeWindow);
      window.removeEventListener(IDE_POP_IN_EVENT, onOpenIdeWindow);
    });
  });

  onCleanup(() => {
    harnessStore.actions.setCommandDispatcher(undefined);
    connection?.dispose();
  });

  const state = harnessStore.state;
  const activeLeftTab = createMemo(() => state.activeLeftTab);
  const activeLeftTabDefinition = createMemo(() => leftPaneTabs.find((tab) => tab.id === activeLeftTab()) ?? leftPaneTabs[0]);
  const isIdeFullPage = () => window.location.pathname === "/ide";
  const mainPanelGridStyle = () => ({
    "--left-panel-size": `${state.mainPanelSizes.left}fr`,
    "--center-panel-size": `${state.mainPanelSizes.center}fr`,
    "--right-panel-size": `${state.mainPanelSizes.right}fr`
  });
  const startPanelResize = (divider: "left" | "right", event: PointerEvent) => {
    if (window.innerWidth < 1024) {
      return;
    }

    event.preventDefault();
    const startX = event.clientX;
    const startSizes = { ...state.mainPanelSizes };
    const total = state.tracePanelMode === "open"
      ? startSizes.left + startSizes.center + startSizes.right
      : startSizes.left + startSizes.center;
    const pixelsPerFr = Math.max(80, window.innerWidth / total);

    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaFr = (moveEvent.clientX - startX) / pixelsPerFr;
      const nextSizes: MainPanelSizes = { ...startSizes };
      if (divider === "left") {
        nextSizes.left = startSizes.left + deltaFr;
        nextSizes.center = startSizes.center - deltaFr;
      } else {
        nextSizes.center = startSizes.center + deltaFr;
        nextSizes.right = startSizes.right - deltaFr;
      }
      harnessStore.setMainPanelSizes(nextSizes);
    };

    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  };
  const executionControlTooltip = () => {
    if (!state.executionControl.isPaused) {
      return "Pause new executions";
    }

    return `Resume new executions | queued ${state.executionControl.deferredPlanningQuestionCount} planner, ${state.executionControl.deferredAssistantQuestionCount} assistant, ${state.executionControl.deferredBrowserApprovalCount} browser`;
  };
  if (isIdeFullPage()) {
    const popInIdeWindow = () => {
      const opener = window.opener as Window | null;
      if (opener && !opener.closed) {
        opener.dispatchEvent(new CustomEvent(IDE_POP_IN_EVENT, { detail: { projectId: harnessStore.state.workspace.activeProjectId ?? undefined } }));
        opener.focus();
        window.close();
        return;
      }
      window.location.href = "/";
    };
    return (
      <main data-test-ide-page="" class="h-screen min-h-0 overflow-hidden bg-(--background)">
        <IdeWorkbench windowMode="popped-out" onToggleWindowMode={popInIdeWindow} />
        <Toaster />
      </main>
    );
  }

  return (
    <main data-test-app-shell="" class="app-zoom-shell relative overflow-auto px-2 py-2 md:px-3 md:py-3 lg:overflow-hidden">
      <div class="app-background" />
      <div class="mx-auto flex h-full min-h-0 flex-col gap-3">
        <header data-test-app-header="" class="panel-shell app-command-bar flex flex-col gap-2 rounded-xl px-3 py-2 md:flex-row md:items-center md:justify-between">
          <div class="flex min-w-0 items-center gap-3">
            <SheetRoot open={sidebarOpen()} onOpenChange={setSidebarOpen}>
              <div class="lg:hidden">
                <SheetTrigger
                  class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-(--border) bg-white/75 text-(--foreground)"
                  aria-label="Open projects"
                  data-tour-id="project-sidebar"
                  onClick={() => setSidebarOpen(true)}
                >
                  <Menu class="h-4 w-4" />
                </SheetTrigger>
                <SheetContent open={sidebarOpen()} onClose={() => setSidebarOpen(false)} title="Workspace" class="h-[100dvh]">
                  <TabbedLeftPane compact onNavigate={() => setSidebarOpen(false)} />
                </SheetContent>
              </div>
            </SheetRoot>

            <div class="min-w-0">
              <div class="flex min-w-0 items-center gap-2 text-[0.585rem] font-semibold uppercase tracking-[0.16em] text-(--muted)">
                <Workflow class="h-3.5 w-3.5" />
                <span class="truncate">AI harness workspace</span>
              </div>
              <div data-test-mobile-surface-label="" class="mt-1 inline-flex max-w-full items-center gap-1.5 rounded-md border border-(--border) bg-white/75 px-2 py-1 text-[0.625rem] font-semibold text-(--foreground) lg:hidden">
                {(() => {
                  const Icon = activeLeftTabDefinition().icon;
                  return <Icon class="h-3.5 w-3.5" />;
                })()}
                {activeLeftTabDefinition().label}
              </div>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <ConnectionBanner />
            <NotificationInbox />
            <ActionButton
              tooltip={executionControlTooltip()}
              icon={state.executionControl.isPaused ? <Play class="h-4 w-4" /> : <Pause class="h-4 w-4" />}
              variant="ghost"
              size="sm"
              class="execution-control-pill"
              classList={{
                "execution-control-pill-paused": state.executionControl.isPaused,
                "execution-control-pill-running": !state.executionControl.isPaused
              }}
              onClick={() =>
                harnessStore.actions.sendCommand({
                  type: state.executionControl.isPaused ? "execution.resume-all" : "execution.pause-all",
                  requestId: createRequestId()
                })
              }
            >
              {state.executionControl.isPaused ? "Resume" : "Pause"}
            </ActionButton>
            <ActionButton
              tooltip="Open guided help and tutorials"
              icon={<CircleQuestionMark class="h-4 w-4" />}
              variant="secondary"
              dataTourId="help-button"
              onClick={() => harnessStore.openHelpDialog()}
            >
            </ActionButton>
            <ActionButton
              tooltip={withPrimaryHotkey(`Trace panel: ${state.tracePanelMode}. Click to cycle closed, peek, open.`, "toggleTracePanel")}
              icon={<PanelsTopLeft class="h-4 w-4" />}
              variant="secondary"
              dataTourId="trace-panel-toggle"
              onClick={() => harnessStore.toggleTracePanel()}
            >
              <span class="hidden sm:inline">{state.tracePanelMode === "closed" ? "Trace" : state.tracePanelMode}</span>
            </ActionButton>
          </div>
        </header>

        <div
          data-test-main-panel-grid=""
          class="grid min-h-0 flex-1 auto-rows-min gap-4 lg:auto-rows-fr lg:gap-x-2"
          classList={{
            "lg:grid-cols-[minmax(0,var(--left-panel-size))_0.35rem_minmax(0,var(--center-panel-size))_0.35rem_minmax(0,var(--right-panel-size))]": state.tracePanelMode === "open",
            "lg:grid-cols-[minmax(0,var(--left-panel-size))_0.35rem_minmax(0,var(--center-panel-size))_0.35rem_12rem]": state.tracePanelMode === "peek",
            "lg:grid-cols-[minmax(0,var(--left-panel-size))_0.35rem_minmax(0,var(--center-panel-size))]": state.tracePanelMode === "closed"
          }}
          style={mainPanelGridStyle()}
        >
          <div class="hidden min-h-0 min-w-0 lg:block">
            <div data-tour-id="project-sidebar" class="h-full">
              <TabbedLeftPane />
            </div>
          </div>
          <PanelResizeHandle label="Resize left and center panels" onPointerDown={(event) => startPanelResize("left", event)} />
          <div class="min-h-0 min-w-0 overflow-visible lg:overflow-hidden">
            <Show
              when={activeLeftTab() === "jobs" || activeLeftTab() === "runs"}
              fallback={
                <Show
                  when={activeLeftTab() === "preferences"}
                  fallback={
                    <Show when={activeLeftTab() === "assistants"} fallback={<ChatPanel />}>
                      <AssistantsPanel variant="detail" />
                    </Show>
                  }
                >
                  <PreferencesPanel />
                </Show>
              }
            >
              <BackgroundJobsPanel variant="detail" segment={activeLeftTab() === "jobs" ? "jobs" : "runs"} />
            </Show>
          </div>
          <Show when={state.tracePanelMode !== "closed"}>
            <>
              <Show when={state.tracePanelMode === "open"} fallback={<div class="hidden lg:block" />}>
                <PanelResizeHandle label="Resize center and trace panels" onPointerDown={(event) => startPanelResize("right", event)} />
              </Show>
              <div class="min-h-0 min-w-0">
                <Show when={state.tracePanelMode === "open"} fallback={<TracePeekRail />}>
                  <TracePanel />
                </Show>
              </div>
            </>
          </Show>
        </div>
      </div>

      <HelpTutorialDialog
        open={state.helpDialogOpen}
        setup={state.setup}
        completedTutorialIds={state.completedTutorialIds}
        dismissedTutorialIds={state.dismissedTutorialIds}
        onClose={() => harnessStore.closeHelpDialog()}
        onStartTutorial={(tutorialId) => harnessStore.startTutorial(tutorialId)}
      />
      <TutorialOverlay
        tutorialId={state.activeTutorialId}
        stepIndex={state.activeTutorialStepIndex}
        onBack={() => harnessStore.setActiveTutorialStepIndex(state.activeTutorialStepIndex - 1)}
        onNext={() => {
          const tutorial = getTutorialDefinition(state.activeTutorialId);
          if (!tutorial) {
            return;
          }

          if (state.activeTutorialStepIndex >= tutorial.steps.length - 1) {
            harnessStore.finishTutorial(tutorial.id);
            return;
          }

          harnessStore.setActiveTutorialStepIndex(state.activeTutorialStepIndex + 1);
        }}
        onClose={() => harnessStore.dismissTutorial()}
      />
      <AssistantEditorDialog />
      <BackgroundJobEditorDialog />
      <ProjectSwitcherDialog />
      <ExecutionPlanDialog executionPlan={state.selectedExecutionPlan} />
      <Show when={ideWindowOpen() || state.activeSurface === "ide"}>
        <IdeVirtualWindow
          bounds={ideWindowBounds()}
          maximized={ideWindowMaximized()}
          onBoundsChange={setIdeWindowBounds}
          onClose={closeIdeVirtualWindow}
          onPopOut={popOutIdeWindow}
          onToggleMaximized={() => setIdeWindowMaximized((value) => !value)}
        />
      </Show>
      <TerminalDrawer />
      <Toaster />
    </main>
  );
}

function createDefaultIdeWindowBounds(): IdeWindowBounds {
  const width = Math.min(1120, Math.max(720, (typeof window === "undefined" ? 1280 : window.innerWidth) - 160));
  const height = Math.min(720, Math.max(480, (typeof window === "undefined" ? 800 : window.innerHeight) - 140));
  return {
    x: 72,
    y: 64,
    width,
    height
  };
}

function readPersistedIdeWindowState() {
  const fallback = { open: false, maximized: false, bounds: createDefaultIdeWindowBounds() };
  if (typeof window === "undefined") {
    return fallback;
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(IDE_WINDOW_STORAGE_KEY) ?? "{}");
    return {
      open: typeof parsed.open === "boolean" ? parsed.open : fallback.open,
      maximized: typeof parsed.maximized === "boolean" ? parsed.maximized : fallback.maximized,
      bounds: normalizeIdeWindowBounds(parsed.bounds, fallback.bounds)
    };
  } catch {
    return fallback;
  }
}

function persistIdeWindowState(state: { open: boolean; maximized: boolean; bounds: IdeWindowBounds }) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(IDE_WINDOW_STORAGE_KEY, JSON.stringify(state));
}

function normalizeIdeWindowBounds(value: unknown, fallback: IdeWindowBounds): IdeWindowBounds {
  if (!value || typeof value !== "object") {
    return fallback;
  }
  const bounds = value as Partial<IdeWindowBounds>;
  return {
    x: clampWindowNumber(bounds.x, 8, Math.max(8, window.innerWidth - 160), fallback.x),
    y: clampWindowNumber(bounds.y, 8, Math.max(8, window.innerHeight - 80), fallback.y),
    width: clampWindowNumber(bounds.width, 640, Math.max(640, window.innerWidth - 16), fallback.width),
    height: clampWindowNumber(bounds.height, 420, Math.max(420, window.innerHeight - 16), fallback.height)
  };
}

function clampWindowNumber(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

function IdeVirtualWindow(props: {
  bounds: IdeWindowBounds;
  maximized: boolean;
  onBoundsChange: (bounds: IdeWindowBounds) => void;
  onClose: () => void;
  onPopOut: () => void;
  onToggleMaximized: () => void;
}) {
  onMount(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || harnessStore.state.activeSurface !== "ide") {
        return;
      }
      if (harnessStore.state.projectSwitcherOpen) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (closeIdeOverlay()) {
        return;
      }
      props.onClose();
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    document.addEventListener("keydown", onKeyDown, { capture: true });
    onCleanup(() => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      document.removeEventListener("keydown", onKeyDown, { capture: true });
    });
  });

  const windowStyle = () =>
    props.maximized
      ? { top: "0.75rem", left: "0.75rem", right: "0.75rem", bottom: "0.75rem" }
      : {
          left: `${props.bounds.x}px`,
          top: `${props.bounds.y}px`,
          width: `${props.bounds.width}px`,
          height: `${props.bounds.height}px`
        };

  const startDrag = (event: PointerEvent) => {
    if (event.button !== 0 || props.maximized) {
      return;
    }
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const startBounds = props.bounds;
    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      props.onBoundsChange({
        ...startBounds,
        x: Math.max(8, Math.min(window.innerWidth - 160, startBounds.x + deltaX)),
        y: Math.max(8, Math.min(window.innerHeight - 80, startBounds.y + deltaY))
      });
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  };

  const startResize = (event: PointerEvent) => {
    if (event.button !== 0 || props.maximized) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const startBounds = props.bounds;
    const onPointerMove = (moveEvent: PointerEvent) => {
      props.onBoundsChange({
        ...startBounds,
        width: Math.max(640, Math.min(window.innerWidth - startBounds.x - 8, startBounds.width + moveEvent.clientX - startX)),
        height: Math.max(420, Math.min(window.innerHeight - startBounds.y - 8, startBounds.height + moveEvent.clientY - startY))
      });
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  };

  return (
    <section
      data-test-ide-virtual-window=""
      class="ide-virtual-window fixed z-[80] flex min-h-0 flex-col overflow-hidden border border-(--border) bg-(--panel-strong) shadow-2xl"
      classList={{ "ide-virtual-window-maximized": props.maximized }}
      style={windowStyle()}
    >
      <div
        data-test-ide-titlebar=""
        class="ide-titlebar flex h-8 shrink-0 cursor-default items-center justify-between gap-3 px-3 text-left select-none"
        role="button"
        tabIndex={0}
        aria-label={props.maximized ? "Restore IDE window" : "Maximize IDE window"}
        onPointerDown={startDrag}
        onDblClick={props.onToggleMaximized}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            props.onToggleMaximized();
          }
        }}
      >
        <span class="truncate text-[0.68rem] font-semibold text-(--ide-text)">Pi Harness IDE</span>
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="ide-window-control"
            aria-label="Pop out IDE to new window"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={props.onPopOut}
          >
            <ExternalLink class="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            class="ide-window-control"
            aria-label={props.maximized ? "Restore IDE window" : "Maximize IDE window"}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={props.onToggleMaximized}
          >
            {props.maximized ? <Minimize2 class="h-3.5 w-3.5" /> : <Maximize2 class="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            class="ide-window-control"
            aria-label="Close IDE window"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={props.onClose}
          >
            <X class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div class="min-h-0 flex-1">
        <IdeWorkbench windowMode="docked" onToggleWindowMode={props.onPopOut} onRequestClose={props.onClose} />
      </div>
      <button
        type="button"
        data-test-ide-window-resize=""
        class="ide-window-resize-handle"
        aria-label="Resize IDE window"
        onPointerDown={startResize}
      />
    </section>
  );
}

function closeIdeOverlay() {
  if (ideStore.state.commandPaletteOpen) {
    ideStore.setCommandPalette(false, "");
    return true;
  }
  if (ideStore.state.documentFindOpen) {
    ideStore.setDocumentFindOpen(false);
    return true;
  }
  return false;
}

function applyIdeRouteSelection() {
  const params = new URLSearchParams(window.location.search);
  applyIdeSelection({
    projectId: params.get("projectId") ?? undefined,
    threadId: params.get("threadId") ?? undefined
  });
}

function applyIdeSelection(input: OpenIdeWindowInput = {}) {
  const projectId = input.projectId;
  const threadId = input.threadId;
  if (!projectId) {
    return;
  }
  harnessStore.actions.sendCommand({
    type: "project.activate",
    requestId: createRequestId(),
    payload: { projectId }
  });
  if (threadId) {
    harnessStore.actions.sendCommand({
      type: "thread.activate",
      requestId: createRequestId(),
      payload: { projectId, threadId }
    });
  }
}

function handleAppHotkey(id: AppHotkeyId, actions: { openIde?: () => void } = {}) {
  const currentItemIndex = currentTabItemHotkeyIds.findIndex((hotkeyId) => hotkeyId === id);
  if (currentItemIndex >= 0) {
    selectCurrentTabItem(harnessStore.state.activeLeftTab, currentItemIndex);
    return;
  }

  const tab = appHotkeySettings.find((setting) => setting.id === id)?.tab;
  if (tab) {
    harnessStore.setActiveLeftTab(tab);
    return;
  }

  switch (id) {
    case "openProjectSwitcher":
      harnessStore.openProjectSwitcher();
      return;
    case "toggleTracePanel":
      harnessStore.toggleTracePanel();
      return;
    case "toggleTerminalDrawer":
      terminalStore.toggleOpen();
      return;
    case "createProjectChat":
      createProjectChatFromHotkey();
      return;
    case "openIde":
      actions.openIde?.();
      return;
    case "createAssistant":
      createAssistantFromHotkey();
      return;
    case "createBackgroundJob":
      createBackgroundJobFromHotkey();
      return;
    case "focusCurrentSearch":
      focusCurrentTabSearch();
      return;
  }
}

function createProjectChatFromHotkey() {
  harnessStore.setActiveLeftTab("projects");
  const projectId = harnessStore.state.workspace.activeProjectId;
  if (!projectId) {
    harnessStore.openProjectSwitcher();
    return;
  }

  harnessStore.actions.sendCommand({
    type: "thread.create",
    requestId: createRequestId(),
    payload: { projectId }
  });
}

function createAssistantFromHotkey() {
  const state = harnessStore.state;
  const scope = state.assistants.scopeFilter === "global" ? "global" : "project";
  const draft: AssistantEditorDraft = {
    source: "create",
    name: "",
    scope,
    projectId: scope === "project" ? state.workspace.activeProjectId ?? state.workspace.projects[0]?.id : undefined,
    description: "",
    personalityPrompt: "",
    jobPrompt: "",
    agentId: state.selectedAgentId,
    providerBrand: state.providerBrand,
    modeId: "",
    executionModelId: state.selectedExecutionModelId,
    reasoningStrength: state.selectedReasoningStrength,
    fastMode: state.selectedFastMode,
    runState: "active",
    bootstrapState: "pending",
    assetRefsText: ""
  };
  harnessStore.openAssistantEditor(draft);
}

function createBackgroundJobFromHotkey() {
  const state = harnessStore.state;
  const template = state.backgroundJobs.templates.find((entry) => entry.id === "scheduled-task");
  const draft: BackgroundJobEditorDraft = {
    source: "create",
    projectId: state.workspace.activeProjectId ?? state.workspace.projects[0]?.id,
    templateId: template?.id,
    kind: "ai-routine",
    name: "",
    description: "",
    scheduleInput: "",
    timezone: resolveBrowserTimezone(),
    aiPrompt: template?.definition.kind === "ai-routine" ? template.definition.prompt : "",
    aiModeId: template?.definition.kind === "ai-routine" ? template.definition.modeId : undefined,
    aiExecutionModelId: template?.definition.kind === "ai-routine" ? template.definition.executionModelId : undefined,
    aiReasoningStrength: template?.definition.kind === "ai-routine" ? template.definition.reasoningStrength : undefined,
    aiFastMode: template?.definition.kind === "ai-routine" ? template.definition.fastMode : undefined,
    aiPlanExecutionMode:
      template?.definition.kind === "ai-routine"
        ? template.definition.planExecutionMode ?? state.planExecutionModeDefault
        : state.planExecutionModeDefault,
    aiSubagentWorktreeStrategy:
      template?.definition.kind === "ai-routine"
        ? template.definition.subagentWorktreeStrategy ?? state.subagentWorktreeStrategyDefault
        : state.subagentWorktreeStrategyDefault,
    shellExecutable: "",
    shellArgsText: "",
    shellCwd: "",
    shellEnvRefsText: "",
    shellTimeoutSeconds: 600,
    shellNetworkAccess: false
  };
  harnessStore.openBackgroundJobEditor(draft);
}

function focusCurrentTabSearch() {
  if (terminalStore.state.open) {
    terminalStore.setSearch(true);
    queueMicrotask(() => {
      const input = document.querySelector<HTMLInputElement>('input[aria-label="Search terminal"]');
      input?.focus();
      input?.select();
    });
    return;
  }
  const labels: Record<HarnessLeftTab, string> = {
    projects: "Search projects",
    assistants: "Search assistants",
    jobs: "Search jobs",
    runs: "Search runs",
    preferences: "Search settings",
  };
  const label = labels[harnessStore.state.activeLeftTab];
  const input = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  input?.focus();
  input?.select();
}

function PanelResizeHandle(props: { label: string; onPointerDown: (event: PointerEvent) => void }) {
  return (
    <Tooltip content={props.label} triggerClass="hidden h-full min-h-0 lg:block">
      <button
        type="button"
        data-test-panel-resize-handle=""
        class="h-full w-full cursor-col-resize rounded-full bg-transparent transition hover:bg-(--border) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring)"
        aria-label={props.label}
        onPointerDown={props.onPointerDown}
      />
    </Tooltip>
  );
}

type LeftPaneTabDefinition = {
  id: HarnessLeftTab;
  label: string;
  tooltip: string;
  icon: Component<{ class?: string }>;
  hotkeyId?: AppHotkeyId;
};

const leftPaneTabs: LeftPaneTabDefinition[] = [
  {
    id: "projects",
    label: "Projects",
    tooltip: "Show project roots and threads",
    icon: FolderKanban,
    hotkeyId: "openProjects"
  },
  {
    id: "assistants",
    label: "Assistants",
    tooltip: "Show assistant roster",
    icon: Bot,
    hotkeyId: "openAssistants"
  },
  {
    id: "jobs",
    label: "Jobs",
    tooltip: "Show scheduled background jobs",
    icon: BriefcaseBusiness,
    hotkeyId: "openJobs"
  },
  {
    id: "runs",
    label: "Runs",
    tooltip: "Show active run info",
    icon: Clock3,
    hotkeyId: "openRuns"
  },
  {
    id: "preferences",
    label: "Settings",
    tooltip: "Show workspace settings",
    icon: Cog,
    hotkeyId: "openPreferences"
  },
];

function formatHotkeyHint(hotkey: string) {
  return formatForDisplay(hotkey)
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" + ");
}

function withPrimaryHotkey(tooltip: string, hotkeyId?: AppHotkeyId) {
  if (!hotkeyId) {
    return tooltip;
  }
  const primaryHotkey = normalizeAppHotkeyPreferences(harnessStore.state.appHotkeyPreferences)[hotkeyId][0];
  return primaryHotkey ? `${tooltip} (${formatHotkeyHint(primaryHotkey)})` : tooltip;
}

function TabbedLeftPane(props: { compact?: boolean; onNavigate?: () => void } = {}) {
  const state = harnessStore.state;
  const [iconsOnly, setIconsOnly] = createSignal(false);
  let navRef: HTMLElement | undefined;

  onMount(() => {
    const measure = () => {
      if (!navRef) {
        return;
      }
      navRef.classList.remove("surface-tab-strip-icons-only");
      const shouldCollapse = shouldCollapseTabStrip(navRef);
      setIconsOnly(shouldCollapse);
      if (shouldCollapse) {
        navRef.classList.add("surface-tab-strip-icons-only");
      }
    };
    const resizeObserver = new ResizeObserver(measure);
    if (navRef) {
      resizeObserver.observe(navRef);
    }
    queueMicrotask(measure);
    window.addEventListener("resize", measure);
    onCleanup(() => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", measure);
    });
  });

  return (
    <div data-test-left-tabbed-pane="" class="left-tabbed-pane flex h-full min-h-0 flex-col gap-0">
      <nav
          ref={navRef}
          data-test-left-tab-nav=""
          role="tablist"
          aria-label="Workspace panels"
          class="surface-tab-strip px-4 lg:px-5"
          classList={{ "surface-tab-strip-icons-only": iconsOnly() }}
      >
        <For each={leftPaneTabs}>
          {(tab) => {
            const Icon = tab.icon;
            const tooltip = () => withPrimaryHotkey(tab.tooltip, tab.hotkeyId);
            return (
              <Tooltip content={tooltip()}>
                <button
                  type="button"
                  role="tab"
                  class="surface-tab"
                  aria-label={tab.label}
                  attr:aria-selected={state.activeLeftTab === tab.id ? "true" : "false"}
                  tabIndex={state.activeLeftTab === tab.id ? 0 : -1}
                  onClick={() => {
                    harnessStore.setActiveLeftTab(tab.id);
                    props.onNavigate?.();
                  }}
                >
                  <Icon class="h-4 w-4" />
                  <span class="surface-tab-label">{tab.label}</span>
                </button>
              </Tooltip>
            );
          }}
        </For>
      </nav>
      <div class="min-h-0 flex-1 overflow-hidden rounded-b-xl">
        <Show
          when={state.activeLeftTab === "jobs" || state.activeLeftTab === "runs"}
          fallback={
            <Show
              when={state.activeLeftTab === "assistants"}
              fallback={
                <Show when={state.activeLeftTab === "preferences"} fallback={<ProjectSidebar compact={props.compact} onNavigate={props.onNavigate} />}>
                  <LeftPaneShell kind="preferences" class="rounded-b-2xl">
                    <PreferenceSectionNav onNavigate={props.onNavigate} />
                  </LeftPaneShell>
                </Show>
              }
            >
              <AssistantsPanel variant="roster" />
            </Show>
          }
        >
          <BackgroundJobsPanel variant="left" segment={state.activeLeftTab === "jobs" ? "jobs" : "runs"} />
        </Show>
      </div>
    </div>
  );
}

export function shouldCollapseTabStrip(navElement: HTMLElement) {
  const tabItems = Array.from(navElement.children);
  const firstTabTop = tabItems[0]?.getBoundingClientRect().top ?? 0;
  const hasWrappedTabs = tabItems.some((tabItem) => tabItem.getBoundingClientRect().top > firstTabTop + 1);

  return hasWrappedTabs || navElement.scrollWidth > navElement.clientWidth + 1;
}

function isProjectSwitcherInputFocused() {
  const activeElement = document.activeElement;
  return activeElement instanceof HTMLElement && activeElement.dataset.projectSwitcherInput === "true";
}

function isResizeObserverLoopError(message: string) {
  return message === "ResizeObserver loop completed with undelivered notifications." || message === "ResizeObserver loop limit exceeded";
}
