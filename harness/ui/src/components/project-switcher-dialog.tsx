import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { FolderOpen, Search } from "lucide-solid";
import { createRequestId, type ProjectSearchResult } from "../../../shared/protocol";
import { harnessStore } from "../harness-store";
import {
  isAbsolutePath,
  isPathPrefixMatch,
  normalizePathForComparison,
  truncateMiddle
} from "../lib/utils";
import { ActionButton } from "./action-button";
import { Dialog } from "./primitives/dialog";
import { Input } from "./primitives/input";
import { Button } from "./primitives/button";
import { Tooltip } from "./primitives/tooltip";

type WorkspaceMatch = {
  projectId: string;
  name: string;
  rootPath: string;
  isActive: boolean;
  matchKind: ProjectSearchResult["matchKind"];
  repoKind: ProjectSearchResult["repoKind"];
};

type DialogResult =
  | {
      key: string;
      source: "workspace";
      name: string;
      rootPath: string;
      repoKind: ProjectSearchResult["repoKind"];
      actionLabel: string;
      disabled: boolean;
      projectId: string;
    }
  | {
      key: string;
      source: "filesystem";
      name: string;
      rootPath: string;
      repoKind: ProjectSearchResult["repoKind"];
      actionLabel: string;
    }
  | {
      key: string;
      source: "exact-path";
      name: string;
      rootPath: string;
      repoKind: "folder";
      actionLabel: string;
    };

export function ProjectSwitcherDialog() {
  let inputRef: HTMLInputElement | undefined;
  let debounceTimer: number | undefined;
  const state = harnessStore.state;
  const sendCommand = harnessStore.actions.sendCommand;
  const [selectedIndex, setSelectedIndex] = createSignal(0);

  const query = () => state.projectSearchQuery;
  const trimmedQuery = () => query().trim();

  const workspaceMatches = createMemo<WorkspaceMatch[]>(() => {
    const normalizedQuery = normalizePathForComparison(trimmedQuery());
    return state.workspace.projects
      .map((project) => {
        const normalizedName = normalizePathForComparison(project.name);
        const normalizedPath = normalizePathForComparison(project.rootPath);
        const matchKind = getWorkspaceMatchKind(normalizedQuery, normalizedName, normalizedPath);
        if (!matchKind) {
          return undefined;
        }

        return {
          projectId: project.id,
          name: project.name,
          rootPath: project.rootPath,
          isActive: project.id === state.workspace.activeProjectId,
          matchKind,
          repoKind: "git-repo"
        };
      })
      .filter((entry): entry is WorkspaceMatch => Boolean(entry));
  });

  const filesystemMatches = createMemo(() => {
    const workspaceKeys = new Set(workspaceMatches().map((result) => normalizePathForComparison(result.rootPath)));
    return state.projectSearchFilesystemResults.filter(
      (result) => !workspaceKeys.has(normalizePathForComparison(result.rootPath))
    );
  });

  const exactPathResult = createMemo<DialogResult | undefined>(() => {
    if (!isAbsolutePath(trimmedQuery())) {
      return undefined;
    }

    const queryKey = normalizePathForComparison(trimmedQuery());
    const alreadyRepresented =
      workspaceMatches().some((result) => normalizePathForComparison(result.rootPath) === queryKey) ||
      filesystemMatches().some((result) => normalizePathForComparison(result.rootPath) === queryKey);

    if (alreadyRepresented) {
      return undefined;
    }

    return {
      key: `exact:${queryKey}`,
      source: "exact-path",
      name: trimmedQuery().split(/[\\/]/).filter(Boolean).at(-1) || trimmedQuery(),
      rootPath: trimmedQuery(),
      repoKind: "folder",
      actionLabel: "Open path"
    };
  });

  const mergedResults = createMemo<DialogResult[]>(() => [
    ...workspaceMatches().map((result) => ({
      key: `workspace:${result.projectId}`,
      source: "workspace" as const,
      name: result.name,
      rootPath: result.rootPath,
      repoKind: result.repoKind,
      actionLabel: result.isActive ? "Current" : "Open now",
      disabled: false,
      projectId: result.projectId
    })),
    ...filesystemMatches().map((result) => ({
      key: `filesystem:${normalizePathForComparison(result.rootPath)}`,
      source: "filesystem" as const,
      name: result.name,
      rootPath: result.rootPath,
      repoKind: result.repoKind,
      actionLabel: "Add"
    })),
    ...(exactPathResult() ? [exactPathResult()!] : [])
  ]);

  const completionSuffix = createMemo(() => {
    const topResult = mergedResults()[0];
    return topResult ? getProjectSwitcherAutocompleteSuffix(trimmedQuery(), topResult.rootPath, topResult.source) : undefined;
  });

  createEffect(() => {
    if (!state.projectSwitcherOpen) {
      if (debounceTimer !== undefined) {
        window.clearTimeout(debounceTimer);
        debounceTimer = undefined;
      }
      return;
    }

    // Run on the task queue (not microtask) so we focus the input after the
    // shared Dialog primitive finishes focusing its own surface ref.
    const timer = window.setTimeout(() => inputRef?.focus(), 0);
    onCleanup(() => window.clearTimeout(timer));
  });

  createEffect(() => {
    if (!state.projectSwitcherOpen) {
      return;
    }

    mergedResults().length;
    setSelectedIndex(0);
  });

  createEffect(() => {
    if (!state.projectSwitcherOpen) {
      return;
    }

    const currentQuery = trimmedQuery();
    if (!shouldSearchProjects(currentQuery)) {
      harnessStore.clearProjectSearchResults();
      return;
    }

    if (debounceTimer !== undefined) {
      window.clearTimeout(debounceTimer);
    }

    debounceTimer = window.setTimeout(() => {
      const requestId = createRequestId();
      harnessStore.startProjectSearch(requestId, currentQuery);
      sendCommand({
        type: "project.search",
        requestId,
        payload: {
          query: currentQuery
        }
      });
    }, 150);
  });

  onCleanup(() => {
    if (debounceTimer !== undefined) {
      window.clearTimeout(debounceTimer);
    }
  });

  function handleBrowse() {
    harnessStore.closeProjectSwitcher();
    sendCommand({
      type: "project.browse",
      requestId: createRequestId()
    });
  }

  function openResult(result: DialogResult | undefined) {
    if (!result) {
      return;
    }

    if (result.source === "workspace") {
      if (result.projectId === state.workspace.activeProjectId) {
        harnessStore.closeProjectSwitcher();
        return;
      }

      sendCommand({
        type: "project.activate",
        requestId: createRequestId(),
        payload: {
          projectId: result.projectId
        }
      });
      return;
    }

    sendCommand({
      type: "project.add",
      requestId: createRequestId(),
      payload: {
        rootPath: result.rootPath
      }
    });
  }

  function handleInputKeyDown(event: KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((current) => Math.min(current + 1, Math.max(mergedResults().length - 1, 0)));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === "Tab") {
      const suffix = completionSuffix();
      if (!suffix) {
        return;
      }

      event.preventDefault();
      harnessStore.setProjectSearchQuery(`${query()}${suffix}`);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      openResult(mergedResults()[selectedIndex()]);
    }
  }

  function resultBadge(result: DialogResult) {
    return result.repoKind === "git-repo" ? "Git repo" : "Folder";
  }

  return (
    <Dialog
      open={state.projectSwitcherOpen}
      title="Open or switch project"
      eyebrow="Projects"
      description="Cmd/Ctrl+K reliable. Cmd/Ctrl+Space works when browser receives it."
      class="max-w-3xl"
      onClose={() => harnessStore.closeProjectSwitcher()}
      footer={
        <ActionButton
          tooltip="Browse for project folder"
          icon={<FolderOpen class="h-4 w-4" />}
          variant="secondary"
          onClick={handleBrowse}
        >
          Browse folder
        </ActionButton>
      }
    >
      <div class="space-y-3">
        <div class="relative">
          <Input
            ref={inputRef}
            value={query()}
            placeholder="Search recent projects or type a path"
            class="relative bg-white"
            data-project-switcher-input="true"
            onInput={(event) => harnessStore.setProjectSearchQuery(event.currentTarget.value)}
            onKeyDown={handleInputKeyDown}
          />
          <Show when={completionSuffix()}>
            {(suffix) => (
              <div class="pointer-events-none absolute inset-0 flex items-center rounded-xl border border-transparent px-3 py-2 text-xs">
                <span class="invisible whitespace-pre">{query()}</span>
                <span class="truncate text-(--muted)">{suffix()}</span>
              </div>
            )}
          </Show>
          <Search class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--muted)" />
        </div>

        <div class="flex flex-wrap gap-2 text-[0.625rem] uppercase tracking-[0.14em] text-(--muted)">
          <span>Tab autocomplete</span>
          <span>Enter open</span>
          <span>↑↓ move</span>
        </div>

        <div class="grid gap-4 lg:grid-cols-2">
          <ResultSection title="Recent projects">
            <Show
              when={workspaceMatches().length > 0}
              fallback={<ResultEmptyState message="No recent projects match current search." />}
            >
              <For each={workspaceMatches()}>
                {(result, index) => (
                  <ResultRow
                    result={mergedResults()[index()]}
                    selected={selectedIndex() === index()}
                    onHover={() => setSelectedIndex(index())}
                    onOpen={() => openResult(mergedResults()[index()])}
                    badgeLabel={resultBadge(mergedResults()[index()])}
                  />
                )}
              </For>
            </Show>
          </ResultSection>

          <ResultSection title="Filesystem matches">
            <Show
              when={filesystemMatches().length > 0 || exactPathResult()}
              fallback={
                <ResultEmptyState
                  message={
                    state.projectSearchLoading
                      ? "Searching local folders..."
                      : trimmedQuery()
                      ? "No folder matches yet."
                      : "Type to search local folders."
                  }
                />
              }
            >
              <For each={filesystemMatches()}>
                {(result, index) => {
                  const absoluteIndex = () => workspaceMatches().length + index();
                  return (
                    <ResultRow
                      result={mergedResults()[absoluteIndex()]}
                      selected={selectedIndex() === absoluteIndex()}
                      onHover={() => setSelectedIndex(absoluteIndex())}
                      onOpen={() => openResult(mergedResults()[absoluteIndex()])}
                      badgeLabel={resultBadge(mergedResults()[absoluteIndex()])}
                    />
                  );
                }}
              </For>
              <Show when={exactPathResult()}>
                {(result) => {
                  const absoluteIndex = () => mergedResults().length - 1;
                  return (
                    <ResultRow
                      result={result()}
                      selected={selectedIndex() === absoluteIndex()}
                      onHover={() => setSelectedIndex(absoluteIndex())}
                      onOpen={() => openResult(result())}
                      badgeLabel="Exact path"
                    />
                  );
                }}
              </Show>
            </Show>
          </ResultSection>
        </div>
      </div>
    </Dialog>
  );
}

function ResultSection(props: { title: string; children: any }) {
  return (
    <section class="space-y-2">
      <div class="text-[0.625rem] font-semibold uppercase tracking-[0.16em] text-(--muted)">{props.title}</div>
      <div class="space-y-2">{props.children}</div>
    </section>
  );
}

function ResultEmptyState(props: { message: string }) {
  return (
    <div class="rounded-2xl border border-dashed border-(--border) bg-white/45 p-4 text-xs leading-5 text-(--muted)">
      {props.message}
    </div>
  );
}

function ResultRow(props: {
  result: DialogResult;
  selected: boolean;
  onHover: () => void;
  onOpen: () => void;
  badgeLabel: string;
}) {
  return (
    <Button
      variant={props.selected ? "default" : "secondary"}
      class={`h-auto w-full justify-start rounded-2xl px-3 py-3 text-left ${
        props.selected ? "" : "bg-white/60"
      }`}
      aria-label={`${props.result.actionLabel} ${props.result.rootPath}`}
      disabled={props.result.source === "workspace" && props.result.disabled}
      onMouseEnter={props.onHover}
      onClick={props.onOpen}
    >
      <div class="min-w-0 flex-1">
        <div class="flex min-w-0 items-center gap-2">
          <Tooltip content={props.result.name}>
            <span class="min-w-0 flex-1 truncate font-semibold">{props.result.name}</span>
          </Tooltip>
          <span class="shrink-0 rounded-full border border-current/20 px-2 py-0.5 text-[0.55rem] uppercase tracking-[0.14em]">
            {props.badgeLabel}
          </span>
          <span class="shrink-0 text-[0.55rem] uppercase tracking-[0.14em] opacity-80">{props.result.actionLabel}</span>
        </div>
        <div class="mt-1 truncate text-[0.675rem] opacity-80">{truncateMiddle(props.result.rootPath, 52)}</div>
      </div>
    </Button>
  );
}

function getWorkspaceMatchKind(
  normalizedQuery: string,
  normalizedName: string,
  normalizedRootPath: string
): ProjectSearchResult["matchKind"] | undefined {
  if (!normalizedQuery) {
    return "substring";
  }

  if (normalizedRootPath === normalizedQuery) {
    return "exact";
  }

  if (normalizedRootPath.startsWith(normalizedQuery)) {
    return "path-prefix";
  }

  if (normalizedName.startsWith(normalizedQuery)) {
    return "name-prefix";
  }

  if (normalizedName.includes(normalizedQuery) || normalizedRootPath.includes(normalizedQuery)) {
    return "substring";
  }

  return undefined;
}

export function getProjectSwitcherAutocompleteSuffix(
  query: string,
  candidateRootPath: string,
  source: DialogResult["source"]
) {
  const currentQuery = query.trim();
  if (!currentQuery || source === "exact-path" || !isPathPrefixMatch(currentQuery, candidateRootPath)) {
    return undefined;
  }

  const normalizedQuery = normalizePathForComparison(currentQuery);
  const normalizedCandidate = normalizePathForComparison(candidateRootPath);
  if (normalizedQuery === normalizedCandidate) {
    return undefined;
  }

  return candidateRootPath.slice(currentQuery.length);
}

export function shouldSearchProjects(query: string) {
  const trimmedQuery = query.trim();
  return Boolean(trimmedQuery) && (isAbsolutePath(trimmedQuery) || trimmedQuery.length >= 2);
}

