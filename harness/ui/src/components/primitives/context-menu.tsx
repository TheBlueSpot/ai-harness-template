import { createEffect, For, onCleanup, Show } from "solid-js";
import { cn } from "../../lib/utils";
import { Button } from "./button";
import { PrimitivePortal } from "./primitive-portal";

export type ContextMenuAction = {
  id: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  disabledReason?: string;
  onSelect: () => void;
};

type ContextMenuProps = {
  open: boolean;
  x: number;
  y: number;
  ariaLabel: string;
  actions: ContextMenuAction[];
  onClose: () => void;
};

export function ContextMenu(props: ContextMenuProps) {
  let surfaceRef: HTMLDivElement | undefined;

  createEffect(() => {
    if (!props.open) {
      return;
    }

    const closeOnPointer = (event: PointerEvent) => {
      if (surfaceRef?.contains(event.target as Node)) {
        return;
      }
      props.onClose();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        props.onClose();
      }
    };
    window.addEventListener("pointerdown", closeOnPointer);
    window.addEventListener("keydown", closeOnEscape);
    onCleanup(() => {
      window.removeEventListener("pointerdown", closeOnPointer);
      window.removeEventListener("keydown", closeOnEscape);
    });
  });

  const position = () => ({
    left: `${Math.max(8, Math.min(props.x, window.innerWidth - 220))}px`,
    top: `${Math.max(8, Math.min(props.y, window.innerHeight - 220))}px`
  });

  return (
    <PrimitivePortal active={props.open} layer="popover">
      <Show when={props.open}>
        <div
          ref={surfaceRef}
          data-test-context-menu=""
          role="menu"
          aria-label={props.ariaLabel}
          class="app-zoom-portal-content fixed z-[150] flex w-52 flex-col gap-1 rounded-xl border border-(--border) bg-(--panel-strong) p-1.5 text-xs text-(--foreground) shadow-2xl"
          style={position()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <For each={props.actions}>
            {(action) => (
              <Button
                tooltip={action.disabled && action.disabledReason ? action.disabledReason : action.label}
                variant="ghost"
                size="sm"
                class={cn("h-8 w-full justify-between rounded-lg px-2 text-left", action.disabled ? "opacity-50" : "")}
                disabled={action.disabled}
                role="menuitem"
                onClick={() => {
                  if (action.disabled) {
                    return;
                  }
                  action.onSelect();
                  props.onClose();
                }}
              >
                <span>{action.label}</span>
                <Show when={action.shortcut}>
                  <span class="text-[0.62rem] text-(--muted)">{action.shortcut}</span>
                </Show>
              </Button>
            )}
          </For>
        </div>
      </Show>
    </PrimitivePortal>
  );
}
