import type { JSX } from "solid-js";
import { cn } from "../../lib/utils";

export function Textarea(props: JSX.IntrinsicElements["textarea"]) {
  return (
    <textarea
      {...props}
      class={cn(
        "flex min-h-24 w-full rounded-2xl border border-[color:var(--border)] bg-white/70 px-3 py-2.5 text-xs text-[color:var(--foreground)] shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] disabled:cursor-not-allowed disabled:opacity-50",
        props.class
      )}
    />
  );
}
