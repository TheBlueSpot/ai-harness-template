import { Show, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { X } from "lucide-solid";
import { cn } from "../../lib/utils";

type DialogProps = {
  open?: boolean;
  onClose?: () => void;
  title: string;
  description?: string;
  class?: string;
  children: JSX.Element;
  footer?: JSX.Element;
};

export function Dialog(props: DialogProps) {
  return (
    <Portal>
      <Show when={props.open}>
        <div class="fixed inset-0 z-[80] bg-black/45 backdrop-blur-sm" onClick={() => props.onClose?.()} />
        <div class="fixed inset-0 z-[81] flex items-center justify-center px-3 py-3 md:px-5 md:py-5">
          <section
            class={cn(
              "panel-shell flex w-full max-w-xl flex-col gap-4 rounded-[1.75rem] p-5 shadow-2xl",
              props.class
            )}
            role="dialog"
            aria-modal="true"
            aria-label={props.title}
          >
            <div class="flex items-start justify-between gap-3">
              <div class="space-y-1">
                <div class="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">
                  Preferences
                </div>
                <h2 class="text-xl font-semibold tracking-[-0.04em] text-[color:var(--foreground)]">{props.title}</h2>
                <Show when={props.description}>
                  <p class="text-xs leading-5 text-[color:var(--muted)]">{props.description}</p>
                </Show>
              </div>
              <button
                class="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-[color:var(--muted)] transition hover:bg-[color:var(--panel-strong)] hover:text-[color:var(--foreground)] disabled:cursor-not-allowed"
                type="button"
                aria-label="Close dialog"
                onClick={() => props.onClose?.()}
              >
                <X class="h-4 w-4" />
              </button>
            </div>

            <div class="flex flex-col gap-4">{props.children}</div>

            <Show when={props.footer}>
              <div class="flex flex-wrap justify-end gap-2">{props.footer}</div>
            </Show>
          </section>
        </div>
      </Show>
    </Portal>
  );
}
