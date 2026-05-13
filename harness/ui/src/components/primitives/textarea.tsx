/** @jsxImportSource solid-js */
import type { JSX } from "solid-js";
import { cn } from "../../lib/utils";

export function Textarea(props: JSX.IntrinsicElements["textarea"]) {
  return (
    <textarea
      {...props}
      data-test-textarea=""
      class={cn(
        "flex min-h-[4.2rem] w-full rounded-2xl border border-(--border) bg-white/70 px-3 py-2.5 text-xs text-(--foreground) shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-(--ring) disabled:cursor-not-allowed disabled:opacity-50",
        props.class
      )}
    />
  );
}
