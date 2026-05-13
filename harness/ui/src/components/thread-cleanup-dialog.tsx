import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import type { WorkspaceProjectState } from "../../../shared/protocol";
import { getThreadCleanupCandidates, parseThreadCleanupDuration } from "../lib/thread-cleanup";
import { Button } from "./primitives/button";
import { Dialog } from "./primitives/dialog";
import { Input } from "./primitives/input";

type ThreadCleanupDialogProps = {
  open: boolean;
  projects: WorkspaceProjectState[];
  activeProjectId?: string;
  onClose: () => void;
  onSubmit: (input: { projectIds?: string[]; olderThanMs: number }) => void;
};

export function ThreadCleanupDialog(props: ThreadCleanupDialogProps) {
  const initialActiveProjectId =
    props.activeProjectId && props.projects.some((project) => project.id === props.activeProjectId) ? props.activeProjectId : undefined;
  const [duration, setDuration] = createSignal("30d");
  const [allProjects, setAllProjects] = createSignal(!initialActiveProjectId);
  const [selectedProjectIds, setSelectedProjectIds] = createSignal<string[]>(initialActiveProjectId ? [initialActiveProjectId] : []);
  const parsedDuration = createMemo(() => parseThreadCleanupDuration(duration()));
  const durationError = createMemo(() => {
    const parsed = parsedDuration();
    return parsed.ok ? undefined : parsed.reason;
  });
  const effectiveProjectIds = createMemo(() => (allProjects() ? undefined : selectedProjectIds()));
  const candidates = createMemo(() => {
    const parsed = parsedDuration();
    return parsed.ok ? getThreadCleanupCandidates(props.projects, effectiveProjectIds(), parsed.ms, new Date()) : [];
  });
  const selectedCount = createMemo(() => (allProjects() ? props.projects.length : selectedProjectIds().length));
  const submitDisabled = createMemo(() => !parsedDuration().ok || selectedCount() === 0 || candidates().length === 0);

  createEffect(() => {
    if (!props.open) {
      return;
    }
    const activeProjectId = props.activeProjectId;
    if (activeProjectId && props.projects.some((project) => project.id === activeProjectId)) {
      setAllProjects(false);
      setSelectedProjectIds([activeProjectId]);
      return;
    }
    setAllProjects(true);
    setSelectedProjectIds([]);
  });

  function toggleProject(projectId: string) {
    setAllProjects(false);
    setSelectedProjectIds((current) =>
      current.includes(projectId) ? current.filter((id) => id !== projectId) : [...current, projectId]
    );
  }

  function submit() {
    const parsed = parsedDuration();
    if (!parsed.ok || submitDisabled()) {
      return;
    }
    props.onSubmit({ projectIds: effectiveProjectIds(), olderThanMs: parsed.ms });
    props.onClose();
  }

  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      title="Clean up old threads"
      description="Archive inactive user threads older than the selected age."
      contentClass="gap-3"
      footer={
        <>
          <Button tooltip="Close thread cleanup without archiving" variant="secondary" onClick={props.onClose}>
            Cancel
          </Button>
          <Button tooltip={submitDisabled() ? "No inactive threads match cleanup settings" : "Archive old inactive threads"} disabled={submitDisabled()} onClick={submit}>
            Archive old threads
          </Button>
        </>
      }
    >
      <div data-test-thread-cleanup-dialog="" class="flex flex-col gap-3">
        <label class="flex flex-col gap-1 text-[0.675rem] font-semibold text-(--foreground)">
          Older than
          <Input
            value={duration()}
            placeholder="30d"
            onInput={(event: InputEvent & { currentTarget: HTMLInputElement }) => setDuration(event.currentTarget.value)}
          />
        </label>
        <Show when={durationError()}>
          {(reason) => <div class="text-[0.65rem] text-(--danger)">{reason()}</div>}
        </Show>

        <div class="flex flex-col gap-2">
          <div class="text-[0.675rem] font-semibold text-(--foreground)">Projects</div>
          <label class="flex min-h-8 cursor-pointer items-center gap-2 rounded-lg px-2 text-[0.675rem] hover:bg-black/5">
            <input
              type="checkbox"
              checked={allProjects()}
              onChange={(event) => {
                setAllProjects(event.currentTarget.checked);
                if (event.currentTarget.checked) {
                  setSelectedProjectIds([]);
                }
              }}
            />
            <span>All projects</span>
          </label>
          <div class="grid max-h-44 gap-1 overflow-auto">
            <For each={props.projects}>
              {(project) => (
                <label class="flex min-h-8 cursor-pointer items-center gap-2 rounded-lg px-2 text-[0.675rem] hover:bg-black/5">
                  <input
                    type="checkbox"
                    checked={!allProjects() && selectedProjectIds().includes(project.id)}
                    disabled={allProjects()}
                    onChange={() => toggleProject(project.id)}
                  />
                  <span class="min-w-0 flex-1 truncate">{project.name}</span>
                </label>
              )}
            </For>
          </div>
        </div>

        <div class="rounded-xl border border-(--border) bg-white/55 px-3 py-2 text-[0.675rem] text-(--muted)">
          <div class="font-semibold text-(--foreground)">{candidates().length} threads match</div>
          <div>Active and final remaining threads are skipped</div>
        </div>
      </div>
    </Dialog>
  );
}
