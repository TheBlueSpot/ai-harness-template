import { describe, expect, test } from "bun:test";
import {
  BUILT_IN_THEMES,
  DEFAULT_THEME_PREFERENCE,
  SEMANTIC_LABEL_TOKENS,
  THEME_CSS_VARIABLES,
  createDefaultCustomTheme,
  getCustomThemeFontOptions,
  getContrastRatio,
  normalizeThemeColorInput,
  normalizeThemeFontInput,
  normalizeThemePreference,
  resolveThemeTokens,
  validateThemeContrast,
  withCustomThemeToken
} from "./theme-model";

describe("theme model", () => {
  test("defines seven complete built-in themes with contrast-safe light and dark tokens", () => {
    expect(BUILT_IN_THEMES).toHaveLength(7);

    for (const theme of BUILT_IN_THEMES) {
      expect(theme.fonts.ui.length).toBeGreaterThan(0);
      expect(theme.fonts.display.length).toBeGreaterThan(0);
      expect(theme.fonts.mono.length).toBeGreaterThan(0);
      for (const mode of ["light", "dark"] as const) {
        for (const variable of THEME_CSS_VARIABLES) {
          expect(theme[mode][variable], `${theme.id} ${mode} ${variable}`).toBeTruthy();
        }
        expect(theme[mode]["--body-background"]).toMatch(/^#[0-9a-f]{6}$/);
        expect(theme[mode]["--app-background-grid"]).toBe("none");
        expect(validateThemeContrast(theme[mode]), `${theme.id} ${mode}`).toEqual([]);
      }
    }
  });

  test("repairs invalid stored preferences to the default", () => {
    expect(normalizeThemePreference({ themeId: "missing", mode: "sepia" })).toEqual(DEFAULT_THEME_PREFERENCE);
  });

  test("merges custom theme tokens from a base preset", () => {
    const preference = withCustomThemeToken(
      {
        themeId: "custom",
        mode: "light",
        custom: createDefaultCustomTheme("github")
      },
      "light",
      "--accent",
      "#123456"
    );
    const tokens = resolveThemeTokens(preference);

    expect(tokens["--accent"]).toBe("#123456");
    expect(tokens["--foreground"]).toBe(resolveThemeTokens({ themeId: "github", mode: "light" })["--foreground"]);
  });

  test("keeps semantic label colors fixed across themes and custom overrides", () => {
    for (const theme of BUILT_IN_THEMES) {
      for (const mode of ["light", "dark"] as const) {
        for (const [variable, value] of Object.entries(SEMANTIC_LABEL_TOKENS)) {
          expect(theme[mode][variable as keyof typeof SEMANTIC_LABEL_TOKENS]).toBe(value);
        }
      }
    }

    const tokens = resolveThemeTokens({
      themeId: "custom",
      mode: "light",
      custom: {
        baseThemeId: "github",
        light: {
          "--danger": "#000000"
        }
      }
    });
    expect(tokens["--danger"]).toBe(SEMANTIC_LABEL_TOKENS["--danger"]);
  });

  test("repairs custom font tokens to selectable dropdown values", () => {
    const uiOption = getCustomThemeFontOptions("--font-ui")[2];
    expect(normalizeThemeFontInput("--font-ui", "missing font", uiOption.value)).toBe(uiOption.value);

    const tokens = resolveThemeTokens({
      themeId: "custom",
      mode: "light",
      custom: {
        baseThemeId: "graphite",
        light: {
          "--font-ui": uiOption.value
        }
      }
    });
    expect(tokens["--font-ui"]).toBe(uiOption.value);
  });

  test("normalizes color input and measures WCAG contrast", () => {
    expect(normalizeThemeColorInput("abc", "#000000")).toBe("#aabbcc");
    expect(normalizeThemeColorInput("not-a-color", "#123456")).toBe("#123456");
    expect(getContrastRatio("#000000", "#ffffff")).toBeGreaterThan(20);
  });
});
