import { createEffect, createMemo, onCleanup, Show, type JSX } from "solid-js";
import { X } from "lucide-solid";
import { cn } from "../../lib/utils";
import { PrimitivePortal } from "./primitive-portal";
import { isTopOverlay, registerOverlay } from "./overlay-stack";

type DialogProps = {
  open?: boolean;
  onClose?: () => void;
  title: string;
  eyebrow?: string;
  description?: string;
  class?: string;
  contentClass?: string;
  children: JSX.Element | (() => JSX.Element);
  footer?: JSX.Element;
};

export function Dialog(props: DialogProps) {
  let surfaceRef: HTMLElement | undefined;
  const overlayId = `dialog-${Math.random().toString(36).slice(2)}`;
  const isOpen = createMemo(() => Boolean(props.open));
  const renderChildren = () => (typeof props.children === "function" ? props.children() : props.children);

  createEffect(() => {
    if (!isOpen()) {
      return;
    }
    const unregister = registerOverlay(overlayId);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isTopOverlay(overlayId)) {
        props.onClose?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keydown", handleKeyDown);
    queueMicrotask(() => {
      surfaceRef?.focus();
    });
    onCleanup(() => {
      unregister();
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keydown", handleKeyDown);
    });
  });

  return (
    <PrimitivePortal active={isOpen()} layer="dialog">
      <Show when={isOpen()}>
        <div data-test-dialog-backdrop="" class="fixed inset-0 z-[80] bg-black/45 backdrop-blur-sm" onClick={() => props.onClose?.()} />
        <div class="fixed inset-0 z-[81] flex items-center justify-center px-3 py-3 md:px-5 md:py-5">
          <section
            class={cn(
              "app-zoom-portal-dialog panel-shell flex max-h-[90vh] w-full max-w-xl flex-col gap-4 rounded-[1.75rem] p-5 shadow-2xl",
              props.class
            )}
            data-test-dialog=""
            role="dialog"
            aria-modal="true"
            aria-label={props.title}
            tabindex="-1"
            ref={surfaceRef}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                if (!isTopOverlay(overlayId)) {
                  return;
                }
                props.onClose?.();
              }
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div class="flex items-start justify-between gap-3">
              <div class="space-y-1">
                <div class="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">
                  {props.eyebrow ?? "Dialog"}
                </div>
                <h2 class="text-xl font-semibold tracking-[-0.04em] text-(--foreground)">{props.title}</h2>
                <Show when={props.description}>
                  <p class="text-xs leading-5 text-(--muted)">{props.description}</p>
                </Show>
              </div>
              <button
                class="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-(--muted) transition hover:bg-(--panel-strong) hover:text-(--foreground) disabled:cursor-not-allowed"
                type="button"
                aria-label="Close dialog"
                onClick={() => props.onClose?.()}
              >
                <X class="h-4 w-4" />
              </button>
            </div>

            <div data-test-dialog-content="" class={cn("flex max-h-[70%] flex-col gap-4 overflow-auto", props.contentClass)}>{renderChildren()}</div>

            <Show when={props.footer}>
              <div class="flex flex-wrap justify-end gap-2">{props.footer}</div>
            </Show>
          </section>
        </div>
      </Show>
    </PrimitivePortal>
  );
}
