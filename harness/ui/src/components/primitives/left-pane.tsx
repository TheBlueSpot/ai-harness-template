import { Check, ChevronRight, CircleHelp, Search, SlidersHorizontal } from "lucide-solid";
import { For, Show, createSignal, splitProps, type JSX } from "solid-js";
import { cn } from "../../lib/utils";
import { Input } from "./input";
import { Popover } from "./popover";
import { Tooltip } from "./tooltip";

type LeftPaneShellProps = {
  children: JSX.Element;
  class?: string;
  padding?: "compact" | "comfortable";
  kind?: string;
} & JSX.HTMLAttributes<HTMLElement>;

export function LeftPaneShell(props: LeftPaneShellProps) {
  const [local, rest] = splitProps(props, ["children", "class", "padding", "kind"]);
  const paddingClass = () => (local.padding === "comfortable" ? "p-4" : "p-[0.8rem]");

  return (
    <section
      {...rest}
      data-test-left-pane-shell=""
      data-left-pane-kind={local.kind}
      class={cn("panel-shell flex h-full min-h-0 flex-col gap-4 rounded-2xl border-t-0", paddingClass(), local.class)}
    >
      {local.children}
    </section>
  );
}

type LeftPaneHeaderProps = {
  title: string;
  help: string;
  actions?: JSX.Element;
  class?: string;
};

export function LeftPaneHeader(props: LeftPaneHeaderProps) {
  return (
    <div class={cn("px-1 py-1", props.class)}>
      <div class="flex items-center justify-between gap-3">
        <div class="flex min-w-0 items-center gap-2 text-[0.585rem] font-semibold tracking-[0.2em] text-(--muted)">
          <span class="truncate">{props.title}</span>
          <Tooltip content={props.help}>
            <span class="inline-flex shrink-0">
              <CircleHelp class="h-3.5 w-3.5 text-(--muted)" aria-label={`${props.title} help`} />
            </span>
          </Tooltip>
        </div>
        <div class="flex shrink-0 items-center gap-2">{props.actions}</div>
      </div>
    </div>
  );
}

export function LeftPaneFilterBlock(props: { children: JSX.Element; class?: string }) {
  return <div class={cn("grid gap-2", props.class)}>{props.children}</div>;
}

type LeftPaneSearchInputProps = JSX.IntrinsicElements["input"] & {
  wrapperClass?: string;
  menu?: JSX.Element;
};

export function LeftPaneSearchInput(props: LeftPaneSearchInputProps) {
  const [local, rest] = splitProps(props, ["class", "wrapperClass", "menu"]);

  return (
    <div class={cn("relative block", local.wrapperClass)}>
      <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--muted)" />
      <Input {...rest} type="search" class={cn("h-10 pl-9", local.menu ? "pr-12" : undefined, local.class)} />
      <Show when={local.menu}>
        <div class="absolute right-1.5 top-1/2 -translate-y-1/2">{local.menu}</div>
      </Show>
    </div>
  );
}

export type LeftPaneSearchMenuItem =
  | { kind: "section"; label: string }
  | { kind: "separator" }
  | {
      kind: "option";
      label: string;
      icon: JSX.Element;
      selected?: boolean;
      disabled?: boolean;
      onSelect: () => void;
    }
  | {
      kind: "submenu";
      label: string;
      value?: string;
      icon: JSX.Element;
      items: Array<Extract<LeftPaneSearchMenuItem, { kind: "option" }>>;
    };

export function LeftPaneSearchMenu(props: {
  ariaLabel: string;
  tooltip: string;
  items: LeftPaneSearchMenuItem[];
}) {
  const [open, setOpen] = createSignal(false);
  const [openSubmenuIndex, setOpenSubmenuIndex] = createSignal<number>();

  const renderOption = (item: Extract<LeftPaneSearchMenuItem, { kind: "option" }>) => (
    <button
      type="button"
      class="flex min-h-8 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-left text-(--foreground) transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={item.disabled}
      onClick={() => {
        if (item.disabled) {
          return;
        }
        item.onSelect();
        setOpen(false);
      }}
    >
      <span class="flex h-4 w-4 shrink-0 items-center justify-center text-(--muted)">{item.icon}</span>
      <span class="min-w-0 flex-1 truncate">{item.label}</span>
      <Show when={item.selected}>
        <Check class="h-3.5 w-3.5 shrink-0 text-(--foreground)" />
      </Show>
    </button>
  );

  return (
    <Tooltip content={props.tooltip} disabled={open()}>
      <Popover
        open={open()}
        onClose={() => setOpen(false)}
        align="end"
        side="bottom"
        contentClass="w-60 rounded-[1rem] p-2"
        content={
          <div class="flex flex-col gap-1 text-[0.675rem]">
            <For each={props.items}>
              {(item, index) => {
                if (item.kind === "separator") {
                  return <div class="my-1 border-t border-(--border)" />;
                }
                if (item.kind === "section") {
                  return <div class="px-2 py-1 text-[0.625rem] text-(--muted)">{item.label}</div>;
                }
                if (item.kind === "submenu") {
                  const active = () => openSubmenuIndex() === index();
                  return (
                    <div class="relative" onMouseEnter={() => setOpenSubmenuIndex(index())} onFocusIn={() => setOpenSubmenuIndex(index())}>
                      <button
                        type="button"
                        class="flex min-h-8 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-left text-(--foreground) transition hover:bg-black/5"
                      >
                        <span class="flex h-4 w-4 shrink-0 items-center justify-center text-(--muted)">{item.icon}</span>
                        <span class="min-w-0 flex-1 truncate">{item.label}</span>
                        <Show when={item.value}>
                          <span class="max-w-20 truncate text-[0.625rem] text-(--muted)">{item.value}</span>
                        </Show>
                        <ChevronRight class="h-3.5 w-3.5 shrink-0 text-(--muted)" />
                      </button>
                      <Show when={active()}>
                        <div class="absolute left-full top-0 z-[131] ml-2 flex w-52 flex-col gap-1 rounded-[1rem] border border-(--border) bg-(--panel) p-2 shadow-2xl">
                          <For each={item.items}>{(subitem) => renderOption(subitem)}</For>
                        </div>
                      </Show>
                    </div>
                  );
                }
                return renderOption(item);
              }}
            </For>
          </div>
        }
      >
        <button
          type="button"
          class="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-(--muted) transition hover:bg-black/5 hover:text-(--foreground) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring)"
          aria-label={props.ariaLabel}
          aria-expanded={open()}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setOpen((current) => !current)}
        >
          <SlidersHorizontal class="h-3.5 w-3.5" />
        </button>
      </Popover>
    </Tooltip>
  );
}

export function LeftPaneListSection(props: { title: string; count?: string | number; children: JSX.Element; class?: string }) {
  return (
    <section class={cn("flex min-h-0 flex-1 flex-col rounded-[1.35rem] border border-(--border) bg-white/55 p-4", props.class)}>
      <div class="mb-3 flex items-center justify-between gap-3">
        <div class="text-[0.585rem] font-semibold uppercase tracking-[0.18em] text-(--muted)">{props.title}</div>
        <span class="text-[0.625rem] text-(--muted)">{props.count}</span>
      </div>
      {props.children}
    </section>
  );
}

export function LeftPaneEmptyState(props: { children: JSX.Element; class?: string }) {
  return (
    <div
      data-test-left-pane-empty-state=""
      class={cn("rounded-[1.2rem] border border-dashed border-(--border) bg-white/45 p-4 text-[0.675rem] leading-5 text-(--muted)", props.class)}
    >
      {props.children}
    </div>
  );
}

export function DetailEmptyState(props: { children: JSX.Element; class?: string }) {
  return (
    <div
      data-test-detail-empty-state=""
      class={cn("flex h-full min-h-80 items-center justify-center rounded-[1.2rem] border border-dashed border-(--border) bg-white/45 p-6 text-center text-[0.675rem] text-(--muted)", props.class)}
    >
      {props.children}
    </div>
  );
}
