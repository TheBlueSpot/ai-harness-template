import { expect, test } from "bun:test";
import { clearOverlayStackForTests, isTopOverlay, registerOverlay } from "./overlay-stack";

test("overlay stack gives higher-priority nested overlays Escape ownership", () => {
  clearOverlayStackForTests();
  const unregisterDialog = registerOverlay("dialog-test");
  const unregisterPopover = registerOverlay("popover-test");

  expect(isTopOverlay("popover-test")).toBe(true);
  expect(isTopOverlay("dialog-test")).toBe(false);

  unregisterPopover();
  expect(isTopOverlay("dialog-test")).toBe(true);
  unregisterDialog();
});
