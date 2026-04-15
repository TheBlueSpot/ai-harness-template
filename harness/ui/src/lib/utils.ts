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
