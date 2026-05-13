export type UiTelemetryEvent = {
  at: string;
  kind: string;
  detail?: Record<string, unknown>;
};

const MAX_UI_TELEMETRY_EVENTS = 200;

declare global {
  interface Window {
    __HARNESS_UI_TELEMETRY__?: UiTelemetryEvent[];
  }
}

export function recordUiTelemetry(kind: string, detail?: Record<string, unknown>) {
  if (typeof window === "undefined") {
    return;
  }

  const event: UiTelemetryEvent = {
    at: new Date().toISOString(),
    kind,
    detail
  };
  const events = window.__HARNESS_UI_TELEMETRY__ ?? [];
  events.push(event);
  if (events.length > MAX_UI_TELEMETRY_EVENTS) {
    events.splice(0, events.length - MAX_UI_TELEMETRY_EVENTS);
  }
  window.__HARNESS_UI_TELEMETRY__ = events;

  if (isHarnessUiTelemetryConsoleEnabled()) {
    console.debug("[harness-ui-telemetry]", event);
  }
}

export function readUiTelemetrySnapshot() {
  if (typeof window === "undefined") {
    return [];
  }
  return [...(window.__HARNESS_UI_TELEMETRY__ ?? [])];
}

export function isHarnessUiTelemetryConsoleEnabled() {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem("harness_ui_telemetry_console") === "1";
}
