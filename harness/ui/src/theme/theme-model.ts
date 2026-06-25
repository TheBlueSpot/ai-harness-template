export type ThemeModePreference = "system" | "light" | "dark";
export type ResolvedThemeMode = "light" | "dark";
export type BuiltInThemeId =
  | "harness"
  | "graphite"
  | "github"
  | "darcula"
  | "nord"
  | "solarized"
  | "dracula";
export type ThemeId = BuiltInThemeId | "custom";

export const THEME_CSS_VARIABLES = [
  "--bg",
  "--foreground",
  "--surface-foreground",
  "--muted",
  "--panel",
  "--panel-strong",
  "--row",
  "--border",
  "--accent",
  "--accent-strong",
  "--accent-foreground",
  "--info",
  "--info-strong",
  "--warning",
  "--warning-strong",
  "--danger",
  "--danger-strong",
  "--success",
  "--success-strong",
  "--ring",
  "--font-ui",
  "--font-display",
  "--font-mono",
  "--body-background",
  "--app-background-grid"
] as const;

export type ThemeCssVariable = (typeof THEME_CSS_VARIABLES)[number];
export type ThemeTokens = Record<ThemeCssVariable, string>;

export type ThemeFonts = {
  ui: string;
  display: string;
  mono: string;
};

export type ThemeDefinition = {
  id: BuiltInThemeId;
  label: string;
  description: string;
  fonts: ThemeFonts;
  light: ThemeTokens;
  dark: ThemeTokens;
};

export type CustomThemeDefinition = {
  baseThemeId?: BuiltInThemeId;
  light?: Partial<ThemeTokens>;
  dark?: Partial<ThemeTokens>;
};

export type ThemePreference = {
  themeId: ThemeId;
  mode: ThemeModePreference;
  custom?: CustomThemeDefinition;
};

export const CUSTOM_THEME_COLOR_VARIABLES = [
  { variable: "--accent", label: "Accent" },
  { variable: "--bg", label: "Background" },
  { variable: "--panel", label: "Panel" },
  { variable: "--foreground", label: "Text" },
  { variable: "--muted", label: "Muted" },
  { variable: "--border", label: "Border" }
] as const;

export const CUSTOM_THEME_FONT_VARIABLES = [
  { variable: "--font-ui", label: "UI font" },
  { variable: "--font-display", label: "Display font" },
  { variable: "--font-mono", label: "Mono font" }
] as const;

type CustomThemeColorVariable = (typeof CUSTOM_THEME_COLOR_VARIABLES)[number]["variable"];
export type CustomThemeFontVariable = (typeof CUSTOM_THEME_FONT_VARIABLES)[number]["variable"];

export const DEFAULT_THEME_PREFERENCE: ThemePreference = {
  themeId: "harness",
  mode: "system"
};

export const DEFAULT_CUSTOM_BASE_THEME_ID: BuiltInThemeId = "graphite";

const systemUiFont = `"IBM Plex Sans", "Trebuchet MS", "Segoe UI", sans-serif`;
const systemDisplayFont = `"Aptos Display", "Segoe UI", sans-serif`;
const systemMonoFont = `"Cascadia Code", "SFMono-Regular", Consolas, "Liberation Mono", monospace`;
const githubUiFont = `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
const jetbrainsUiFont = `"Inter", "Segoe UI", sans-serif`;
const jetbrainsMonoFont = `"JetBrains Mono", "Cascadia Code", Consolas, monospace`;

export const SEMANTIC_LABEL_TOKENS = {
  "--info": "#2563eb",
  "--info-strong": "#1d4ed8",
  "--warning": "#a16207",
  "--warning-strong": "#92400e",
  "--danger": "#dc2626",
  "--danger-strong": "#b91c1c",
  "--success": "#047857",
  "--success-strong": "#166534"
} satisfies Pick<
  ThemeTokens,
  | "--info"
  | "--info-strong"
  | "--warning"
  | "--warning-strong"
  | "--danger"
  | "--danger-strong"
  | "--success"
  | "--success-strong"
>;

type CustomThemeFontOption = {
  value: string;
  label: string;
  description: string;
};

export const CUSTOM_THEME_FONT_OPTIONS = {
  "--font-ui": [
    {
      value: `"Inter", "IBM Plex Sans", "Segoe UI", sans-serif`,
      label: "Inter",
      description: "Modern neutral UI stack."
    },
    {
      value: systemUiFont,
      label: "IBM Plex Sans",
      description: "Humanist UI stack with strong readability."
    },
    {
      value: githubUiFont,
      label: "System UI",
      description: "Native platform UI stack."
    },
    {
      value: jetbrainsUiFont,
      label: "JetBrains UI",
      description: "Compact IDE-style UI stack."
    }
  ],
  "--font-display": [
    {
      value: systemDisplayFont,
      label: "Aptos Display",
      description: "Clean display headings."
    },
    {
      value: `"Inter", "Segoe UI", sans-serif`,
      label: "Inter",
      description: "Dense product headings."
    },
    {
      value: githubUiFont,
      label: "System UI",
      description: "Native platform headings."
    },
    {
      value: `"IBM Plex Sans", "Segoe UI", sans-serif`,
      label: "IBM Plex Sans",
      description: "Readable technical headings."
    }
  ],
  "--font-mono": [
    {
      value: systemMonoFont,
      label: "Cascadia Code",
      description: "Default Windows-friendly monospace stack."
    },
    {
      value: jetbrainsMonoFont,
      label: "JetBrains Mono",
      description: "IDE-oriented monospace stack."
    },
    {
      value: `"SFMono-Regular", "Cascadia Code", Consolas, monospace`,
      label: "SF Mono",
      description: "Native Apple monospace with Windows fallback."
    },
    {
      value: `"IBM Plex Mono", "Cascadia Code", Consolas, monospace`,
      label: "IBM Plex Mono",
      description: "Structured technical monospace stack."
    }
  ]
} satisfies Record<CustomThemeFontVariable, CustomThemeFontOption[]>;

const CUSTOM_THEME_COLOR_VARIABLE_SET = new Set<ThemeCssVariable>(
  CUSTOM_THEME_COLOR_VARIABLES.map((entry) => entry.variable)
);
const CUSTOM_THEME_FONT_VARIABLE_SET = new Set<ThemeCssVariable>(
  CUSTOM_THEME_FONT_VARIABLES.map((entry) => entry.variable)
);

function isCustomThemeColorVariable(variable: ThemeCssVariable): variable is CustomThemeColorVariable {
  return CUSTOM_THEME_COLOR_VARIABLE_SET.has(variable);
}

function isCustomThemeFontVariable(variable: ThemeCssVariable): variable is CustomThemeFontVariable {
  return CUSTOM_THEME_FONT_VARIABLE_SET.has(variable);
}

function withFonts(
  fonts: ThemeFonts,
  tokens: Omit<ThemeTokens, "--font-ui" | "--font-display" | "--font-mono">
): ThemeTokens {
  return {
    ...tokens,
    ...createBlendedSurfaceTokens(tokens),
    ...SEMANTIC_LABEL_TOKENS,
    "--font-ui": fonts.ui,
    "--font-display": fonts.display,
    "--font-mono": fonts.mono
  };
}

function enforceFixedThemeTokens(tokens: ThemeTokens): ThemeTokens {
  return {
    ...tokens,
    ...SEMANTIC_LABEL_TOKENS
  };
}

function createBlendedSurfaceTokens(
  tokens: Pick<ThemeTokens, "--bg" | "--foreground" | "--accent">
): Pick<
  ThemeTokens,
  | "--surface-foreground"
  | "--muted"
  | "--panel"
  | "--panel-strong"
  | "--row"
  | "--border"
  | "--ring"
  | "--body-background"
  | "--app-background-grid"
> {
  const bg = normalizeHexColor(tokens["--bg"]) ?? "#ffffff";
  const foreground = normalizeHexColor(tokens["--foreground"]) ?? "#000000";
  const accent = normalizeHexColor(tokens["--accent"]) ?? "#2563eb";
  const dark = getRelativeLuminance(parseHexColor(bg) ?? { r: 255, g: 255, b: 255 }) < 0.38;
  const basePanel = dark ? blendHexColors(bg, "#ffffff", 0.08) : blendHexColors(bg, "#ffffff", 0.82);
  const borderBase = dark ? blendHexColors(bg, "#ffffff", 0.22) : blendHexColors(bg, "#000000", 0.15);

  return {
    "--surface-foreground": getReadableTextColor(foreground),
    "--muted": dark ? blendHexColors(foreground, bg, 0.34) : blendHexColors(foreground, bg, 0.42),
    "--panel": basePanel,
    "--panel-strong": dark ? blendHexColors(basePanel, "#ffffff", 0.07) : blendHexColors(basePanel, "#ffffff", 0.7),
    "--row": dark ? blendHexColors(bg, "#ffffff", 0.14) : blendHexColors(bg, "#ffffff", 0.54),
    "--border": blendHexColors(borderBase, accent, 0.12),
    "--ring": dark ? blendHexColors(accent, "#ffffff", 0.26) : blendHexColors(accent, "#ffffff", 0.36),
    "--body-background": dark ? blendHexColors(bg, "#000000", 0.08) : blendHexColors(bg, "#ffffff", 0.42),
    "--app-background-grid": "none"
  };
}

const harnessFonts: ThemeFonts = {
  ui: systemUiFont,
  display: systemDisplayFont,
  mono: systemMonoFont
};
const graphiteFonts: ThemeFonts = {
  ui: `"Inter", "IBM Plex Sans", "Segoe UI", sans-serif`,
  display: `"Aptos Display", "Inter", "Segoe UI", sans-serif`,
  mono: systemMonoFont
};
const githubFonts: ThemeFonts = {
  ui: githubUiFont,
  display: githubUiFont,
  mono: `"SFMono-Regular", "Cascadia Code", Consolas, monospace`
};
const darculaFonts: ThemeFonts = {
  ui: jetbrainsUiFont,
  display: jetbrainsUiFont,
  mono: jetbrainsMonoFont
};
const nordFonts: ThemeFonts = {
  ui: `"Inter", "Segoe UI", sans-serif`,
  display: `"Inter", "Segoe UI", sans-serif`,
  mono: systemMonoFont
};
const solarizedFonts: ThemeFonts = {
  ui: `"IBM Plex Sans", "Segoe UI", sans-serif`,
  display: `"IBM Plex Sans", "Segoe UI", sans-serif`,
  mono: systemMonoFont
};
const draculaFonts: ThemeFonts = {
  ui: `"Inter", "Segoe UI", sans-serif`,
  display: `"Inter", "Segoe UI", sans-serif`,
  mono: jetbrainsMonoFont
};

export const BUILT_IN_THEMES: ThemeDefinition[] = [
  {
    id: "harness",
    label: "Harness",
    description: "Current compact teal workspace palette.",
    fonts: harnessFonts,
    light: withFonts(harnessFonts, {
      "--bg": "#eef2f4",
      "--foreground": "#17202a",
      "--surface-foreground": "#f8fafc",
      "--muted": "#63717e",
      "--panel": "#f8fafc",
      "--panel-strong": "#ffffff",
      "--row": "#ffffff",
      "--border": "#cdd5dd",
      "--accent": "#0f766e",
      "--accent-strong": "#0b5f59",
      "--accent-foreground": "#f8fafc",
      "--info": "#2563eb",
      "--info-strong": "#1d4ed8",
      "--warning": "#d97706",
      "--warning-strong": "#b45309",
      "--danger": "#dc2626",
      "--danger-strong": "#b91c1c",
      "--success": "#059669",
      "--success-strong": "#047857",
      "--ring": "rgba(37, 99, 235, 0.28)",
      "--body-background": "linear-gradient(180deg, #f4f7f9 0%, #e8edf1 48%, #dfe6eb 100%)",
      "--app-background-grid": "none"
    }),
    dark: withFonts(harnessFonts, {
      "--bg": "#111827",
      "--foreground": "#e5edf5",
      "--surface-foreground": "#f8fafc",
      "--muted": "#9aa8b7",
      "--panel": "#1b2430",
      "--panel-strong": "#243041",
      "--row": "#273447",
      "--border": "#3b4858",
      "--accent": "#2dd4bf",
      "--accent-strong": "#5eead4",
      "--accent-foreground": "#082f2c",
      "--info": "#60a5fa",
      "--info-strong": "#93c5fd",
      "--warning": "#f59e0b",
      "--warning-strong": "#fbbf24",
      "--danger": "#f87171",
      "--danger-strong": "#fca5a5",
      "--success": "#34d399",
      "--success-strong": "#6ee7b7",
      "--ring": "rgba(45, 212, 191, 0.35)",
      "--body-background": "linear-gradient(180deg, #141c29 0%, #111827 52%, #0b1220 100%)",
      "--app-background-grid": "none"
    })
  },
  {
    id: "graphite",
    label: "Graphite",
    description: "Neutral low-chroma default for long sessions.",
    fonts: graphiteFonts,
    light: withFonts(graphiteFonts, {
      "--bg": "#f4f5f5",
      "--foreground": "#181a1f",
      "--surface-foreground": "#f9fafb",
      "--muted": "#626a73",
      "--panel": "#ffffff",
      "--panel-strong": "#ffffff",
      "--row": "#f7f8f8",
      "--border": "#d8dcdf",
      "--accent": "#286f6b",
      "--accent-strong": "#1f5956",
      "--accent-foreground": "#ffffff",
      "--info": "#2f6fd0",
      "--info-strong": "#245bb1",
      "--warning": "#a15c00",
      "--warning-strong": "#824a00",
      "--danger": "#c73843",
      "--danger-strong": "#a62d36",
      "--success": "#217a4f",
      "--success-strong": "#19623f",
      "--ring": "rgba(47, 111, 208, 0.26)",
      "--body-background": "linear-gradient(180deg, #fafafa 0%, #f0f2f2 50%, #e5e8e8 100%)",
      "--app-background-grid": "none"
    }),
    dark: withFonts(graphiteFonts, {
      "--bg": "#101214",
      "--foreground": "#e6e8ea",
      "--surface-foreground": "#f9fafb",
      "--muted": "#9aa1aa",
      "--panel": "#1a1d21",
      "--panel-strong": "#22262b",
      "--row": "#252a30",
      "--border": "#383f47",
      "--accent": "#4fb0a8",
      "--accent-strong": "#79cbc4",
      "--accent-foreground": "#071917",
      "--info": "#75a7ff",
      "--info-strong": "#9fc2ff",
      "--warning": "#e0a044",
      "--warning-strong": "#f1b968",
      "--danger": "#ff7a86",
      "--danger-strong": "#ff9da6",
      "--success": "#74c69d",
      "--success-strong": "#95dab7",
      "--ring": "rgba(79, 176, 168, 0.34)",
      "--body-background": "linear-gradient(180deg, #15181b 0%, #101214 56%, #0b0d0f 100%)",
      "--app-background-grid": "none"
    })
  },
  {
    id: "github",
    label: "GitHub",
    description: "Familiar neutral blue with strong semantic roles.",
    fonts: githubFonts,
    light: withFonts(githubFonts, {
      "--bg": "#f6f8fa",
      "--foreground": "#1f2328",
      "--surface-foreground": "#ffffff",
      "--muted": "#59636e",
      "--panel": "#ffffff",
      "--panel-strong": "#ffffff",
      "--row": "#f6f8fa",
      "--border": "#d0d7de",
      "--accent": "#0969da",
      "--accent-strong": "#0757b8",
      "--accent-foreground": "#ffffff",
      "--info": "#0969da",
      "--info-strong": "#0757b8",
      "--warning": "#9a6700",
      "--warning-strong": "#7d4e00",
      "--danger": "#cf222e",
      "--danger-strong": "#a40e26",
      "--success": "#1a7f37",
      "--success-strong": "#116329",
      "--ring": "rgba(9, 105, 218, 0.28)",
      "--body-background": "linear-gradient(180deg, #ffffff 0%, #f6f8fa 48%, #eef2f6 100%)",
      "--app-background-grid": "none"
    }),
    dark: withFonts(githubFonts, {
      "--bg": "#0d1117",
      "--foreground": "#e6edf3",
      "--surface-foreground": "#ffffff",
      "--muted": "#8b949e",
      "--panel": "#161b22",
      "--panel-strong": "#21262d",
      "--row": "#1f242d",
      "--border": "#30363d",
      "--accent": "#2f81f7",
      "--accent-strong": "#58a6ff",
      "--accent-foreground": "#ffffff",
      "--info": "#58a6ff",
      "--info-strong": "#79c0ff",
      "--warning": "#d29922",
      "--warning-strong": "#e3b341",
      "--danger": "#ff7b72",
      "--danger-strong": "#ffa198",
      "--success": "#3fb950",
      "--success-strong": "#56d364",
      "--ring": "rgba(88, 166, 255, 0.34)",
      "--body-background": "linear-gradient(180deg, #0f141c 0%, #0d1117 55%, #080b10 100%)",
      "--app-background-grid": "none"
    })
  },
  {
    id: "darcula",
    label: "Darcula",
    description: "Muted JetBrains-style low-glare contrast.",
    fonts: darculaFonts,
    light: withFonts(darculaFonts, {
      "--bg": "#f4f2ee",
      "--foreground": "#1f2326",
      "--surface-foreground": "#ffffff",
      "--muted": "#616b73",
      "--panel": "#fffdf8",
      "--panel-strong": "#ffffff",
      "--row": "#f5f1e8",
      "--border": "#d9d3c8",
      "--accent": "#8a5a00",
      "--accent-strong": "#6f4800",
      "--accent-foreground": "#ffffff",
      "--info": "#2c6fb7",
      "--info-strong": "#245a95",
      "--warning": "#a36200",
      "--warning-strong": "#824e00",
      "--danger": "#b8323f",
      "--danger-strong": "#952932",
      "--success": "#2f7d4e",
      "--success-strong": "#25643f",
      "--ring": "rgba(44, 111, 183, 0.25)",
      "--body-background": "linear-gradient(180deg, #fbfaf7 0%, #f1eee8 50%, #e5dfd5 100%)",
      "--app-background-grid": "none"
    }),
    dark: withFonts(darculaFonts, {
      "--bg": "#1f2227",
      "--foreground": "#f0f1f2",
      "--surface-foreground": "#ffffff",
      "--muted": "#a9b0b8",
      "--panel": "#2b2f36",
      "--panel-strong": "#343941",
      "--row": "#383e47",
      "--border": "#4b525c",
      "--accent": "#c792ea",
      "--accent-strong": "#d6a8f5",
      "--accent-foreground": "#171a20",
      "--info": "#82aaff",
      "--info-strong": "#a6c4ff",
      "--warning": "#ffcb6b",
      "--warning-strong": "#ffdd91",
      "--danger": "#f07178",
      "--danger-strong": "#ff9298",
      "--success": "#c3e88d",
      "--success-strong": "#d4f5a8",
      "--ring": "rgba(199, 146, 234, 0.34)",
      "--body-background": "linear-gradient(180deg, #262a31 0%, #1f2227 54%, #171a1f 100%)",
      "--app-background-grid": "none"
    })
  },
  {
    id: "nord",
    label: "Nord",
    description: "Cool gray-blue workspace with restrained contrast.",
    fonts: nordFonts,
    light: withFonts(nordFonts, {
      "--bg": "#eceff4",
      "--foreground": "#2e3440",
      "--surface-foreground": "#ffffff",
      "--muted": "#5e6878",
      "--panel": "#f8fafc",
      "--panel-strong": "#ffffff",
      "--row": "#eef2f7",
      "--border": "#c8d1dc",
      "--accent": "#5e81ac",
      "--accent-strong": "#4c6f99",
      "--accent-foreground": "#ffffff",
      "--info": "#5e81ac",
      "--info-strong": "#4c6f99",
      "--warning": "#9a6800",
      "--warning-strong": "#7c5200",
      "--danger": "#bf3a4a",
      "--danger-strong": "#9d2f3d",
      "--success": "#2f7d61",
      "--success-strong": "#24654e",
      "--ring": "rgba(94, 129, 172, 0.28)",
      "--body-background": "linear-gradient(180deg, #f8fafc 0%, #eceff4 52%, #dfe6ef 100%)",
      "--app-background-grid": "none"
    }),
    dark: withFonts(nordFonts, {
      "--bg": "#2e3440",
      "--foreground": "#eceff4",
      "--surface-foreground": "#ffffff",
      "--muted": "#b6bfcc",
      "--panel": "#3b4252",
      "--panel-strong": "#434c5e",
      "--row": "#4c566a",
      "--border": "#596579",
      "--accent": "#88c0d0",
      "--accent-strong": "#9bd4e4",
      "--accent-foreground": "#17232b",
      "--info": "#81a1c1",
      "--info-strong": "#9bb8d5",
      "--warning": "#ebcb8b",
      "--warning-strong": "#f2d9a8",
      "--danger": "#bf616a",
      "--danger-strong": "#d27b84",
      "--success": "#a3be8c",
      "--success-strong": "#b6d19e",
      "--ring": "rgba(136, 192, 208, 0.36)",
      "--body-background": "linear-gradient(180deg, #343b49 0%, #2e3440 55%, #252b35 100%)",
      "--app-background-grid": "none"
    })
  },
  {
    id: "solarized",
    label: "Solarized",
    description: "Low-saturation palette for softer reading.",
    fonts: solarizedFonts,
    light: withFonts(solarizedFonts, {
      "--bg": "#fdf6e3",
      "--foreground": "#073642",
      "--surface-foreground": "#ffffff",
      "--muted": "#586e75",
      "--panel": "#fffaf0",
      "--panel-strong": "#fffff7",
      "--row": "#f8efd6",
      "--border": "#ddd1a8",
      "--accent": "#268bd2",
      "--accent-strong": "#1f73ad",
      "--accent-foreground": "#ffffff",
      "--info": "#268bd2",
      "--info-strong": "#1f73ad",
      "--warning": "#9a6b00",
      "--warning-strong": "#7b5600",
      "--danger": "#dc322f",
      "--danger-strong": "#b52a27",
      "--success": "#2f7d32",
      "--success-strong": "#246326",
      "--ring": "rgba(38, 139, 210, 0.28)",
      "--body-background": "linear-gradient(180deg, #fffaf0 0%, #fdf6e3 52%, #eee4c9 100%)",
      "--app-background-grid": "none"
    }),
    dark: withFonts(solarizedFonts, {
      "--bg": "#002b36",
      "--foreground": "#eee8d5",
      "--surface-foreground": "#ffffff",
      "--muted": "#93a1a1",
      "--panel": "#073642",
      "--panel-strong": "#0d4654",
      "--row": "#0f4f5e",
      "--border": "#225968",
      "--accent": "#2aa198",
      "--accent-strong": "#45b8ae",
      "--accent-foreground": "#002b36",
      "--info": "#268bd2",
      "--info-strong": "#55a6df",
      "--warning": "#b58900",
      "--warning-strong": "#d3a521",
      "--danger": "#dc322f",
      "--danger-strong": "#f05a57",
      "--success": "#859900",
      "--success-strong": "#a3b51d",
      "--ring": "rgba(42, 161, 152, 0.36)",
      "--body-background": "linear-gradient(180deg, #063642 0%, #002b36 55%, #001f27 100%)",
      "--app-background-grid": "none"
    })
  },
  {
    id: "dracula",
    label: "Dracula",
    description: "Higher-energy dark theme with restrained accents.",
    fonts: draculaFonts,
    light: withFonts(draculaFonts, {
      "--bg": "#f7f4fb",
      "--foreground": "#241b2f",
      "--surface-foreground": "#ffffff",
      "--muted": "#685d75",
      "--panel": "#ffffff",
      "--panel-strong": "#ffffff",
      "--row": "#f3edf9",
      "--border": "#d8cce5",
      "--accent": "#7c3aed",
      "--accent-strong": "#6d28d9",
      "--accent-foreground": "#ffffff",
      "--info": "#2563eb",
      "--info-strong": "#1d4ed8",
      "--warning": "#9a6700",
      "--warning-strong": "#7d4e00",
      "--danger": "#c0264d",
      "--danger-strong": "#9f1239",
      "--success": "#16784f",
      "--success-strong": "#11623f",
      "--ring": "rgba(124, 58, 237, 0.28)",
      "--body-background": "linear-gradient(180deg, #fffaff 0%, #f7f4fb 52%, #ece4f6 100%)",
      "--app-background-grid": "none"
    }),
    dark: withFonts(draculaFonts, {
      "--bg": "#1e1f29",
      "--foreground": "#f8f8f2",
      "--surface-foreground": "#ffffff",
      "--muted": "#b8b9c7",
      "--panel": "#282a36",
      "--panel-strong": "#343746",
      "--row": "#3d4053",
      "--border": "#515568",
      "--accent": "#bd93f9",
      "--accent-strong": "#d0adff",
      "--accent-foreground": "#1f1f29",
      "--info": "#8be9fd",
      "--info-strong": "#a6f0ff",
      "--warning": "#f1fa8c",
      "--warning-strong": "#f6ffab",
      "--danger": "#ff79c6",
      "--danger-strong": "#ff9bd5",
      "--success": "#50fa7b",
      "--success-strong": "#7cff9b",
      "--ring": "rgba(189, 147, 249, 0.36)",
      "--body-background": "linear-gradient(180deg, #252633 0%, #1e1f29 56%, #171820 100%)",
      "--app-background-grid": "none"
    })
  }
];

export const BUILT_IN_THEME_IDS = BUILT_IN_THEMES.map((theme) => theme.id);
export const THEME_OPTIONS: Array<{ value: ThemeId; label: string; description: string }> = [
  ...BUILT_IN_THEMES.map((theme) => ({
    value: theme.id,
    label: theme.label,
    description: theme.description
  })),
  {
    value: "custom",
    label: "Custom",
    description: "Tune colors and fonts from a built-in base."
  }
];

export function isThemeModePreference(value: unknown): value is ThemeModePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function isBuiltInThemeId(value: unknown): value is BuiltInThemeId {
  return typeof value === "string" && BUILT_IN_THEME_IDS.includes(value as BuiltInThemeId);
}

export function isThemeId(value: unknown): value is ThemeId {
  return value === "custom" || isBuiltInThemeId(value);
}

export function getBuiltInTheme(themeId: BuiltInThemeId) {
  return BUILT_IN_THEMES.find((theme) => theme.id === themeId) ?? BUILT_IN_THEMES[0];
}

export function normalizeThemePreference(input: unknown): ThemePreference {
  const parsed = input && typeof input === "object" ? (input as Partial<ThemePreference>) : {};
  const themeId = isThemeId(parsed.themeId) ? parsed.themeId : DEFAULT_THEME_PREFERENCE.themeId;
  const mode = isThemeModePreference(parsed.mode) ? parsed.mode : DEFAULT_THEME_PREFERENCE.mode;
  const custom = normalizeCustomThemeDefinition(parsed.custom);

  return {
    themeId,
    mode,
    ...(custom ? { custom } : themeId === "custom" ? { custom: createDefaultCustomTheme() } : {})
  };
}

export function createDefaultCustomTheme(baseThemeId: BuiltInThemeId = DEFAULT_CUSTOM_BASE_THEME_ID): CustomThemeDefinition {
  return {
    baseThemeId
  };
}

export function normalizeCustomThemeDefinition(input: unknown): CustomThemeDefinition | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }

  const parsed = input as Partial<CustomThemeDefinition>;
  const baseThemeId = isBuiltInThemeId(parsed.baseThemeId) ? parsed.baseThemeId : DEFAULT_CUSTOM_BASE_THEME_ID;
  const baseTheme = getBuiltInTheme(baseThemeId);
  return {
    baseThemeId,
    light: normalizePartialTokens(parsed.light, baseTheme.light),
    dark: normalizePartialTokens(parsed.dark, baseTheme.dark)
  };
}

export function resolveThemeMode(preference: ThemePreference, systemPrefersDark = false): ResolvedThemeMode {
  const normalized = normalizeThemePreference(preference);
  if (normalized.mode === "system") {
    return systemPrefersDark ? "dark" : "light";
  }
  return normalized.mode;
}

export function resolveThemeTokens(preference: ThemePreference, systemPrefersDark = false): ThemeTokens {
  const normalized = normalizeThemePreference(preference);
  const mode = resolveThemeMode(normalized, systemPrefersDark);
  if (normalized.themeId !== "custom") {
    return enforceFixedThemeTokens(getBuiltInTheme(normalized.themeId)[mode]);
  }

  const custom = normalized.custom ?? createDefaultCustomTheme();
  const baseTheme = getBuiltInTheme(custom.baseThemeId ?? DEFAULT_CUSTOM_BASE_THEME_ID);
  const customTokens = custom[mode] ?? {};
  const mergedTokens = {
    ...baseTheme[mode],
    ...customTokens
  };
  const derivedTokens = createBlendedSurfaceTokens(mergedTokens);
  return {
    ...mergedTokens,
    ...derivedTokens,
    ...customTokens,
    ...SEMANTIC_LABEL_TOKENS
  };
}

export function withThemePreference(
  preference: ThemePreference,
  patch: Partial<ThemePreference>
): ThemePreference {
  return normalizeThemePreference({
    ...preference,
    ...patch
  });
}

export function withCustomThemeToken(
  preference: ThemePreference,
  mode: ResolvedThemeMode,
  variable: ThemeCssVariable,
  value: string
): ThemePreference {
  const normalized = normalizeThemePreference({
    ...preference,
    themeId: "custom",
    custom: preference.custom ?? createDefaultCustomTheme()
  });
  const custom = normalized.custom ?? createDefaultCustomTheme();
  return normalizeThemePreference({
    ...normalized,
    custom: {
      ...custom,
      [mode]: {
        ...(custom[mode] ?? {}),
        [variable]: value
      }
    }
  });
}

export function normalizeThemeColorInput(value: string, fallback: string) {
  return normalizeHexColor(value) ?? normalizeHexColor(fallback) ?? "#000000";
}

export function normalizeFontStack(value: string, fallback: string) {
  const normalized = value.trim().replace(/\s+/g, " ").slice(0, 180);
  return normalized || fallback;
}

export function getCustomThemeFontOptions(variable: ThemeCssVariable) {
  return isCustomThemeFontVariable(variable) ? CUSTOM_THEME_FONT_OPTIONS[variable] : [];
}

export function normalizeThemeFontInput(variable: ThemeCssVariable, value: string, fallback: string) {
  if (!isCustomThemeFontVariable(variable)) {
    return normalizeFontStack(value, fallback);
  }

  const options = CUSTOM_THEME_FONT_OPTIONS[variable];
  const normalized = normalizeFontStack(value, fallback);
  const matched = options.find((option) => option.value === normalized);
  if (matched) {
    return matched.value;
  }

  const fallbackMatch = options.find((option) => option.value === fallback);
  return fallbackMatch?.value ?? options[0]?.value ?? fallback;
}

export function validateThemeContrast(tokens: ThemeTokens) {
  const pairs = [
    { foreground: "--foreground", background: "--bg", minimum: 4.5, label: "Text on background" },
    { foreground: "--foreground", background: "--panel", minimum: 4.5, label: "Text on panel" },
    { foreground: "--foreground", background: "--panel-strong", minimum: 4.5, label: "Text on strong panel" },
    { foreground: "--accent-foreground", background: "--accent", minimum: 3, label: "Accent controls" }
  ] as const;

  return pairs
    .map((pair) => ({
      ...pair,
      ratio: getContrastRatio(tokens[pair.foreground], tokens[pair.background])
    }))
    .filter((result) => result.ratio < result.minimum);
}

export function getContrastRatio(foreground: string, background: string) {
  const foregroundRgb = parseHexColor(foreground);
  const backgroundRgb = parseHexColor(background);
  if (!foregroundRgb || !backgroundRgb) {
    return 1;
  }

  const foregroundLuminance = getRelativeLuminance(foregroundRgb);
  const backgroundLuminance = getRelativeLuminance(backgroundRgb);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

export function normalizeHexColor(value: string) {
  const trimmed = value.trim();
  const short = /^#?([0-9a-fA-F]{3})$/.exec(trimmed);
  if (short) {
    return `#${short[1].split("").map((digit) => `${digit}${digit}`).join("")}`.toLowerCase();
  }
  const long = /^#?([0-9a-fA-F]{6})$/.exec(trimmed);
  return long ? `#${long[1].toLowerCase()}` : undefined;
}

function normalizePartialTokens(input: unknown, fallbackTokens: ThemeTokens): Partial<ThemeTokens> | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }

  const parsed = input as Partial<Record<ThemeCssVariable, unknown>>;
  const tokens: Partial<ThemeTokens> = {};
  for (const variable of THEME_CSS_VARIABLES) {
    const value = parsed[variable];
    if (typeof value === "string" && value.trim()) {
      if (isCustomThemeFontVariable(variable)) {
        tokens[variable] = normalizeThemeFontInput(variable, value, fallbackTokens[variable]);
        continue;
      }
      if (isCustomThemeColorVariable(variable)) {
        const normalizedColor = normalizeHexColor(value);
        if (normalizedColor) {
          tokens[variable] = normalizedColor;
        }
      }
    }
  }
  return Object.keys(tokens).length > 0 ? tokens : undefined;
}

function parseHexColor(value: string) {
  const normalized = normalizeHexColor(value);
  if (!normalized) {
    return undefined;
  }
  const numeric = Number.parseInt(normalized.slice(1), 16);
  return {
    r: (numeric >> 16) & 255,
    g: (numeric >> 8) & 255,
    b: numeric & 255
  };
}

function getRelativeLuminance(color: { r: number; g: number; b: number }) {
  const channels = [color.r, color.g, color.b].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function blendHexColors(from: string, to: string, amountTo: number) {
  const fromRgb = parseHexColor(from);
  const toRgb = parseHexColor(to);
  if (!fromRgb || !toRgb) {
    return normalizeHexColor(from) ?? normalizeHexColor(to) ?? "#000000";
  }
  const amount = Math.max(0, Math.min(1, amountTo));
  return rgbToHex({
    r: Math.round(fromRgb.r * (1 - amount) + toRgb.r * amount),
    g: Math.round(fromRgb.g * (1 - amount) + toRgb.g * amount),
    b: Math.round(fromRgb.b * (1 - amount) + toRgb.b * amount)
  });
}

function rgbToHex(color: { r: number; g: number; b: number }) {
  return `#${[color.r, color.g, color.b]
    .map((channel) => Math.max(0, Math.min(255, channel)).toString(16).padStart(2, "0"))
    .join("")}`;
}

function getReadableTextColor(background: string) {
  return getContrastRatio("#ffffff", background) >= getContrastRatio("#0b0d12", background)
    ? "#ffffff"
    : "#0b0d12";
}
