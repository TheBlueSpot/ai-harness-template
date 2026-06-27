import type { ITheme } from "@xterm/xterm";

export function readTerminalTheme(root: HTMLElement = document.documentElement): ITheme {
  const styles = getComputedStyle(root);
  const read = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  const foreground = read("--terminal-foreground", read("--foreground", "#e5e7eb"));
  const background = read("--terminal-shell", read("--panel", "#121316"));
  const accent = read("--accent", "#38bdf8");
  const muted = read("--terminal-muted", read("--muted", "#94a3b8"));
  const selection = read("--terminal-xterm-selection", "rgba(56, 189, 248, 0.28)");

  return {
    foreground,
    background,
    cursor: accent,
    cursorAccent: background,
    selectionBackground: selection,
    black: "#111827",
    red: "#ef4444",
    green: "#22c55e",
    yellow: "#eab308",
    blue: "#3b82f6",
    magenta: "#d946ef",
    cyan: "#06b6d4",
    white: foreground,
    brightBlack: muted,
    brightRed: "#f87171",
    brightGreen: "#4ade80",
    brightYellow: "#facc15",
    brightBlue: "#60a5fa",
    brightMagenta: "#e879f9",
    brightCyan: "#22d3ee",
    brightWhite: "#ffffff"
  };
}
