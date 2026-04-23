import { createStore } from "solid-js/store";

export type ToastEntry = {
  id: string;
  title: string;
  description?: string;
  tone?: "error" | "info";
};

export type ToastScheduler = {
  schedule(callback: () => void, delayMs: number): () => void;
};

export const DEFAULT_TOAST_AUTO_DISMISS_MS = 5000;

const defaultScheduler: ToastScheduler = {
  schedule(callback, delayMs) {
    const handle = setTimeout(callback, delayMs);
    return () => clearTimeout(handle);
  }
};

export type CreateToastStoreOptions = {
  scheduler?: ToastScheduler;
  autoDismissMs?: number;
};

export function createToastStoreForProvider(options: CreateToastStoreOptions = {}) {
  const scheduler = options.scheduler ?? defaultScheduler;
  const autoDismissMs = options.autoDismissMs ?? DEFAULT_TOAST_AUTO_DISMISS_MS;
  const [toasts, setToasts] = createStore<ToastEntry[]>([]);
  // Track per-toast cancel handles so provider teardown and manual dismiss can
  // both cancel the pending auto-dismiss timer. Before this was in place,
  // timers fired after provider unmount and mutated a torn-down store.
  const cancelByToastId = new Map<string, () => void>();
  let disposed = false;

  function push(toast: Omit<ToastEntry, "id">) {
    if (disposed) {
      return;
    }

    const id = crypto.randomUUID();
    setToasts((items) => [...items, { id, ...toast }]);
    const cancel = scheduler.schedule(() => dismiss(id), autoDismissMs);
    cancelByToastId.set(id, cancel);
  }

  function dismiss(id: string) {
    const cancel = cancelByToastId.get(id);
    cancel?.();
    cancelByToastId.delete(id);
    if (disposed) {
      return;
    }

    setToasts((items) => items.filter((toast) => toast.id !== id));
  }

  function clear() {
    for (const cancel of cancelByToastId.values()) {
      cancel();
    }
    cancelByToastId.clear();
    if (disposed) {
      return;
    }

    setToasts([]);
  }

  function replace(nextToasts: ToastEntry[]) {
    if (disposed) {
      return;
    }

    setToasts(nextToasts);
  }

  function dispose() {
    disposed = true;
    for (const cancel of cancelByToastId.values()) {
      cancel();
    }
    cancelByToastId.clear();
    setToasts([]);
  }

  return {
    toasts,
    push,
    dismiss,
    clear,
    replace,
    dispose,
    get pendingTimerCount() {
      return cancelByToastId.size;
    }
  };
}

export type ToastStoreApi = ReturnType<typeof createToastStoreForProvider>;

let activeToastStore: ToastStoreApi | undefined;

export function setActiveToastStore(store: ToastStoreApi | undefined) {
  activeToastStore = store;
}

export function getActiveToastStore() {
  return activeToastStore;
}

export function requireToastStore() {
  if (!activeToastStore) {
    throw new Error("Toast store not initialized");
  }

  return activeToastStore;
}

export const toastStore = new Proxy({} as ToastStoreApi, {
  get(_target, prop, receiver) {
    return Reflect.get(requireToastStore(), prop, receiver);
  },
  set(_target, prop, value, receiver) {
    return Reflect.set(requireToastStore(), prop, value, receiver);
  },
  ownKeys() {
    return Reflect.ownKeys(requireToastStore());
  },
  getOwnPropertyDescriptor(_target, prop) {
    return Object.getOwnPropertyDescriptor(requireToastStore(), prop);
  }
});

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

export function resetToastStoreForTests() {
  toastStore.clear();
}

export function seedToastStoreForTests(toasts: ToastEntry[]) {
  toastStore.replace(toasts);
}

export function reportUiError(error: unknown, source: string, options: ReportUiErrorOptions = {}) {
  const normalizedError = normalizeUiError(error);
  const rethrowMode = options.rethrow ?? "dev-only";
  const descriptionParts = [
    options.projectId ? `Project: ${options.projectId}` : undefined,
    normalizedError.message
  ].filter(Boolean);

  pushToast(source, descriptionParts.join(" | "), "error");

  if (rethrowMode === "dev-only" && isDevelopmentUiRuntime()) {
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
