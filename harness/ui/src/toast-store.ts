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

export function pushToast(title: string, description?: string, tone: ToastEntry["tone"] = "info") {
  toastStore.push({
    title,
    description,
    tone
  });
}

export function reportUiError(error: unknown, source: string, projectId?: string) {
  const descriptionParts = [
    projectId ? `Project: ${projectId}` : undefined,
    error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error"
  ].filter(Boolean);

  pushToast(source, descriptionParts.join(" | "), "error");
}
