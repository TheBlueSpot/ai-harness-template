import type { JSX } from "solid-js";
import { cn } from "../../lib/utils";

export function Input(props: JSX.IntrinsicElements["input"]) {
  return (
    <input
      {...props}
      class={cn(
        "flex h-9 w-full rounded-xl border border-[color:var(--border)] bg-white/70 px-3 py-2 text-xs text-[color:var(--foreground)] shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] disabled:cursor-not-allowed disabled:opacity-50",
        props.class
      )}
    />
  );
}
