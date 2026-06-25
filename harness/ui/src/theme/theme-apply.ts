import {
  normalizeThemePreference,
  resolveThemeMode,
  resolveThemeTokens,
  THEME_CSS_VARIABLES,
  type ThemePreference
} from "./theme-model";

let disposeSystemThemeListener: (() => void) | undefined;
let themeTransitionRoot: HTMLElement | undefined;
let themeTransitionTimeout: number | undefined;

const THEME_TRANSITION_DURATION_MS = 700;

type LegacyMediaQueryList = MediaQueryList & {
  addListener?: (listener: () => void) => void;
  removeListener?: (listener: () => void) => void;
};

export function applyThemePreference(preference: ThemePreference, root: HTMLElement | undefined = getDocumentRoot()) {
  if (!root) {
    return;
  }

  disposeSystemThemeListener?.();
  disposeSystemThemeListener = undefined;

  const normalized = normalizeThemePreference(preference);
  const applyResolvedTokens = () => {
    const shouldTransition = root.dataset.themeId !== undefined || root.dataset.themeMode !== undefined;
    if (shouldTransition) {
      startThemeTransition(root);
    }

    const systemPrefersDark = getSystemPrefersDark();
    const resolvedMode = resolveThemeMode(normalized, systemPrefersDark);
    const tokens = resolveThemeTokens(normalized, systemPrefersDark);
    for (const variable of THEME_CSS_VARIABLES) {
      root.style.setProperty(variable, tokens[variable]);
    }
    root.style.setProperty("color-scheme", resolvedMode);
    root.dataset.themeId = normalized.themeId;
    root.dataset.themeMode = resolvedMode;
  };

  applyResolvedTokens();

  if (normalized.mode === "system" && typeof window !== "undefined" && "matchMedia" in window) {
    const media = window.matchMedia("(prefers-color-scheme: dark)") as LegacyMediaQueryList;
    const listener = () => applyResolvedTokens();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", listener);
      disposeSystemThemeListener = () => media.removeEventListener("change", listener);
    } else if (typeof media.addListener === "function" && typeof media.removeListener === "function") {
      media.addListener(listener);
      disposeSystemThemeListener = () => media.removeListener(listener);
    }
  }
}

export function disposeThemePreferenceSync() {
  disposeSystemThemeListener?.();
  disposeSystemThemeListener = undefined;
  clearThemeTransition();
}

function getDocumentRoot() {
  if (typeof document === "undefined") {
    return undefined;
  }
  return document.documentElement;
}

function getSystemPrefersDark() {
  return typeof window !== "undefined" &&
    "matchMedia" in window &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function startThemeTransition(root: HTMLElement) {
  if (typeof window === "undefined" || prefersReducedThemeMotion()) {
    return;
  }

  if (themeTransitionRoot && themeTransitionRoot !== root) {
    themeTransitionRoot.removeAttribute("data-theme-transition");
  }

  if (themeTransitionTimeout !== undefined) {
    window.clearTimeout(themeTransitionTimeout);
  }

  themeTransitionRoot = root;
  root.dataset.themeTransition = "active";
  root.getBoundingClientRect();
  themeTransitionTimeout = window.setTimeout(() => {
    root.removeAttribute("data-theme-transition");
    if (themeTransitionRoot === root) {
      themeTransitionRoot = undefined;
    }
    themeTransitionTimeout = undefined;
  }, THEME_TRANSITION_DURATION_MS);
}

function clearThemeTransition() {
  if (typeof window !== "undefined" && themeTransitionTimeout !== undefined) {
    window.clearTimeout(themeTransitionTimeout);
  }
  themeTransitionRoot?.removeAttribute("data-theme-transition");
  themeTransitionRoot = undefined;
  themeTransitionTimeout = undefined;
}

function prefersReducedThemeMotion() {
  return typeof window !== "undefined" &&
    "matchMedia" in window &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
