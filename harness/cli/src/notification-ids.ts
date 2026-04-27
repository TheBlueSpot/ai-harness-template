import { createHash } from "node:crypto";

export const MAX_BOUNDED_ID_LENGTH = 128;

export function createStableBoundedId(parts: readonly string[], maxLength: number = MAX_BOUNDED_ID_LENGTH) {
  const joined = parts.join(":");
  if (joined.length <= maxLength) {
    return joined;
  }

  const hash = createHash("sha256").update(joined).digest("hex").slice(0, 16);
  const suffix = `:${hash}`;
  const prefixLength = Math.max(0, maxLength - suffix.length);
  return `${joined.slice(0, prefixLength)}${suffix}`;
}

export function createLegacyTruncatedId(parts: readonly string[], maxLength: number = MAX_BOUNDED_ID_LENGTH) {
  return parts.join(":").slice(0, maxLength);
}
