import { createEffect, onCleanup, Show, type JSX } from "solid-js";
import { X } from "lucide-solid";
import { cn } from "../../lib/utils";
import { isTopOverlay, registerFocusReturn, registerOverlay, restoreOverlayFocus, trapFocusInOverlay } from "./overlay-stack";

export function SheetRoot(props: { open: boolean; onOpenChange: (open: boolean) => void; children: JSX.Element }) {
  return <div data-test-sheet-root="">{props.children}</div>;
}

export function SheetTrigger(props: JSX.IntrinsicElements["button"]) {
  return (
    <button
      {...props}
      data-test-sheet-trigger=""
      class={cn("cursor-pointer disabled:cursor-not-allowed", props.class)}
      type={props.type ?? "button"}
    >
      {props.children}
    </button>
  );
}

export function SheetContent(props: {
  open?: boolean;
  onClose?: () => void;
  title: string;
  class?: string;
  children: JSX.Element;
}) {
  let surfaceRef: HTMLElement | undefined;
  const overlayId = `sheet-${Math.random().toString(36).slice(2)}`;

  createEffect(() => {
    if (!props.open) {
      return;
    }
    const unregister = registerOverlay(overlayId, { onEscape: () => props.onClose?.() });
    const unregisterFocusReturn = registerFocusReturn(overlayId, document.activeElement instanceof HTMLElement ? document.activeElement : null);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTopOverlay(overlayId)) {
        trapFocusInOverlay(event, surfaceRef);
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
      restoreOverlayFocus(overlayId);
      unregisterFocusReturn();
    });
  });

  return (
    <Show when={props.open}>
      <div data-test-sheet-backdrop="" class="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm" onClick={() => props.onClose?.()} />
      <aside
        class={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[88vw] max-w-sm flex-col border-r border-(--border) bg-(--panel) p-3 shadow-2xl",
          props.class
        )}
        data-test-sheet=""
        tabindex="-1"
        ref={surfaceRef}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            if (isTopOverlay(overlayId)) {
              event.preventDefault();
              event.stopPropagation();
              props.onClose?.();
            }
            return;
          }
          trapFocusInOverlay(event, surfaceRef);
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div class="mb-4 flex items-center justify-between gap-3">
          <div class="text-xs font-semibold uppercase tracking-[0.18em] text-(--muted)">{props.title}</div>
          <button
            class="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-(--foreground) transition hover:bg-(--panel-strong) disabled:cursor-not-allowed"
            type="button"
            aria-label="Close sheet"
            onClick={() => props.onClose?.()}
          >
            <X class="h-4 w-4" />
          </button>
        </div>
        {props.children}
      </aside>
    </Show>
  );
}
