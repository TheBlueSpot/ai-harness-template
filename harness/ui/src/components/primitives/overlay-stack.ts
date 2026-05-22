const overlayStack: string[] = [];

export function registerOverlay(id: string) {
  overlayStack.push(id);
  return () => {
    const index = overlayStack.lastIndexOf(id);
    if (index >= 0) {
      overlayStack.splice(index, 1);
    }
  };
}

export function isTopOverlay(id: string) {
  if (overlayStack.length === 0) {
    return true;
  }
  const maxPriority = Math.max(...overlayStack.map(getOverlayPriority));
  const topAtPriority = [...overlayStack].reverse().find((entry) => getOverlayPriority(entry) === maxPriority);
  return topAtPriority === id;
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

export function clearOverlayStackForTests() {
  overlayStack.length = 0;
}
