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
    const plan = createExecutionPlanFixture();
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        executionPlanDialogOpen: true,
        selectedExecutionPlan: plan
      })
    );

    render(() => <ExecutionPlanDialog executionPlan={harnessStore.state.selectedExecutionPlan} />);

    const dialog = screen.getByRole("dialog", { name: "Execution plan" });
    expect(dialog).not.toBeNull();
    expect(screen.getByText(plan.summary)).not.toBeNull();
    expect(screen.getByText(plan.prerequisites[0]!.title)).not.toBeNull();
    expect(screen.getByText(plan.contracts[0]!.title)).not.toBeNull();
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
