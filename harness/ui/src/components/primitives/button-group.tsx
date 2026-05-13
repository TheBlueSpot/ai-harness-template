import { For, createEffect, createSignal, onCleanup, type JSX } from "solid-js";
import { Menu } from "lucide-solid";
import { cn } from "../../lib/utils";
import { ActionButton } from "../action-button";
import { Button } from "./button";
import { Popover } from "./popover";
import { Tooltip } from "./tooltip";

export type ButtonGroupItem = {
  key: string;
  label: string;
  tooltip: string;
  disabledReason?: string;
  icon: JSX.Element;
  class?: string;
  classList?: Record<string, boolean | undefined>;
  disabled?: boolean;
  onClick?: (event: MouseEvent & { currentTarget: HTMLButtonElement }) => void;
};

type ButtonGroupProps = {
  items: ButtonGroupItem[] | (() => ButtonGroupItem[]);
  menuLabel: string;
  class?: string;
  collapseBelowWidth?: number | string;
};

export function ButtonGroup(props: ButtonGroupProps) {
  const [collapsed, setCollapsed] = createSignal(false);
  const [open, setOpen] = createSignal(false);
  let rootElement: HTMLDivElement | undefined;
  let resizeObserver: ResizeObserver | undefined;

  const updateCollapsed = () => {
    const target = rootElement?.parentElement ?? rootElement;
    if (!target) {
      return;
    }
    setCollapsed(target.getBoundingClientRect().width < resolveCollapseWidth(props.collapseBelowWidth));
  };

  createEffect(() => {
    updateCollapsed();
    const target = rootElement?.parentElement ?? rootElement;
    if (!target || typeof ResizeObserver === "undefined") {
      return;
    }
    resizeObserver?.disconnect();
    resizeObserver = new ResizeObserver(updateCollapsed);
    resizeObserver.observe(target);
  });

  onCleanup(() => resizeObserver?.disconnect());

  const items = () => (typeof props.items === "function" ? props.items() : props.items);

  const runItem = (item: ButtonGroupItem, event: MouseEvent & { currentTarget: HTMLButtonElement }) => {
    if (item.disabled) {
      return;
    }
    item.onClick?.(event);
    setOpen(false);
  };

  return (
    <div ref={rootElement} data-test-button-group="" class={cn("flex shrink-0 gap-0.5", props.class)}>
      {collapsed() ? (
        <Popover
          open={open()}
          onClose={() => setOpen(false)}
          align="end"
          side="bottom"
          contentClass="w-44 rounded-[1rem] p-1.5"
          content={
            <div class="flex flex-col gap-1 text-[0.675rem]">
              <For each={items()}>
                {(item) => (
                  <Tooltip content={item.disabled && item.disabledReason ? item.disabledReason : item.tooltip} triggerClass="block">
                    <button
                      type="button"
                      class="flex min-h-8 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-left font-semibold text-(--foreground) transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-45"
                      disabled={item.disabled}
                      aria-label={item.label}
                      aria-description={item.disabled && item.disabledReason ? item.disabledReason : undefined}
                      onClick={(event) => runItem(item, event)}
                    >
                      <span class="flex h-4 w-4 items-center justify-center">{item.icon}</span>
                      <span class="min-w-0 flex-1 truncate">{item.label}</span>
                    </button>
                  </Tooltip>
                )}
              </For>
            </div>
          }
        >
          <Button
            tooltip={props.menuLabel}
            aria-label={props.menuLabel}
            variant="ghost"
            size="icon"
            class="h-6 w-6 rounded-lg"
            onClick={() => setOpen((current) => !current)}
          >
            <Menu class="h-3 w-3" />
          </Button>
        </Popover>
      ) : (
        <For each={items()}>
          {(item) => (
            <ActionButton
              tooltip={item.tooltip}
              disabledReason={item.disabledReason}
              disabled={item.disabled}
              icon={item.icon}
              variant="ghost"
              size="icon"
              class={cn("h-6 w-6 rounded-lg", item.class)}
              classList={item.classList}
              ariaLabel={item.label}
              onClick={item.onClick}
            />
          )}
        </For>
      )}
    </div>
  );
}

function resolveCollapseWidth(width: number | string | undefined) {
  if (typeof width === "number") {
    return width;
  }
  if (typeof width !== "string") {
    return 22 * 16;
  }

  const trimmed = width.trim();
  if (trimmed.endsWith("rem")) {
    const rem = Number(trimmed.slice(0, -3));
    return Number.isFinite(rem) ? rem * 16 : 22 * 16;
  }
  if (trimmed.endsWith("px")) {
    const px = Number(trimmed.slice(0, -2));
    return Number.isFinite(px) ? px : 22 * 16;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : 22 * 16;
}
