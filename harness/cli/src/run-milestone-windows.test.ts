import { describe, expect, test } from "bun:test";
import type { ChatMessage, ChatSessionState, RunMilestonesMessageMetadata } from "../../shared/protocol";
import {
  aggregateMilestoneLines,
  classifyMilestoneLine,
  extractMilestoneLines,
  renderMilestoneLines,
  RunTranscriptDraft,
  RunMilestoneWindowManager,
  WINDOW_IDLE_CLOSE_MS
} from "./run-milestone-windows";

describe("run milestone windows", () => {
  test("renders repeated milestone lines with counts", () => {
    expect(renderMilestoneLines([
      "Subagent task-2: shell failed.",
      "Subagent task-2: shell failed.",
      "Subagent task-1: shell failed."
    ])).toBe("- Subagent task-2: shell failed. x2\n- Subagent task-1: shell failed.");
  });

  test("uses 5s idle windows for live progress", () => {
    expect(WINDOW_IDLE_CLOSE_MS).toBe(5000);
  });

  test("keeps first-seen order while aggregating duplicates", () => {
    expect(aggregateMilestoneLines(["b", "a", "b", "c", "a"])).toEqual([
      { line: "b", count: 2 },
      { line: "a", count: 2 },
      { line: "c", count: 1 }
    ]);
  });

  test("applies overflow after aggregation", () => {
    const lines = Array.from({ length: 18 }, (_, index) => `line-${index + 1}`);
    lines.push("line-1", "line-1");

    expect(renderMilestoneLines(lines)).toContain("- line-1 x3");
    expect(renderMilestoneLines(lines)).toContain("- +2 more updates");
  });

  test("splits merged milestone tokens from streaming text", () => {
    expect(extractMilestoneLines("MILESTONE: first step MILESTONE: second step")).toEqual(["first step", "second step"]);
  });

  test("renders long lines as previews but stores full line metadata", () => {
    const longLine = `Subagent task: ${"x".repeat(600)}`;
    let latestMessage: ChatMessage | undefined;
    const state: ChatSessionState = {
      sessionId: "thread-1",
      messages: [],
      isStreaming: false
    };
    const manager = new RunMilestoneWindowManager({
      append(input) {
        latestMessage = createMessage("message-1", input.content, input.metadata);
        state.messages = [latestMessage];
        return { message: latestMessage, state };
      },
      update(input) {
        latestMessage = createMessage(input.messageId, input.content, input.metadata);
        state.messages = [latestMessage];
        return { message: latestMessage, state };
      },
      emitAppended() {},
      emitUpdated() {}
    });

    manager.record({ projectId: "project-1", threadId: "thread-1", runId: "run-1", line: longLine });
    manager.closeRun("project-1", "thread-1", "run-1");

    expect(latestMessage?.content.length).toBeLessThan(longLine.length);
    expect(latestMessage?.metadata?.type === "run-milestones" ? latestMessage.metadata.lines?.[0] : undefined).toBe(longLine);
    expect(latestMessage?.metadata?.type === "run-milestones" ? latestMessage.metadata.truncatedLineCount : undefined).toBe(1);
  });

  test("preserves raw lineCount metadata when content is compacted", () => {
    let latestMessage: ChatMessage | undefined;
    const state: ChatSessionState = {
      sessionId: "thread-1",
      messages: [],
      isStreaming: false
    };
    const manager = new RunMilestoneWindowManager({
      append(input) {
        latestMessage = createMessage("message-1", input.content, input.metadata);
        state.messages = [latestMessage];
        return { message: latestMessage, state };
      },
      update(input) {
        latestMessage = createMessage(input.messageId, input.content, input.metadata);
        state.messages = [latestMessage];
        return { message: latestMessage, state };
      },
      emitAppended() {},
      emitUpdated() {}
    });

    manager.record({ projectId: "project-1", threadId: "thread-1", runId: "run-1", line: "Subagent task-2: shell failed." });
    manager.record({ projectId: "project-1", threadId: "thread-1", runId: "run-1", line: "Subagent task-2: shell failed." });
    manager.closeRun("project-1", "thread-1", "run-1");

    expect(latestMessage?.content).toBe("- Subagent task-2: shell failed. x2");
    const metadata = latestMessage?.metadata;
    if (!metadata || metadata.type !== "run-milestones") {
      throw new Error("Expected run milestone metadata");
    }
    expect(metadata.lineCount).toBe(2);
    expect(metadata.hiddenLineCount).toBe(0);
  });

  test("updates open milestone messages in place and closes the same message", () => {
    let appendCount = 0;
    let updateCount = 0;
    let latestMessage: ChatMessage | undefined;
    const state: ChatSessionState = {
      sessionId: "thread-1",
      messages: [],
      isStreaming: false
    };
    const manager = new RunMilestoneWindowManager({
      append(input) {
        appendCount += 1;
        latestMessage = createMessage("message-1", input.content, input.metadata);
        state.messages = [latestMessage];
        return { message: latestMessage, state };
      },
      update(input) {
        updateCount += 1;
        latestMessage = createMessage(input.messageId, input.content, input.metadata);
        state.messages = [latestMessage];
        return { message: latestMessage, state };
      },
      emitAppended() {},
      emitUpdated() {}
    });

    manager.record({ projectId: "project-1", threadId: "thread-1", runId: "run-1", line: "Subagent Build assets: searching files..." });
    manager.record({ projectId: "project-1", threadId: "thread-1", runId: "run-1", line: "Subagent Build assets: shell running 5s+: rg --files ." });
    manager.record({ projectId: "project-1", threadId: "thread-1", runId: "run-1", line: "Subagent Build assets: shell running 5s+: rg --files ." });
    manager.closeRun("project-1", "thread-1", "run-1");

    expect(appendCount).toBe(1);
    expect(updateCount).toBe(1);
    expect(latestMessage?.id).toBe("message-1");
    expect(latestMessage?.content).toContain("Subagent Build assets: searching files");
    expect(latestMessage?.content).toContain("Subagent Build assets: shell running 5s+: rg --files . x2");
    expect(latestMessage?.metadata?.type === "run-milestones" ? latestMessage.metadata.status : undefined).toBe("closed");
  });

  test("buffers stable milestones into phase streaming tail and final rows", () => {
    const draft = new RunTranscriptDraft({ runId: "run-1" });

    expect(draft.recordMilestone("Subagent UI: wired HUD controls", "subagents")).toBe(true);
    draft.appendAssistantDelta("Done soon.");

    expect(draft.getSegments().map((segment) => segment.kind)).toEqual(["status", "assistant"]);
    const finalized = draft.finalizeMilestoneMessages();
    expect(finalized).toHaveLength(1);
    expect(finalized[0]?.metadata.phase).toBe("subagents");
    expect(finalized[0]?.content).toContain("**Subagents**");
  });

  test("classifies tool commands as rejected and generic activity as fallback", () => {
    expect(classifyMilestoneLine('Aggregator: shell running 5s+: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "git diff"')).toBe("reject");
    expect(classifyMilestoneLine("Subagent UI: checking files")).toBe("fallback");
    expect(classifyMilestoneLine("Subagent UI: wired HUD controls")).toBe("accept");
  });

  test("emits held fallback only once when stale caller requests it", () => {
    const draft = new RunTranscriptDraft({ runId: "run-1" });

    expect(draft.recordMilestone("Subagent UI: checking files", "subagents")).toBe(false);
    expect(draft.getSegments()).toHaveLength(0);
    expect(draft.emitHeldFallback("subagents")).toBe(true);
    expect(draft.emitHeldFallback("subagents")).toBe(false);
    expect(draft.getSegments()[0]?.content).toContain("checking files");
  });
});

function createMessage(id: string, content: string, metadata: RunMilestonesMessageMetadata): ChatMessage {
  return {
    id,
    role: "assistant",
    kind: "run-milestones",
    content,
    metadata,
    createdAt: new Date().toISOString()
  };
}
