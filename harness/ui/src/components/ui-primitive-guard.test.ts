import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

function readComponent(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("UI primitive source guards", () => {
  test("dense run surfaces do not use native title tooltips for prompt or subtask context", () => {
    const tracePanel = readComponent("harness/ui/src/components/trace-panel.tsx");
    const chatPanel = readComponent("harness/ui/src/components/chat-panel.tsx");

    expect(tracePanel).not.toContain("title={runToShow()?.latestUserPrompt}");
    expect(tracePanel).not.toContain("title={task.title}");
    expect(chatPanel).not.toContain("title={project().activeRun?.latestUserPrompt");
  });

  test("shared dropdown renders option arrays through Solid list primitives", () => {
    const dropdown = readComponent("harness/ui/src/components/primitives/dropdown.tsx");

    expect(dropdown).toContain("<For each={props.options}>");
    expect(dropdown).not.toContain("props.options.map");
  });
});
