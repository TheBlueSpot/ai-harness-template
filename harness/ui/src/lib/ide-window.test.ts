import { beforeEach, expect, it } from "bun:test";
import { harnessStore } from "../harness-store";
import { clearBrowserStateForTests } from "../utils/tests/store-test-utils";
import { createUiTest } from "../utils/tests/test-harness";
import { createIdeWindowUrl, OPEN_IDE_WINDOW_EVENT, openIdeWindow, type OpenIdeWindowInput } from "./ide-window";

createUiTest("ide-window", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
  });

  it("dispatches open IDE events and activates the IDE surface", () => {
    const openIdeEvents: OpenIdeWindowInput[] = [];
    const collectOpenIdeEvent = (event: Event) => {
      if (event instanceof CustomEvent) {
        openIdeEvents.push(event.detail as OpenIdeWindowInput);
      }
    };
    window.addEventListener(OPEN_IDE_WINDOW_EVENT, collectOpenIdeEvent);
    try {
      const result = openIdeWindow({ projectId: "project-1", threadId: "thread-1" });

      expect(result).toBeUndefined();
      expect(openIdeEvents).toEqual([{ projectId: "project-1", threadId: "thread-1" }]);
      expect(harnessStore.state.activeSurface).toBe("ide");
    } finally {
      window.removeEventListener(OPEN_IDE_WINDOW_EVENT, collectOpenIdeEvent);
    }
  });

  it("builds IDE routes with project and thread selection", () => {
    expect(createIdeWindowUrl({ projectId: "project-1", threadId: "thread-1" })).toBe("/ide?projectId=project-1&threadId=thread-1");
  });
});
