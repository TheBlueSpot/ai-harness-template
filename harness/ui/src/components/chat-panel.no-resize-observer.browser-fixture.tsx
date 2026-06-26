/** @jsxImportSource solid-js */
import { onMount } from "solid-js";
import { render } from "solid-js/web";
import { createChatMessage, createEmptySession } from "../../../shared/protocol";
import "../styles.css";
import { createHarnessStore, harnessStore, setActiveHarnessStore } from "../harness-store";
import { createToastStoreForProvider, setActiveToastStore } from "../toast-store";
import { createHarnessStateFixture, createViewProjectFixture } from "../utils/tests/test-fixtures";
import { ChatPanel } from "./chat-panel";

Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, writable: true, value: undefined });
setActiveHarnessStore(createHarnessStore());
setActiveToastStore(createToastStoreForProvider());

const threadId = "browser-project-chat-no-resize-observer-thread";
const projectId = "browser-project-chat-no-resize-observer-project";
const messages = Array.from({ length: 160 }, (_, index) =>
  createChatMessage(index % 2 === 0 ? "user" : "assistant", `Project chat browser message ${index}`, {
    id: `browser-project-chat-no-resize-observer-message-${index}`
  })
);
const project = createViewProjectFixture({
  id: projectId,
  activeThreadId: threadId,
  session: {
    ...createEmptySession(threadId),
    messages
  },
  threads: [
    {
      id: threadId,
      title: "Browser project chat no resize observer thread",
      kind: "user",
      titleSource: "custom",
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: messages.length,
      lastMessagePreview: messages.at(-1)?.content,
      badgeState: "idle"
    }
  ]
});
const emptyProject = createViewProjectFixture({
  id: projectId,
  activeThreadId: threadId,
  session: createEmptySession(threadId),
  threads: [
    {
      id: threadId,
      title: "Browser project chat no resize observer thread",
      kind: "user",
      titleSource: "custom",
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 0,
      badgeState: "idle"
    }
  ]
});

harnessStore.actions.setCommandDispatcher(() => undefined);

function FixtureApp() {
  let host: HTMLDivElement | undefined;

  onMount(() => {
    requestAnimationFrame(() => {
      seedProjectChatState(emptyProject);
      waitFrames(4, () => {
        seedProjectChatState(project);
        waitFrames(8, () => {
          if (host) {
            host.style.height = "620px";
          }
          requestAnimationFrame(() => {
            if (host) {
              host.dataset.testFixtureReady = "1";
            }
          });
        });
      });
    });
  });

  return (
    <main
      style={{
        width: "980px",
        height: "700px",
        padding: "16px",
        "box-sizing": "border-box",
        display: "flex",
        "flex-direction": "column"
      }}
    >
      <div
        ref={host}
        data-test-fixture-host=""
        data-test-fixture-ready="0"
        style={{
          display: "flex",
          "min-height": "0",
          height: "1px",
          overflow: "hidden"
        }}
      >
        <ChatPanel />
      </div>
    </main>
  );
}

function waitFrames(count: number, callback: () => void) {
  if (count <= 0) {
    callback();
    return;
  }
  requestAnimationFrame(() => waitFrames(count - 1, callback));
}

function seedProjectChatState(nextProject: typeof project) {
  harnessStore.replaceStateForTests(
    createHarnessStateFixture({
      connectionState: "connected",
      chatPaneTab: "chat",
      workspace: {
        activeProjectId: nextProject.id,
        projects: [nextProject]
      }
    })
  );
  harnessStore.actions.setCommandDispatcher(() => undefined);
}

render(() => <FixtureApp />, document.getElementById("root")!);
