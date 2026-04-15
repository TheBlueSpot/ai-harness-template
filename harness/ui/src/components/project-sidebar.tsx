import { For } from "solid-js";
import { createRequestId, type ClientCommand } from "../../../shared/protocol";
import { getActiveProject, harnessStore } from "../harness-store";
import { isAbsolutePath, truncateMiddle } from "../lib/utils";
import { ActionButton } from "./action-button";
import { Input } from "./ui/input";
import { ScrollArea } from "./ui/scroll-area";
import { Separator } from "./ui/separator";
import { Folder, FolderOpen, FolderPlus, Trash2 } from "lucide-solid";

type ProjectSidebarProps = {
  sendCommand: (command: ClientCommand) => void;
  compact?: boolean;
  onNavigate?: () => void;
};

export function ProjectSidebar(props: ProjectSidebarProps) {
  const state = harnessStore.state;
  const activeProject = () => getActiveProject(state);
  const trimmedInput = () => state.projectInput.trim();
  const canAddManualProject = () => trimmedInput().length > 0 && isAbsolutePath(trimmedInput());

  function handleAddProject() {
    props.sendCommand({
      type: "project.add",
      requestId: createRequestId(),
      payload: {
        rootPath: trimmedInput()
      }
    });
  }

  function handleBrowseProject() {
    props.sendCommand({
      type: "project.browse",
      requestId: createRequestId()
    });
  }

  function handleActivateProject(projectId: string) {
    if (projectId === state.workspace.activeProjectId) {
      return;
    }

    props.sendCommand({
      type: "project.activate",
      requestId: createRequestId(),
      payload: {
        projectId
      }
    });
    props.onNavigate?.();
  }

  function handleRemoveProject(projectId: string) {
    props.sendCommand({
      type: "project.remove",
      requestId: createRequestId(),
      payload: {
        projectId
      }
    });
  }

  return (
    <div class={`panel-shell flex h-full min-h-0 flex-col gap-4 rounded-[2rem] p-[0.8rem] ${props.compact ? "" : ""}`}>
      <div class="space-y-2">
        <div class="text-[0.585rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]">Projects</div>
        <h2 class="text-[1.125rem] font-semibold tracking-[-0.04em] text-[color:var(--foreground)]">Workspace roots</h2>
        <p class="text-[0.675rem] leading-5 text-[color:var(--muted)]">
          Each project root keeps its own SQLite-backed chat thread and local execution context.
        </p>
      </div>

      <div class="rounded-[1.5rem] border border-[color:var(--border)] bg-white/50 p-3">
        <div class="space-y-3">
          <Input
            value={state.projectInput}
            placeholder="C:\\repo\\project"
            onInput={(event: InputEvent & { currentTarget: HTMLInputElement; target: Element }) =>
              harnessStore.setProjectInput(event.currentTarget.value)
            }
          />
          <div class="flex gap-2">
            <ActionButton
              tooltip="Add project from typed absolute path"
              disabledReason={trimmedInput().length === 0 ? "Enter absolute folder path" : "Project path must be absolute"}
              disabled={!canAddManualProject()}
              icon={<FolderPlus class="h-4 w-4" />}
              class="flex-1"
              onClick={handleAddProject}
            >
              Add path
            </ActionButton>
            <ActionButton
              tooltip="Browse for project folder"
              icon={<FolderOpen class="h-4 w-4" />}
              variant="secondary"
              size="icon"
              ariaLabel="Browse for project folder"
              onClick={handleBrowseProject}
            />
          </div>
        </div>
      </div>

      <Separator />

      <div class="space-y-2">
        <div class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Active + recent</div>
        <div class="text-[0.675rem] text-[color:var(--muted)]">
          Compact workspace cards keep project context visible without wasting panel space.
        </div>
      </div>

      <ScrollArea class="flex-1 min-h-0 pr-1">
        <div class="space-y-2.5">
          <For each={state.workspace.projects}>
            {(project) => {
              const isActive = () => project.id === state.workspace.activeProjectId;
              const isDisabled = () => isActive();
              const removeDisabledReason = () => {
                if (state.workspace.projects.length <= 1) {
                  return "At least one project must remain";
                }

                if (project.session.isStreaming) {
                  return "Project is streaming";
                }

                return undefined;
              };

              return (
                <div
                  class={`rounded-[1.4rem] border p-2.5 transition ${
                    isActive()
                      ? "border-[color:var(--accent)] bg-[linear-gradient(135deg,rgba(15,118,110,0.18),rgba(255,255,255,0.86))] shadow-md"
                      : "border-[color:var(--border)] bg-white/52"
                  }`}
                >
                  <div class="flex items-start gap-2">
                    <ActionButton
                      tooltip={isActive() ? `${project.name} is active` : `Switch to ${project.name}`}
                      disabledReason="Project already active"
                      disabled={isDisabled()}
                      icon={<Folder class="h-4 w-4" />}
                      variant={isActive() ? "secondary" : "ghost"}
                      class={`min-h-[2.75rem] flex-1 justify-start rounded-[1rem] px-3 py-2 ${
                        isActive() ? "border border-white/60 bg-white/70" : ""
                      }`}
                      onClick={() => handleActivateProject(project.id)}
                    >
                      <div class="min-w-0 text-left">
                        <div class="truncate text-[0.675rem] font-semibold text-[color:var(--foreground)]">{project.name}</div>
                        <div class="truncate text-[0.585rem] text-[color:var(--muted)]">
                          {truncateMiddle(project.rootPath, props.compact ? 24 : 30)}
                        </div>
                        <div class="mt-1.5 flex flex-wrap gap-2 text-[0.6rem] uppercase tracking-[0.16em] text-[color:var(--muted)]">
                          <span>{project.session.messages.length} msgs</span>
                          {project.session.isStreaming ? <span>streaming</span> : null}
                          {project.lastError ? <span>error</span> : null}
                          {isActive() ? <span>active</span> : null}
                        </div>
                      </div>
                    </ActionButton>

                    <ActionButton
                      tooltip={`Remove ${project.name}`}
                      disabledReason={removeDisabledReason()}
                      disabled={Boolean(removeDisabledReason())}
                      icon={<Trash2 class="h-4 w-4" />}
                      variant="ghost"
                      size="icon"
                      ariaLabel={`Remove ${project.name}`}
                      onClick={() => handleRemoveProject(project.id)}
                    />
                  </div>
                </div>
              );
            }}
          </For>
        </div>
      </ScrollArea>

      <div class="rounded-[1.35rem] border border-[color:var(--border)] bg-white/45 px-4 py-3 text-[0.585rem] uppercase tracking-[0.16em] text-[color:var(--muted)]">
        Active root
        <div class="mt-2 break-all font-mono text-[0.675rem] normal-case tracking-normal text-[color:var(--foreground)]">
          {activeProject().rootPath}
        </div>
      </div>
    </div>
  );
}
