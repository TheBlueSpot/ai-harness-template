import { formatForDisplay } from "@tanstack/solid-hotkeys";

export function formatHotkeyHint(hotkey: string) {
  return formatForDisplay(hotkey)
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" + ");
}

export function tooltipWithPrimaryHotkey(label: string, hotkey: string | undefined) {
  return hotkey ? `${label} (${formatHotkeyHint(hotkey)})` : label;
}
