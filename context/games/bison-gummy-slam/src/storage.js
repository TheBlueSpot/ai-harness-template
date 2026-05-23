import { SAVE_KEY } from "./data.js";

function safeLocalStorage() {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

export function readUpgradeSave() {
  const storage = safeLocalStorage();
  if (!storage) return null;
  try {
    return storage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
}

export function writeUpgradeSave(value) {
  const storage = safeLocalStorage();
  if (!storage) return false;
  try {
    storage.setItem(SAVE_KEY, value);
    return true;
  } catch {
    return false;
  }
}

export function parseUpgradeSave(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

