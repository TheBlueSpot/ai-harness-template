import { afterEach, expect, test } from "bun:test";
import { createUiTest } from "../utils/tests/test-harness";
import { applyThemePreference, disposeThemePreferenceSync } from "./theme-apply";

createUiTest("applyThemePreference", () => {
  afterEach(() => {
    disposeThemePreferenceSync();
  });

  test("marks subsequent theme changes for slow style transitions", () => {
    const root = document.createElement("div");

    applyThemePreference({ themeId: "harness", mode: "system" }, root);
    expect(root.dataset.themeTransition).toBeUndefined();

    applyThemePreference({ themeId: "harness", mode: "dark" }, root);
    expect(root.dataset.themeTransition).toBe("active");

    disposeThemePreferenceSync();
    expect(root.dataset.themeTransition).toBeUndefined();
  });
});
