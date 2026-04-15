import { createStore } from "solid-js/store";

export type ToastEntry = {
  id: string;
  title: string;
  description?: string;
  tone?: "error" | "info";
};

function createToastStore() {
  const [toasts, setToasts] = createStore<ToastEntry[]>([]);

  function push(toast: Omit<ToastEntry, "id">) {
    const id = crypto.randomUUID();
    setToasts((items) => [...items, { id, ...toast }]);
    setTimeout(() => dismiss(id), 5000);
  }

  function dismiss(id: string) {
    setToasts((items) => items.filter((toast) => toast.id !== id));
  }

  return {
    toasts,
    push,
    dismiss
  };
}

export const toastStore = createToastStore();

type ReportUiErrorOptions = {
  projectId?: string;
  rethrow?: "never" | "dev-only";
};

export function pushToast(title: string, description?: string, tone: ToastEntry["tone"] = "info") {
  toastStore.push({
    title,
    description,
    tone
  });
}

export function reportUiError(error: unknown, source: string, options: ReportUiErrorOptions = {}) {
  const normalizedError = normalizeUiError(error);
  const descriptionParts = [
    options.projectId ? `Project: ${options.projectId}` : undefined,
    normalizedError.message
  ].filter(Boolean);

  pushToast(source, descriptionParts.join(" | "), "error");

  if (options.rethrow === "dev-only" && isDevelopmentUiRuntime()) {
    queueMicrotask(() => {
      throw normalizedError;
    });
  }
}

export function normalizeUiError(error: unknown) {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === "string") {
    return new Error(error);
  }

  return new Error("Unknown error");
}

function isDevelopmentUiRuntime() {
  if (typeof window === "undefined") {
    return false;
  }

  return ["localhost", "127.0.0.1"].includes(window.location.hostname);
}
