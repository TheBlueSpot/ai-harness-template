export type TerminalKeyboardAction =
  | "copy"
  | "paste"
  | "select-all"
  | "send-interrupt"
  | "toggle-search"
  | "browser-default";

export function resolveTerminalKeyboardAction(
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey">,
  platform = globalThis.navigator?.platform ?? ""
): TerminalKeyboardAction {
  const key = event.key.toLowerCase();
  const primary = isPrimaryModifier(event, platform);

  if (!primary) {
    return "browser-default";
  }

  if (event.shiftKey && key === "c") {
    return "send-interrupt";
  }

  if (key === "f") {
    return "toggle-search";
  }

  if (key === "c") {
    return "copy";
  }

  if (key === "a") {
    return "select-all";
  }

  if (key === "v") {
    return "paste";
  }

  return "browser-default";
}

function isPrimaryModifier(event: Pick<KeyboardEvent, "ctrlKey" | "metaKey">, platform: string) {
  return /mac|iphone|ipad|ipod/i.test(platform) ? event.metaKey : event.ctrlKey || event.metaKey;
}
