import { Show, type JSX } from "solid-js";
import { X } from "lucide-solid";
import { cn } from "../../lib/utils";

export function SheetRoot(props: { open: boolean; onOpenChange: (open: boolean) => void; children: JSX.Element }) {
  return props.children;
}

export function SheetTrigger(props: JSX.IntrinsicElements["button"]) {
  return (
    <button
      {...props}
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
  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm" onClick={() => props.onClose?.()} />
      <aside
        class={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[88vw] max-w-sm flex-col border-r border-[color:var(--border)] bg-[color:var(--panel)] p-3 shadow-2xl",
          props.class
        )}
      >
        <div class="mb-4 flex items-center justify-between gap-3">
          <div class="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">{props.title}</div>
          <button
            class="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-[color:var(--foreground)] transition hover:bg-[color:var(--panel-strong)] disabled:cursor-not-allowed"
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
