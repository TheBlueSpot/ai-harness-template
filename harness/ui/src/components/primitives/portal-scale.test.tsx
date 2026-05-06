/** @jsxImportSource solid-js */
import { afterEach, beforeEach, expect, it } from "bun:test";
import { render, screen } from "@solidjs/testing-library";
import { createUiTest } from "../../utils/tests/test-harness";
import { Popover } from "./popover";
import { getPrimitivePortalRoot } from "./primitive-portal";

createUiTest("portal overlay scale", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { __padPilotDisablePortals?: boolean }).__padPilotDisablePortals = true;
  });

  afterEach(() => {
    (globalThis as typeof globalThis & { __padPilotDisablePortals?: boolean }).__padPilotDisablePortals = false;
    document.querySelectorAll("[data-test-primitive-portal-root]").forEach((root) => root.remove());
  });

  it("scales popover portal content with the app shell", () => {
    render(() => (
      <Popover open={true} content={<div>Popover body</div>}>
        <button type="button">Open popover</button>
      </Popover>
    ));

    const popover = screen.getByText("Popover body").closest("[data-test-popover-content]");
    expect(popover?.classList.contains("app-zoom-portal-content")).toBe(true);
  });

  it("reuses one document root per portal layer", () => {
    (globalThis as typeof globalThis & { __padPilotDisablePortals?: boolean }).__padPilotDisablePortals = false;

    const firstPopoverRoot = getPrimitivePortalRoot("popover");
    const secondPopoverRoot = getPrimitivePortalRoot("popover");
    const tooltipRoot = getPrimitivePortalRoot("tooltip");

    expect(firstPopoverRoot).toBe(secondPopoverRoot);
    expect(tooltipRoot).not.toBe(firstPopoverRoot);
    expect(document.querySelectorAll('[data-primitive-portal-layer="popover"]').length).toBe(1);
    expect(document.querySelectorAll("[data-test-primitive-portal-root]").length).toBe(2);
  });
});
