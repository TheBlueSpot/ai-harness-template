import { Check, ChevronDown } from "lucide-solid";
import { For, Show, createMemo, createSignal, type JSX } from "solid-js";
import { cn } from "../../lib/utils";
import { Popover } from "./popover";
import { Tooltip } from "./tooltip";

type DropdownOption = {
  value: string;
  label: string;
  description?: string;
  icon?: JSX.Element;
  disabled?: boolean;
};

type DropdownBaseProps = {
  icon: JSX.Element;
  ariaLabel: string;
  class?: string;
  size?: "sm" | "md";
  disabled?: boolean;
  dataAttributes?: Record<string, string>;
};

type DropdownSelectProps = DropdownBaseProps & {
  kind: "select";
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  hideWhenSingleOption?: boolean;
  popoverSide?: "top" | "right" | "bottom" | "left";
  popoverAlign?: "start" | "center" | "end";
  contentClass?: string;
};

type DropdownTriggerProps = DropdownBaseProps & {
  kind: "trigger";
  label: string;
  onClick: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent>;
  type?: "button" | "submit" | "reset";
};

const shellClass =
  "relative inline-flex min-w-0 items-center rounded-lg border border-(--border) bg-white/70 text-(--foreground) shadow-sm transition hover:bg-white/85 focus-within:ring-2 focus-within:ring-(--ring)";

const shellSizeClass = {
  sm: "h-7",
  md: "h-8"
} as const;

const iconOffsetClass = {
  sm: "left-1.5",
  md: "left-2"
} as const;

const endOffsetClass = {
  sm: "right-1.5",
  md: "right-2"
} as const;

const fieldClass = {
  sm: "h-7 pl-6 pr-5 text-[0.625rem]",
  md: "h-8 pl-7 pr-6 text-[0.625rem]"
} as const;

const optionLabelClass = {
  sm: "text-[0.525rem]",
  md: "text-[0.575rem]"
} as const;

export function DropdownControl(props: DropdownSelectProps | DropdownTriggerProps) {
  const size = () => props.size ?? "sm";

  if (props.kind === "select") {
    const [open, setOpen] = createSignal(false);
    const selectedOption = createMemo(
      () => props.options.find((option) => option.value === props.value) ?? props.options[0]
    );

    if (props.hideWhenSingleOption && props.options.length <= 1) {
      return null;
    }

    return (
      <Tooltip content={selectedOption()?.description} disabled={open()} side="top">
        <Popover
          open={open()}
          onClose={() => setOpen(false)}
          class={cn("min-w-0", props.class)}
          align={props.popoverAlign ?? "start"}
          side={props.popoverSide ?? "top"}
          contentClass={cn("min-w-(--popover-trigger-width) rounded-[1rem] p-1.5", props.contentClass)}
          content={
            <div class="flex min-w-[var(--popover-trigger-width)] flex-col gap-0.5">
              <For each={props.options}>
                {(option) => {
                  const selected = () => selectedOption()?.value === option.value;
                  return (
                  <Tooltip content={option.description} triggerClass="block w-full" side="right">
                    <button
                      type="button"
                      class={cn(
                        "flex w-full min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-1 text-left font-medium text-(--foreground) transition hover:bg-black/5 focus-visible:bg-black/5 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
                        optionLabelClass[size()]
                      )}
                      disabled={option.disabled}
                      onClick={() => {
                        if (option.disabled || option.value === props.value) {
                          setOpen(false);
                          return;
                        }
                        props.onChange(option.value);
                        setOpen(false);
                      }}
                    >
                      <span class="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-(--muted)">
                        <Show when={option.icon}>{option.icon}</Show>
                      </span>
                      <span class="min-w-0 flex-1 whitespace-nowrap">{option.label}</span>
                      <Show when={selected()}>
                        <Check class="h-3 w-3 shrink-0 text-(--foreground)" />
                      </Show>
                    </button>
                  </Tooltip>
                  );
                }}
              </For>
            </div>
          }
        >
          <button
            aria-label={props.ariaLabel}
            aria-expanded={open()}
            data-test-dropdown-control=""
            {...props.dataAttributes}
            class={cn(
              shellClass,
              shellSizeClass[size()],
              "w-full cursor-pointer justify-start gap-1.5 px-1.5 font-medium outline-none focus-visible:ring-2 focus-visible:ring-(--ring) disabled:cursor-not-allowed disabled:opacity-60",
              props.class
            )}
            disabled={props.disabled || props.options.length === 0}
            onClick={() => setOpen((current) => !current)}
            type="button"
          >
            <span class="text-(--muted)">{selectedOption()?.icon ?? props.icon}</span>
            <span class="min-w-0 flex-1 truncate text-left text-[0.625rem]">{selectedOption()?.label ?? props.value}</span>
            <ChevronDown class="h-3.5 w-3.5 text-(--muted)" />
          </button>
        </Popover>
      </Tooltip>
    );
  }

  return (
    <button
      aria-label={props.ariaLabel}
      data-test-dropdown-control=""
      {...props.dataAttributes}
      class={cn(
        shellClass,
        shellSizeClass[size()],
        "cursor-pointer justify-start gap-1.5 px-1.5 font-medium outline-none focus-visible:ring-2 focus-visible:ring-(--ring) disabled:cursor-not-allowed disabled:opacity-60",
        props.class
      )}
      disabled={props.disabled}
      onClick={props.onClick}
      type={props.type ?? "button"}
    >
      <span class="text-(--muted)">{props.icon}</span>
      <span class="min-w-0 flex-1 truncate text-left text-[0.625rem]">{props.label}</span>
      <ChevronDown class="h-3.5 w-3.5 text-(--muted)" />
    </button>
  );
}

export type { DropdownOption };
