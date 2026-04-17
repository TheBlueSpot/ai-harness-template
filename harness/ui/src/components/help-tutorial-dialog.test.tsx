/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createUiTest } from "../utils/tests/test-harness";
import { clearBrowserStateForTests } from "../utils/tests/store-test-utils";
import { HelpTutorialDialog } from "./help-tutorial-dialog";

createUiTest("HelpTutorialDialog", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
  });

  it("starts tutorials from the dialog", async () => {
    const started: string[] = [];

    render(() => (
      <HelpTutorialDialog
        open
        setup={{
          launchMode: "source",
          updatedAt: new Date().toISOString(),
          readyRequiredCount: 1,
          totalRequiredCount: 4,
          checks: []
        }}
        completedTutorialIds={[]}
        dismissedTutorialIds={[]}
        onClose={() => undefined}
        onStartTutorial={(tutorialId) => started.push(tutorialId)}
      />
    ));

    fireEvent.click(await screen.findByRole("button", { name: /Start Open a project/i }));
    expect(started).toEqual(["open-project"]);
  });
});
