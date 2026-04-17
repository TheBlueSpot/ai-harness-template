/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import { createUiTest } from "../../utils/tests/test-harness";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { clearBrowserStateForTests } from "../../utils/tests/store-test-utils";
import { Dialog } from "./dialog";

createUiTest("Dialog", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
  });

  it("renders nothing when closed", () => {
    render(() => <Dialog open={false} title="Hidden dialog">Hidden body</Dialog>);

    expect(screen.queryByRole("dialog", { name: "Hidden dialog" })).toBeNull();
  });

  it("renders dialog shell, content, footer, and body class when open", async () => {
    const footerButton = document.createElement("button");
    footerButton.type = "button";
    footerButton.textContent = "Footer action";

    render(() => (
      <Dialog
        open
        title="Visible dialog"
        description="Dialog description"
        contentClass="test-dialog-body"
        footer={footerButton}
      >
        Visible body
      </Dialog>
    ));

    const dialog = await screen.findByRole("dialog", { name: "Visible dialog" });
    expect(dialog).not.toBeNull();
    expect(screen.getByText("Dialog description")).not.toBeNull();
    expect(screen.getByText("Visible body")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Footer action" })).not.toBeNull();
    expect(dialog.querySelector(".test-dialog-body")).not.toBeNull();
  });

  it("calls onClose from backdrop click and close button click", async () => {
    let closeCount = 0;
    render(() => <Dialog open title="Closable dialog" onClose={() => closeCount += 1}>Body</Dialog>);

    const dialog = await screen.findByRole("dialog", { name: "Closable dialog" });
    const backdrop = dialog.parentElement?.previousElementSibling as HTMLElement | null;
    if (!backdrop) {
      throw new Error("Expected dialog backdrop");
    }

    fireEvent.click(backdrop);
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));

    expect(closeCount).toBe(2);
  });

  it("calls onClose from Escape", async () => {
    let closed = false;
    render(() => <Dialog open title="Escapable dialog" onClose={() => closed = true}>Body</Dialog>);

    const dialog = await screen.findByRole("dialog", { name: "Escapable dialog" });
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(closed).toBe(true);
  });

  it("does not close when clicking inside dialog content", async () => {
    let closed = false;
    const innerButton = document.createElement("button");
    innerButton.type = "button";
    innerButton.textContent = "Inner action";
    render(() => <Dialog open title="Stable dialog" onClose={() => closed = true}>{innerButton}</Dialog>);

    fireEvent.click(await screen.findByRole("button", { name: "Inner action" }));
    expect(closed).toBe(false);
  });
});
