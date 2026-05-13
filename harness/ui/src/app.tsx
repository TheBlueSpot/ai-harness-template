import { createMemo, createSignal, For, onCleanup, onMount, Show, type Component } from "solid-js";
import { createHotkeys, formatForDisplay } from "@tanstack/solid-hotkeys";
import { Bot, BriefcaseBusiness, Clock3, Cog, FolderKanban, Menu, Pause, Play, PanelsTopLeft, Workflow, CircleQuestionMark } from "lucide-solid";
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
import { TracePanel } from "./components/trace-panel";
import { getTutorialDefinition } from "./components/tutorial-definitions";
import { TutorialOverlay } from "./components/tutorial-overlay";
import { ActionButton } from "./components/action-button";
import { SheetContent, SheetRoot, SheetTrigger } from "./components/primitives/sheet";
import { Tooltip } from "./components/primitives/tooltip";
import { connectHarnessWebSocket } from "./harness-websocket";
import { harnessStore, type HarnessLeftTab, type MainPanelSizes } from "./harness-store";
import { reportUiError } from "./toast-store";

export function App() {
  let connection: ReturnType<typeof connectHarnessWebSocket> | undefined;
  const [sidebarOpen, setSidebarOpen] = createSignal(false);

  createHotkeys(
    [
      {
        hotkey: "Mod+K",
        callback: () => {
          harnessStore.openProjectSwitcher();
        },
        options: {
          meta: {
            name: "Open or switch project",
            description: "Open the spotlight-style project switcher"
          }
        }
      },
      {
        hotkey: "Mod+Space",
        callback: () => {
          harnessStore.openProjectSwitcher();
        },
        options: {
          meta: {
            name: "Open or switch project",
            description: "Open the spotlight-style project switcher"
          }
        }
      },
      {
        hotkey: "Mod+,",
        callback: () => {
          harnessStore.openPreferencesModal();
        },
        options: {
          meta: {
            name: "Open workspace preferences",
            description: "Open workspace preferences"
          }
        }
      }
    ],
    () => ({
      enabled: !harnessStore.state.projectSwitcherOpen && !isProjectSwitcherInputFocused(),
      ignoreInputs: false
    })
  );

  onMount(() => {
    harnessStore.hydrateLocalPreferences();
    harnessStore.actions.hydrateBrowserUiSession();
    harnessStore.hydrateTutorialProgress();
    connection = connectHarnessWebSocket();
    harnessStore.actions.setCommandDispatcher((command) => connection?.sendCommand(command));

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

    onCleanup(() => {
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    });
  });

  onCleanup(() => {
    harnessStore.actions.setCommandDispatcher(undefined);
    connection?.dispose();
  });

  const state = harnessStore.state;
  const activeLeftTab = createMemo(() => state.activeLeftTab);
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
    const total = state.tracePanelOpen
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
  return (
    <main data-test-app-shell="" class="app-zoom-shell relative overflow-hidden px-[0.6rem] py-[0.6rem] md:px-4 md:py-4">
      <div class="app-background" />
      <div class="mx-auto flex h-full min-h-0 flex-col gap-4">
        <header data-test-app-header="" class="panel-shell flex flex-col gap-3 rounded-2xl px-[0.8rem] py-[0.6rem] md:flex-row md:items-center md:justify-between">
          <div class="flex items-center gap-3">
            <SheetRoot open={sidebarOpen()} onOpenChange={setSidebarOpen}>
              <div class="lg:hidden">
                <SheetTrigger
                  class="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-(--border) bg-white/60 text-(--foreground)"
                  aria-label="Open projects"
                  data-tour-id="project-sidebar"
                  onClick={() => setSidebarOpen(true)}
                >
                  <Menu class="h-4 w-4" />
                </SheetTrigger>
                <SheetContent open={sidebarOpen()} onClose={() => setSidebarOpen(false)} title="Workspace">
                  <TabbedLeftPane compact onNavigate={() => setSidebarOpen(false)} />
                </SheetContent>
              </div>
            </SheetRoot>

            <div class="space-y-1">
              <div class="flex items-center gap-2 text-[0.585rem] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                <Workflow class="h-3.5 w-3.5" />
                AI harness workspace
              </div>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-3">
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
              tooltip={state.tracePanelOpen ? "Hide developer trace panel" : "Show developer trace panel"}
              icon={<PanelsTopLeft class="h-4 w-4" />}
              variant="secondary"
              dataTourId="trace-panel-toggle"
              onClick={() => harnessStore.toggleTracePanel()}
            />
          </div>
        </header>

        <div
          data-test-main-panel-grid=""
          class="grid min-h-0 flex-1 auto-rows-fr gap-4 lg:gap-x-2"
          classList={{
            "lg:grid-cols-[minmax(0,var(--left-panel-size))_0.35rem_minmax(0,var(--center-panel-size))_0.35rem_minmax(0,var(--right-panel-size))]": state.tracePanelOpen,
            "lg:grid-cols-[minmax(0,var(--left-panel-size))_0.35rem_minmax(0,var(--center-panel-size))]": !state.tracePanelOpen
          }}
          style={mainPanelGridStyle()}
        >
          <div class="hidden min-h-0 min-w-0 lg:block">
            <div data-tour-id="project-sidebar" class="h-full">
              <TabbedLeftPane />
            </div>
          </div>
          <PanelResizeHandle label="Resize left and center panels" onPointerDown={(event) => startPanelResize("left", event)} />
          <div class="min-h-0 min-w-0 overflow-hidden">
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
          <Show when={state.tracePanelOpen}>
            <>
              <PanelResizeHandle label="Resize center and trace panels" onPointerDown={(event) => startPanelResize("right", event)} />
              <div class="min-h-0 min-w-0">
                <TracePanel />
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
      <Toaster />
    </main>
  );
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
};

const leftPaneTabs: LeftPaneTabDefinition[] = [
  {
    id: "projects",
    label: "Projects",
    tooltip: "Show project roots and threads",
    icon: FolderKanban
  },
  {
    id: "assistants",
    label: "Assistants",
    tooltip: "Show assistant roster",
    icon: Bot
  },
  {
    id: "jobs",
    label: "Jobs",
    tooltip: "Show scheduled background jobs",
    icon: BriefcaseBusiness
  },
  {
    id: "runs",
    label: "Runs",
    tooltip: "Show active run info",
    icon: Clock3
  },
  {
    id: "preferences",
    label: "Settings",
    tooltip: `Show workspace settings (${formatForDisplay("Mod+,")})`,
    icon: Cog
  }
];

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
          class="surface-tab-strip px-4 lg:px-5"
          classList={{ "surface-tab-strip-icons-only": iconsOnly() }}
      >
        <For each={leftPaneTabs}>
          {(tab) => {
            const Icon = tab.icon;
            return (
              <Tooltip content={tab.tooltip}>
                <button
                  type="button"
                  class="surface-tab"
                  classList={{ "bg-white/80": state.activeLeftTab === tab.id, "text-(--foreground)": state.activeLeftTab === tab.id }}
                  aria-label={tab.label}
                  attr:aria-pressed={state.activeLeftTab === tab.id ? "true" : "false"}
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
      <div class="min-h-0 flex-1 rounded-b-2xl">
        <Show
          when={state.activeLeftTab === "jobs" || state.activeLeftTab === "runs"}
          fallback={
            <Show
              when={state.activeLeftTab === "assistants"}
              fallback={
                <Show when={state.activeLeftTab === "preferences"} fallback={<ProjectSidebar compact={props.compact} onNavigate={props.onNavigate} />}>
                  <div class="h-full rounded-b-2xl border border-t-0 border-(--border) bg-(--panel)">
                    <PreferenceSectionNav onNavigate={props.onNavigate} />
                  </div>
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
