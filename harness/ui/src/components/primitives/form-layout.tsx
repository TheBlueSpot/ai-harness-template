import type { JSX } from "solid-js";
import { cn } from "../../lib/utils";

export function DialogFormSection(props: {
  title: string;
  description?: string;
  class?: string;
  children: JSX.Element;
}) {
  return (
    <section
      data-test-dialog-form-section=""
      class={cn("grid gap-3 border-t border-(--border) pt-4 first:border-t-0 first:pt-0", props.class)}
    >
      <div class="flex min-w-0 flex-col gap-1">
        <h3 class="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-(--foreground)">{props.title}</h3>
        {props.description ? <p class="text-[0.7rem] leading-5 text-(--muted)">{props.description}</p> : null}
      </div>
      {props.children}
    </section>
  );
}

export function DialogField(props: {
  label: string;
  class?: string;
  children: JSX.Element;
}) {
  return (
    <label data-test-dialog-field="" class={cn("grid min-w-0 gap-1.5", props.class)}>
      <span class="text-[0.585rem] font-semibold uppercase tracking-[0.16em] text-(--muted)">{props.label}</span>
      {props.children}
    </label>
  );
}

export function DialogInlineNote(props: {
  tone?: "neutral" | "danger" | "success";
  class?: string;
  children: JSX.Element;
}) {
  const tone = () => props.tone ?? "neutral";

  return (
    <div
      data-test-dialog-inline-note=""
      class={cn(
        "border-l-2 px-3 py-2 text-[0.675rem] leading-5",
        {
          "border-(--border) text-(--muted)": tone() === "neutral",
          "border-rose-300 bg-rose-50/80 text-rose-900": tone() === "danger",
          "border-emerald-400 bg-emerald-50/80 text-emerald-900": tone() === "success"
        },
        props.class
      )}
    >
      {props.children}
    </div>
  );
}
