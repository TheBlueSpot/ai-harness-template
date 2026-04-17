/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createUiTest } from "../utils/tests/test-harness";
import { clearBrowserStateForTests } from "../utils/tests/store-test-utils";
import { SetupChecklistCard } from "./setup-checklist-card";

createUiTest("SetupChecklistCard", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
  });

  it("renders required checks before unsupported items and fires actions", () => {
    const actions: string[] = [];
    const { container } = render(() => (
      <SetupChecklistCard
        checks={[
          {
            id: "mcp-servers",
            title: "MCP servers",
            summary: "Not shipped yet",
            status: "unsupported",
            requiredForFirstTask: false,
            updatedAt: new Date().toISOString()
          },
          {
            id: "project-selected",
            title: "Open a project",
            summary: "Pick a repo root",
            status: "action-required",
            requiredForFirstTask: true,
            updatedAt: new Date().toISOString(),
            primaryAction: {
              kind: "open-project-switcher",
              label: "Open project"
            }
          }
        ]}
        readyRequiredCount={0}
        totalRequiredCount={1}
        onAction={(action) => actions.push(action.kind)}
      />
    ));

    const articles = Array.from(container.querySelectorAll("article")).map((article) => article.textContent ?? "");
    expect(articles[0]).toContain("Open a project");
    expect(articles[1]).toContain("MCP servers");

    fireEvent.click(screen.getByRole("button", { name: "Open project" }));
    expect(actions).toEqual(["open-project-switcher"]);
  });
});
