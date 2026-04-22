import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { createHotkeys } from "@tanstack/solid-hotkeys";
import { Bot, Clock3, Menu, MessageSquareMore, Pause, Play, PanelsTopLeft, Settings2, Workflow, CircleQuestionMark } from "lucide-solid";
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
import { PreferencesModal } from "./components/preferences-modal";
import { ProjectSidebar } from "./components/project-sidebar";
import { ProjectSwitcherDialog } from "./components/project-switcher-dialog";
import { Toaster } from "./components/toaster";
import { TracePanel } from "./components/trace-panel";
import { getTutorialDefinition } from "./components/tutorial-definitions";
import { TutorialOverlay } from "./components/tutorial-overlay";
import { ActionButton } from "./components/action-button";
import { buttonVariants } from "./components/primitives/button";
import { SheetContent, SheetRoot, SheetTrigger } from "./components/primitives/sheet";
import { Tooltip } from "./components/primitives/tooltip";
import { connectHarnessWebSocket } from "./harness-websocket";
import { getActiveProject, getCapabilityTags, harnessStore } from "./harness-store";
import { cn } from "./lib/utils";
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
      reportUiError(event.error ?? event.message, "Unexpected UI error", { rethrow: "never" });
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
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
  const activeSurface = createMemo(() => state.activeSurface);
  const activeProject = () => getActiveProject(state);
  const activeCapabilityTags = () => getCapabilityTags(state, activeProject()?.session.executionModelId);
  const executionControlTooltip = () => {
    if (!state.executionControl.isPaused) {
      return "Pause new executions";
    }

    return `Resume new executions | queued ${state.executionControl.deferredPlanningQuestionCount} planner, ${state.executionControl.deferredAssistantQuestionCount} assistant, ${state.executionControl.deferredBrowserApprovalCount} browser`;
  };
  const activeThreadTitle = () =>
    activeProject()?.threads.find((thread) => thread.id === activeProject()?.activeThreadId)?.title ?? activeProject()?.activeThreadId;
  const surfaceTabs = [
    {
      id: "chat" as const,
      label: "Project chat",
      icon: <MessageSquareMore class="h-4 w-4" />,
      tooltip: "Switch to project chat surface"
    },
    {
      id: "assistants" as const,
      label: "Assistants",
      icon: <Bot class="h-4 w-4" />,
      tooltip: "Switch to assistants surface"
    },
    {
      id: "background-jobs" as const,
      label: "Background jobs",
      icon: <Clock3 class="h-4 w-4" />,
      tooltip: "Switch to background jobs surface"
    }
  ];
  return (
    <main data-test-app-shell="" class="relative h-screen overflow-hidden px-[0.6rem] py-[0.6rem] md:px-4 md:py-4">
      <div class="app-background" />
      <div class="mx-auto flex h-full min-h-0 max-w-[1440px] flex-col gap-4">
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
                <SheetContent open={sidebarOpen()} onClose={() => setSidebarOpen(false)} title="Projects">
                  <ProjectSidebar compact onNavigate={() => setSidebarOpen(false)} />
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
              class={state.executionControl.isPaused ? "execution-control-pill execution-control-pill-paused" : "execution-control-pill execution-control-pill-running"}
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
              tooltip="Open workspace preferences"
              icon={<Settings2 class="h-4 w-4" />}
              variant="secondary"
              size="icon"
              ariaLabel="Open workspace preferences"
              dataTourId="help-preferences"
              onClick={() => harnessStore.openPreferencesModal()}
            />
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
          class={`grid min-h-0 flex-1 auto-rows-fr gap-4 ${state.tracePanelOpen
            ? "lg:grid-cols-[20rem_minmax(0,1fr)_minmax(18rem,22rem)]"
            : "lg:grid-cols-[20rem_minmax(0,1fr)]"
            }`}
        >
          <div class="hidden min-h-0 lg:block">
            <div data-tour-id="project-sidebar" class="h-full">
              <ProjectSidebar />
            </div>
          </div>
          <div class="flex min-h-0 flex-col">
            <Show when={activeSurface()} keyed>
              {(surface) => (
                <>
                  <nav data-test-center-surface-nav="" class="surface-tab-strip">
                    <For each={surfaceTabs}>
                      {(tab) => (
                        <Tooltip content={tab.tooltip}>
                          <button
                            type="button"
                            class={cn(buttonVariants({ variant: "ghost" }), "surface-tab")}
                            aria-label={tab.label}
                            attr:aria-pressed={surface === tab.id ? "true" : "false"}
                            onClick={() => harnessStore.setActiveSurface(tab.id)}
                          >
                            {tab.icon}
                            {tab.label}
                          </button>
                        </Tooltip>
                      )}
                    </For>
                  </nav>
                  <div class="min-h-0 flex-1 overflow-hidden">
                    <Show
                      when={surface === "background-jobs"}
                      fallback={
                        <Show when={surface === "assistants"} fallback={<ChatPanel />}>
                          <AssistantsPanel />
                        </Show>
                      }
                    >
                      <BackgroundJobsPanel />
                    </Show>
                  </div>
                </>
              )}
            </Show>
          </div>
          <Show when={state.tracePanelOpen}>
            <TracePanel />
          </Show>
        </div>
      </div>

      <PreferencesModal />
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

function isProjectSwitcherInputFocused() {
  const activeElement = document.activeElement;
  return activeElement instanceof HTMLElement && activeElement.dataset.projectSwitcherInput === "true";
}
