/** @jsxImportSource solid-js */
import { afterEach, beforeEach, expect, it } from "bun:test";
import { createUiTest } from "../../utils/tests/test-harness";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { clearBrowserStateForTests } from "../../utils/tests/store-test-utils";
import { clearOverlayStackForTests } from "./overlay-stack";
import { Popover } from "./popover";
import { SheetContent } from "./sheet";

createUiTest("SheetContent", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
    clearOverlayStackForTests();
    (globalThis as typeof globalThis & { __padPilotDisablePortals?: boolean }).__padPilotDisablePortals = true;
  });

  afterEach(() => {
    (globalThis as typeof globalThis & { __padPilotDisablePortals?: boolean }).__padPilotDisablePortals = true;
    document.querySelectorAll("[data-test-primitive-portal-root]").forEach((root) => root.remove());
  });

  it("renders nothing when closed", () => {
    render(() => (
      <SheetContent open={false} title="Hidden sheet">
        <div>Hidden child</div>
      </SheetContent>
    ));

    expect(screen.queryByText("Hidden child")).toBeNull();
  });

  it("renders title and children when open", () => {
    render(() => (
      <SheetContent open title="Project sheet">
        <div>Sheet child</div>
      </SheetContent>
    ));

    expect(screen.getByText("Project sheet")).not.toBeNull();
    expect(screen.getByText("Sheet child")).not.toBeNull();
  });

  it("keeps body shrinkable and viewport-filled for mobile workspace sheets", () => {
    render(() => (
      <SheetContent open title="Workspace">
        <div>Sheet child</div>
      </SheetContent>
    ));

    const sheet = screen.getByText("Workspace").closest("aside");
    const body = document.querySelector("[data-test-sheet-body]");

    expect(sheet?.className).toContain("h-[100dvh]");
    expect(sheet?.className).toContain("z-[71]");
    expect(sheet?.className).toContain("overflow-hidden");
    expect(body?.className).toContain("min-h-0");
    expect(body?.className).toContain("flex-1");
    expect(body?.className).toContain("overflow-hidden");
  });

  it("closes from backdrop click and close button click", () => {
    let closeCount = 0;
    render(() => (
      <SheetContent open title="Closable sheet" onClose={() => closeCount += 1}>
        <div>Sheet body</div>
      </SheetContent>
    ));

    const sheet = screen.getByText("Closable sheet").closest("aside");
    const backdrop = sheet?.previousElementSibling as HTMLElement | null;
    if (!backdrop) {
      throw new Error("Expected sheet backdrop");
    }

    fireEvent.click(backdrop);
    fireEvent.click(screen.getByRole("button", { name: "Close sheet" }));

    expect(closeCount).toBe(2);
  });

  it("closes from Escape", async () => {
    let closed = false;
    render(() => (
      <SheetContent open title="Escapable sheet" onClose={() => closed = true}>
        <div>Sheet body</div>
      </SheetContent>
    ));

    const sheet = await screen.findByText("Escapable sheet");
    fireEvent.keyDown(sheet.closest("aside") as HTMLElement, { key: "Escape" });
    expect(closed).toBe(true);
  });

  it("does not close from content click", () => {
    let closed = false;
    render(() => (
      <SheetContent open title="Stable sheet" onClose={() => closed = true}>
        <button type="button">Inner sheet action</button>
      </SheetContent>
    ));

    fireEvent.click(screen.getByRole("button", { name: "Inner sheet action" }));
    expect(closed).toBe(false);
  });

  it("traps Tab focus inside sheet", async () => {
    const firstButton = document.createElement("button");
    firstButton.type = "button";
    firstButton.textContent = "First sheet action";
    const lastButton = document.createElement("button");
    lastButton.type = "button";
    lastButton.textContent = "Last sheet action";
    render(() => (
      <SheetContent open title="Focused sheet">
        <div>{firstButton}{lastButton}</div>
      </SheetContent>
    ));

    await screen.findByText("Focused sheet");
    const closeButton = screen.getByRole("button", { name: "Close sheet" });
    lastButton.focus();
    fireEvent.keyDown(lastButton, { key: "Tab" });

    expect(document.activeElement).toBe(closeButton);
  });

  it("closes nested popover before sheet on Escape", async () => {
    let sheetClosed = false;
    let popoverClosed = false;
    render(() => (
      <SheetContent open title="Nested sheet" onClose={() => sheetClosed = true}>
        <Popover
          open
          onClose={() => popoverClosed = true}
          content={<button type="button">Popover sheet action</button>}
        >
          <button type="button">Open popover</button>
        </Popover>
      </SheetContent>
    ));

    const popoverAction = await screen.findByText("Popover sheet action");
    await Promise.resolve();
    fireEvent.keyDown(popoverAction, { key: "Escape" });

    expect(popoverClosed).toBe(true);
    expect(sheetClosed).toBe(false);
  });
});
