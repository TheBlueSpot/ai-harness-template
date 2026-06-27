import { terminalStore } from "./terminal-store";

export function openTerminalSearch() {
  terminalStore.setSearch(true);
  focusTerminalSearchInput();
}

export function closeTerminalSearch() {
  terminalStore.setSearch(false, "");
}

export function toggleTerminalSearch() {
  if (terminalStore.state.searchOpen) {
    closeTerminalSearch();
    return;
  }
  openTerminalSearch();
}

function focusTerminalSearchInput() {
  queueMicrotask(() => {
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Search terminal"]');
    input?.focus();
    input?.select();
  });
}
