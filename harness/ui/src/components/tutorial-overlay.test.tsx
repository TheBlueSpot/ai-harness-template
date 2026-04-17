/** @jsxImportSource solid-js */
import { afterEach, beforeEach, expect, it, mock } from "bun:test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createUiTest } from "../utils/tests/test-harness";
import { clearBrowserStateForTests } from "../utils/tests/store-test-utils";
import { TutorialOverlay } from "./tutorial-overlay";

createUiTest("TutorialOverlay", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
    (globalThis as typeof globalThis & { __padPilotDisablePortals?: boolean }).__padPilotDisablePortals = true;
  });

  afterEach(() => {
    (globalThis as typeof globalThis & { __padPilotDisablePortals?: boolean }).__padPilotDisablePortals = true;
  });

  it("shows fallback instructions when the target is missing and wires next/back/skip", async () => {
    const onBack = mock(() => undefined);
    const onNext = mock(() => undefined);
    const onClose = mock(() => undefined);

    render(() => <TutorialOverlay tutorialId="open-project" stepIndex={1} onBack={onBack} onNext={onNext} onClose={onClose} />);

    expect(await screen.findByText(/If the project sidebar is hidden/i)).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));

    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
