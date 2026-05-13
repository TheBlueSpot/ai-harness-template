import { For, Show } from "solid-js";
import { X } from "lucide-solid";
import { toastStore } from "../toast-store";

export function Toaster() {
  return (
    <div data-test-toaster="" class="pointer-events-none fixed right-4 top-4 z-[140] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3">
      <For each={toastStore.toasts}>
        {(toast) => (
          <div
            class="pointer-events-auto rounded-2xl border p-4 shadow-2xl backdrop-blur-xl"
            classList={{
              "border-red-200/80": toast.tone === "error",
              "bg-red-50/92": toast.tone === "error",
              "border-(--border)": toast.tone !== "error",
              "bg-(--panel)": toast.tone !== "error"
            }}
          >
            <div class="flex items-start justify-between gap-3">
              <div class="space-y-1">
                <div class="text-xs font-semibold text-(--foreground)">{toast.title}</div>
                <Show when={toast.description}>
                  <div class="text-xs text-(--muted)">{toast.description}</div>
                </Show>
              </div>
              <button
                class="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-(--muted) transition hover:bg-(--panel-strong) hover:text-(--foreground) disabled:cursor-not-allowed"
                type="button"
                aria-label="Dismiss toast"
                onClick={() => toastStore.dismiss(toast.id)}
              >
                <X class="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </For>
    </div>
  );
}
