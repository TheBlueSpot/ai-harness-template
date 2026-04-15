import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { Menu, PanelsTopLeft, Settings2, Workflow } from "lucide-solid";
import { createRequestId } from "../../shared/protocol";
import { ChatPanel } from "./components/chat-panel";
import { ConnectionBanner } from "./components/connection-banner";
import { PreferencesModal } from "./components/preferences-modal";
import { ProjectSidebar } from "./components/project-sidebar";
import { Toaster } from "./components/toaster";
import { TracePanel } from "./components/trace-panel";
import { ActionButton } from "./components/action-button";
import { SheetContent, SheetRoot, SheetTrigger } from "./components/ui/sheet";
import { connectHarnessWebSocket } from "./harness-websocket";
import { canSelectProviderBrand, getActiveProject, harnessStore, persistLocalPreferences } from "./harness-store";
import { pushToast, reportUiError } from "./toast-store";

export function App() {
  let connection: ReturnType<typeof connectHarnessWebSocket> | undefined;
  const [sidebarOpen, setSidebarOpen] = createSignal(false);

  onMount(() => {
    harnessStore.hydrateLocalPreferences();
    connection = connectHarnessWebSocket();

    const onWindowError = (event: ErrorEvent) => {
      reportUiError(event.error ?? event.message, "Unexpected UI error");
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      reportUiError(event.reason, "Unhandled promise rejection");
    };

    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    onCleanup(() => {
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    });
  });

  onCleanup(() => {
    connection?.dispose();
  });

  const state = harnessStore.state;
  const activeProject = () => getActiveProject(state);
  const sendCommand = (command: Parameters<NonNullable<typeof connection>["sendCommand"]>[0]) => {
    if (!connection) {
      pushToast("Connection unavailable", "Wait for workspace connection before sending commands.", "error");
      return;
    }

    connection.sendCommand(command);
  };

  const handleProviderBrandChange = (providerBrand: "gpt" | "gemini") => {
    if (!canSelectProviderBrand(state, providerBrand)) {
      pushToast("Provider key required", `Saved ${providerBrand === "gemini" ? "Gemini" : "GPT"} key required.`, "error");
      return;
    }

    harnessStore.setProviderBrand(providerBrand);
    persistLocalPreferences({
      openAiApiKey: state.openAiApiKeyDraft.trim() || undefined,
      googleApiKey: state.googleApiKeyDraft.trim() || undefined,
      providerBrand,
      debugEnabled: state.debugEnabled,
      tracePanelDefaultOpen: state.tracePanelDefaultOpen
    });

    if (!connection) {
      return;
    }

    connection.sendCommand({
      type: "preferences.save",
      requestId: createRequestId(),
      payload: {
        openAiApiKey: state.openAiApiKeyDraft.trim() || undefined,
        googleApiKey: state.googleApiKeyDraft.trim() || undefined,
        providerBrand,
        debugEnabled: state.debugEnabled,
        tracePanelDefaultOpen: state.tracePanelDefaultOpen
      }
    });
  };

  return (
    <main class="relative h-[100vh] overflow-hidden px-[0.6rem] py-[0.6rem] md:px-4 md:py-4">
      <div class="app-background" />
      <div class="mx-auto flex h-full min-h-0 max-w-[1440px] flex-col gap-4">
        <header class="panel-shell flex flex-col gap-3 rounded-[2rem] px-[0.8rem] py-[0.6rem] md:flex-row md:items-center md:justify-between">
          <div class="flex items-center gap-3">
            <SheetRoot open={sidebarOpen()} onOpenChange={setSidebarOpen}>
              <div class="lg:hidden">
                <SheetTrigger
                  class="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[color:var(--border)] bg-white/60 text-[color:var(--foreground)]"
                  aria-label="Open projects"
                  onClick={() => setSidebarOpen(true)}
                >
                  <Menu class="h-4 w-4" />
                </SheetTrigger>
                <SheetContent open={sidebarOpen()} onClose={() => setSidebarOpen(false)} title="Projects">
                  <ProjectSidebar sendCommand={sendCommand} compact onNavigate={() => setSidebarOpen(false)} />
                </SheetContent>
              </div>
            </SheetRoot>

            <div class="space-y-1">
              <div class="flex items-center gap-2 text-[0.585rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]">
                <Workflow class="h-3.5 w-3.5" />
                AI harness workspace
              </div>
              <div class="text-[0.675rem] text-[color:var(--foreground)]">
                {activeProject().name} <span class="text-[color:var(--muted)]">| thread {activeProject().activeThreadId}</span>
              </div>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <ConnectionBanner />
            <select
              class="h-11 rounded-[1.1rem] border border-[color:var(--border)] bg-white/65 px-3 text-[0.675rem] font-semibold uppercase tracking-[0.16em] text-[color:var(--foreground)] shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
              value={state.providerBrand}
              onInput={(event) => handleProviderBrandChange(event.currentTarget.value as "gpt" | "gemini")}
            >
              <option value="gpt" disabled={!canSelectProviderBrand(state, "gpt")}>
                GPT
              </option>
              <option value="gemini" disabled={!canSelectProviderBrand(state, "gemini")}>
                Gemini
              </option>
            </select>
            <ActionButton
              tooltip="Open workspace preferences"
              icon={<Settings2 class="h-4 w-4" />}
              variant="secondary"
              size="icon"
              ariaLabel="Open workspace preferences"
              onClick={() => harnessStore.openPreferencesModal()}
            />
            <ActionButton
              tooltip={state.tracePanelOpen ? "Hide developer trace panel" : "Show developer trace panel"}
              icon={<PanelsTopLeft class="h-4 w-4" />}
              variant="secondary"
              onClick={() => harnessStore.toggleTracePanel()}
            >
              {state.tracePanelOpen ? "Hide trace" : "Show trace"}
            </ActionButton>
          </div>
        </header>

        <div
          class={`grid min-h-0 flex-1 auto-rows-fr gap-4 ${
            state.tracePanelOpen
              ? "lg:grid-cols-[20rem_minmax(0,1fr)_minmax(18rem,22rem)]"
              : "lg:grid-cols-[20rem_minmax(0,1fr)]"
          }`}
        >
          <div class="hidden min-h-0 lg:block">
            <ProjectSidebar sendCommand={sendCommand} />
          </div>
          <ChatPanel sendCommand={sendCommand} />
          <Show when={state.tracePanelOpen}>
            <TracePanel sendCommand={sendCommand} />
          </Show>
        </div>
      </div>

      <PreferencesModal sendCommand={sendCommand} />
      <Toaster />
    </main>
  );
}
