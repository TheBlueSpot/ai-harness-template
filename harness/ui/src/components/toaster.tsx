import { For, Show } from "solid-js";
import { X } from "lucide-solid";
import { toastStore } from "../toast-store";

export function Toaster() {
  return (
    <div class="pointer-events-none fixed right-4 top-4 z-[70] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3">
      <For each={toastStore.toasts}>
        {(toast) => (
          <div
            class={`pointer-events-auto rounded-2xl border p-4 shadow-2xl backdrop-blur-xl ${
              toast.tone === "error"
                ? "border-red-200/80 bg-red-50/92"
                : "border-[color:var(--border)] bg-[color:var(--panel)]"
            }`}
          >
            <div class="flex items-start justify-between gap-3">
              <div class="space-y-1">
                <div class="text-xs font-semibold text-[color:var(--foreground)]">{toast.title}</div>
                <Show when={toast.description}>
                  <div class="text-xs text-[color:var(--muted)]">{toast.description}</div>
                </Show>
              </div>
              <button
                class="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[color:var(--muted)] transition hover:bg-[color:var(--panel-strong)] hover:text-[color:var(--foreground)]"
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
