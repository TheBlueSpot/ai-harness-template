import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function truncateMiddle(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  const segmentLength = Math.floor((maxLength - 1) / 2);
  return `${value.slice(0, segmentLength)}...${value.slice(-segmentLength)}`;
}

export function toProperCase(value: string) {
  return value
    .trim()
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

export function formatProviderModelName(value: string) {
  return toProperCase(value.trim().split("/").filter(Boolean).at(-1) ?? value);
}

export function normalizeWindowsEscapedPath(value: string) {
  if (/^[a-zA-Z]:\\\\/.test(value)) {
    return value.replace(/\\\\/g, "\\");
  }

  return value;
}

export function isAbsolutePath(value: string) {
  const normalizedValue = normalizeWindowsEscapedPath(value.trim());
  return /^[a-zA-Z]:\\/.test(normalizedValue) || normalizedValue.startsWith("/");
}

export function normalizePathForComparison(value: string) {
  const normalizedValue = normalizeWindowsEscapedPath(value.trim()).replace(/[\\/]+$/, "");
  return isWindowsPlatform() ? normalizedValue.toLowerCase() : normalizedValue;
}

export function isPathPrefixMatch(query: string, candidate: string) {
  const normalizedQuery = normalizePathForComparison(query);
  const normalizedCandidate = normalizePathForComparison(candidate);
  return normalizedCandidate.startsWith(normalizedQuery);
}

function isWindowsPlatform() {
  return typeof navigator !== "undefined" ? navigator.userAgent.toLowerCase().includes("windows") : false;
}
