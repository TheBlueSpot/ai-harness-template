/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import { createUiTest } from "../utils/tests/test-harness";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { ExecutionPlanDialog } from "./execution-plan-dialog";
import { harnessStore } from "../harness-store";
import { clearBrowserStateForTests, seedHarnessStoreForTests } from "../utils/tests/store-test-utils";
import { createExecutionPlanFixture, createHarnessStateFixture } from "../utils/tests/test-fixtures";

createUiTest("ExecutionPlanDialog", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
  });

  it("renders execution plan details from store state", () => {
    const plan = createExecutionPlanFixture({
      summary: "# Ship markdown",
      finalExecutionBrief: "Use **safe** markdown.",
      prerequisites: [
        {
          id: "prereq-1",
          title: "Prep",
          instruction: "- install deps",
          reason: "Need [docs](https://example.com)",
          requiredForTaskIds: ["task-1"],
          owner: "main",
          status: "pending"
        }
      ],
      contracts: [
        {
          taskId: "task-1",
          title: "Inspect",
          instruction: "Render ```ts\ncode\n```",
          effortPoints: 2,
          ownedPaths: ["src"],
          dependsOnPrerequisiteIds: ["prereq-1"],
          deliverables: ["inspection"],
          integrationPoints: ["chat"],
          verificationScope: "owned-files-only",
          verificationCommands: ["bun test"],
          mergeNotes: "Merge cleanly"
        }
      ]
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        executionPlanDialogOpen: true,
        selectedExecutionPlan: plan
      })
    );

    render(() => <ExecutionPlanDialog executionPlan={harnessStore.state.selectedExecutionPlan} />);

    const dialog = screen.getByRole("dialog", { name: "Execution plan" });
    expect(dialog).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Ship markdown" })).not.toBeNull();
    expect(screen.getByText("safe").tagName).toBe("STRONG");
    expect(screen.getByText(plan.prerequisites[0]!.title)).not.toBeNull();
    expect(screen.getByText(plan.contracts[0]!.title)).not.toBeNull();
    expect(screen.getByRole("button", { name: "Copy code block" })).not.toBeNull();
    expect(dialog.querySelector(".max-h-\\[80vh\\]")).not.toBeNull();
    expect(dialog.querySelector(".overflow-auto")).not.toBeNull();
  });

  it("closes from Escape and backdrop click", async () => {
    const plan = createExecutionPlanFixture();
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        executionPlanDialogOpen: true,
        selectedExecutionPlan: plan
      })
    );

    render(() => <ExecutionPlanDialog executionPlan={harnessStore.state.selectedExecutionPlan} />);
    fireEvent.keyDown(await screen.findByRole("dialog", { name: "Execution plan" }), { key: "Escape" });
    expect(harnessStore.state.executionPlanDialogOpen).toBe(false);
    expect(harnessStore.state.selectedExecutionPlan).toBeUndefined();

    harnessStore.openExecutionPlanDialog(plan);
    const dialog = screen.getByRole("dialog", { name: "Execution plan" });
    const backdrop = dialog.parentElement?.previousElementSibling as HTMLElement | null;
    if (!backdrop) {
      throw new Error("Expected execution plan backdrop");
    }

    fireEvent.click(backdrop);
    expect(harnessStore.state.executionPlanDialogOpen).toBe(false);
  });
});
