import type { JSX } from "solid-js";
import { Check } from "lucide-solid";
import { cn } from "../../lib/utils";

export function Checkbox(props: {
  checked: boolean;
  label: string;
  description?: string;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  class?: string;
}) {
  const inputId = `checkbox-${props.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  const handleChange: JSX.EventHandler<HTMLInputElement, Event> = (event) => {
    props.onChange(event.currentTarget.checked);
  };

  return (
    <label
      class={cn(
        "inline-flex cursor-pointer items-center gap-2 text-[0.68rem] text-(--muted)",
        props.disabled ? "cursor-not-allowed opacity-60" : undefined,
        props.class
      )}
      for={inputId}
    >
      <span class="relative inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border border-(--border) bg-(--panel-strong)">
        <input
          id={inputId}
          type="checkbox"
          class="absolute inset-0 h-full w-full cursor-inherit opacity-0"
          checked={props.checked}
          disabled={props.disabled}
          onChange={handleChange}
        />
        {props.checked && <Check class="h-3 w-3 text-(--accent-strong)" aria-hidden="true" />}
      </span>
      <span class="min-w-0">
        <span class="block text-(--foreground)">{props.label}</span>
        {props.description && <span class="block text-[0.62rem] leading-4">{props.description}</span>}
      </span>
    </label>
  );
}
