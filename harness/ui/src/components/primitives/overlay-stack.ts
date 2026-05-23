type OverlayEntry = {
  id: string;
  onEscape?: () => void;
};

const overlayStack: OverlayEntry[] = [];
const focusReturnStack: Array<{ id: string; element: HTMLElement | null }> = [];
let globalKeydownRegistered = false;

export function registerOverlay(id: string, options: { onEscape?: () => void } = {}) {
  overlayStack.push({ id, onEscape: options.onEscape });
  ensureGlobalKeydown();
  return () => {
    const index = findLastOverlayIndex(id);
    if (index >= 0) {
      overlayStack.splice(index, 1);
    }
    if (overlayStack.length === 0) {
      removeGlobalKeydown();
      globalKeydownRegistered = false;
    }
  };
}

export function isTopOverlay(id: string) {
  if (overlayStack.length === 0) {
    return true;
  }
  return getTopOverlay()?.id === id;
}

export function registerFocusReturn(id: string, element: HTMLElement | null) {
  focusReturnStack.push({ id, element });
  return () => {
    const index = findLastFocusReturnIndex(id);
    if (index >= 0) {
      focusReturnStack.splice(index, 1);
    }
  };
}

export function restoreOverlayFocus(id: string) {
  const index = findLastFocusReturnIndex(id);
  const entry = index >= 0 ? focusReturnStack.splice(index, 1)[0] : undefined;
  entry?.element?.focus?.();
}

function findLastFocusReturnIndex(id: string) {
  for (let index = focusReturnStack.length - 1; index >= 0; index -= 1) {
    if (focusReturnStack[index]?.id === id) {
      return index;
    }
  }
  return -1;
}

function findLastOverlayIndex(id: string) {
  for (let index = overlayStack.length - 1; index >= 0; index -= 1) {
    if (overlayStack[index]?.id === id) {
      return index;
    }
  }
  return -1;
}

function ensureGlobalKeydown() {
  if (globalKeydownRegistered || typeof window === "undefined") {
    return;
  }
  window.addEventListener("keydown", handleOverlayKeyDown, true);
  window.addEventListener("keydown", handleOverlayKeyDown);
  globalKeydownRegistered = true;
}

function removeGlobalKeydown() {
  if (typeof window === "undefined") {
    return;
  }
  window.removeEventListener("keydown", handleOverlayKeyDown, true);
  window.removeEventListener("keydown", handleOverlayKeyDown);
}

function handleOverlayKeyDown(event: KeyboardEvent) {
  if (event.key !== "Escape") {
    return;
  }
  const top = getTopOverlay();
  if (!top?.onEscape) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  top.onEscape();
}

export function trapFocusInOverlay(event: KeyboardEvent, root: HTMLElement | undefined) {
  if (event.key !== "Tab" || !root) {
    return;
  }
  const focusable = getFocusableElements(root);
  if (focusable.length === 0) {
    event.preventDefault();
    root.focus();
    return;
  }
  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;
  const active = document.activeElement;
  if (event.shiftKey && (active === first || active === root)) {
    event.preventDefault();
    last.focus();
    return;
  }
  if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

function getFocusableElements(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLElement>(
    [
      "a[href]",
      "button:not([disabled])",
      "textarea:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "[tabindex]:not([tabindex='-1'])"
    ].join(",")
  )].filter((element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true");
}

function getOverlayPriority(id: string) {
  if (id.startsWith("popover-")) {
    return 3;
  }
  if (id.startsWith("dialog-") || id.startsWith("sheet-")) {
    return 2;
  }
  return 1;
}

function getTopOverlay() {
  if (overlayStack.length === 0) {
    return undefined;
  }
  const maxPriority = Math.max(...overlayStack.map((entry) => getOverlayPriority(entry.id)));
  return [...overlayStack].reverse().find((entry) => getOverlayPriority(entry.id) === maxPriority);
}

export function clearOverlayStackForTests() {
  overlayStack.length = 0;
  focusReturnStack.length = 0;
  if (globalKeydownRegistered) {
    removeGlobalKeydown();
    globalKeydownRegistered = false;
  }
}
