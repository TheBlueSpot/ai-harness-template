export function queryParam(name: string) {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    return new URLSearchParams(window.location.search).get(name) ?? undefined;
  } catch {
    return undefined;
  }
}
