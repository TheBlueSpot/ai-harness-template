import { harnessStore } from "../harness-store";

export type OpenIdeWindowInput = {
  projectId?: string;
  threadId?: string;
};

export const OPEN_IDE_WINDOW_EVENT = "pi-harness:open-ide";
export const IDE_POP_IN_EVENT = "pi-harness:ide-pop-in";

export function openIdeWindow(input: OpenIdeWindowInput = {}) {
  if (typeof window === "undefined") {
    return undefined;
  }

  window.dispatchEvent(new CustomEvent(OPEN_IDE_WINDOW_EVENT, { detail: input }));
  harnessStore.setActiveSurface("ide");
  return undefined;
}

export function createIdeWindowUrl(input: OpenIdeWindowInput = {}) {
  if (typeof window === "undefined") {
    return "/ide";
  }

  const url = new URL("/ide", window.location.origin);
  if (input.projectId) {
    url.searchParams.set("projectId", input.projectId);
  }
  if (input.threadId) {
    url.searchParams.set("threadId", input.threadId);
  }
  return `${url.pathname}${url.search}`;
}
