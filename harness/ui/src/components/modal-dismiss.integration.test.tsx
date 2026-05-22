/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import { createUiTest } from "../utils/tests/test-harness";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { ExecutionPlanDialog } from "./execution-plan-dialog";
import { PreferencesModal } from "./preferences-modal";
import { harnessStore } from "../harness-store";
import { clearBrowserStateForTests, seedHarnessStoreForTests } from "../utils/tests/store-test-utils";
import { createExecutionPlanFixture, createHarnessStateFixture } from "../utils/tests/test-fixtures";

createUiTest("Modal dismiss integration", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
  });

  it("dismisses the preferences panel back to projects", () => {
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        activeLeftTab: "preferences",
        activeSurface: "preferences"
      })
    );

    render(() => <PreferencesModal />);
    expect(screen.getByText("AI & Providers")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(harnessStore.state.activeLeftTab).toBe("projects");
  });

  it("dismisses the execution plan dialog from Escape and keeps the body scrollable", async () => {
    const plan = createExecutionPlanFixture();
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        executionPlanDialogOpen: true,
        selectedExecutionPlan: plan
      })
    );

    render(() => <ExecutionPlanDialog executionPlan={harnessStore.state.selectedExecutionPlan} />);
    const dialog = screen.getByRole("dialog", { name: "Execution plan" });
    const scrollBody = dialog.querySelector(".overflow-auto");
    expect(scrollBody).not.toBeNull();
    expect(scrollBody?.className).toContain("max-h-[80vh]");

    fireEvent.keyDown(await screen.findByRole("dialog", { name: "Execution plan" }), { key: "Escape" });
    expect(harnessStore.state.executionPlanDialogOpen).toBe(false);
  });
});
