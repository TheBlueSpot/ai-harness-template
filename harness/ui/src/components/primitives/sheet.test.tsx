/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import { createUiTest } from "../../utils/tests/test-harness";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { clearBrowserStateForTests } from "../../utils/tests/store-test-utils";
import { clearOverlayStackForTests } from "./overlay-stack";
import { SheetContent } from "./sheet";

createUiTest("SheetContent", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
    clearOverlayStackForTests();
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
});
