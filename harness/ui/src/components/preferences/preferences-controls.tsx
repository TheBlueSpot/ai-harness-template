/** @jsxImportSource solid-js */
import { createSignal, For, Show, type JSX } from "solid-js";
import { ChevronDown, Eye, EyeOff } from "lucide-solid";
import { cn } from "../../lib/utils";
import { ActionButton } from "../action-button";
import { Button } from "../primitives/button";
import { Input } from "../primitives/input";

export function PreferenceSection(props: { title: string; description: string; children: JSX.Element }) {
  return (
    <section class="grid min-w-0 gap-3">
      <div class="min-w-0 border-b border-(--border) pb-3">
        <h3 class="truncate font-display text-lg font-semibold text-(--muted)">{props.title}</h3>
        <p class="mt-1 truncate text-xs leading-5 text-(--muted)">{props.description}</p>
      </div>
      <div class="grid gap-3">{props.children}</div>
    </section>
  );
}

export function PreferenceRow(props: {
  id?: string;
  title: string;
  description: string;
  children: JSX.Element;
  class?: string;
}) {
  return (
    <section
      id={props.id}
      data-test-preference-row={props.id}
      class={cn("grid min-w-0 gap-3 overflow-hidden rounded-xl border border-(--border) bg-white/55 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]", props.class)}
    >
      <div class="min-w-0">
        <h4 class="truncate text-[0.585rem] font-semibold tracking-[0.18em] text-(--muted)">{props.title}</h4>
        <p class="mt-1 truncate text-[0.675rem] leading-5 text-(--muted)">{props.description}</p>
      </div>
      <div class="min-w-0">{props.children}</div>
    </section>
  );
}

export function SegmentedControl<T extends string>(props: {
  ariaLabel: string;
  value: T;
  options: Array<{ value: T; label: string; disabled?: boolean }>;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={props.ariaLabel} class="grid rounded-xl border border-(--border) bg-white/55 p-1" style={{ "grid-template-columns": `repeat(${props.options.length}, minmax(0, 1fr))` }}>
      <For each={props.options}>
        {(option) => (
          <button
            type="button"
            class="min-h-8 min-w-0 truncate rounded-lg px-2 text-xs font-medium text-(--muted) transition hover:bg-white/75 hover:text-(--foreground) disabled:cursor-not-allowed disabled:opacity-45"
            classList={{
              "bg-(--accent)": props.value === option.value,
              "text-white": props.value === option.value,
              "shadow-sm": props.value === option.value,
              "hover:bg-(--accent)": props.value === option.value
            }}
            disabled={option.disabled}
            aria-pressed={props.value === option.value}
            onClick={() => props.onChange(option.value)}
          >
            {option.label}
          </button>
        )}
      </For>
    </div>
  );
}

export function RangeControl(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  const clamp = (value: number) => Math.max(props.min, Math.min(props.max, Math.round(value)));

  return (
    <label class="grid gap-2">
      <div class="flex min-w-0 items-center justify-between gap-3 text-xs">
        <span class="min-w-0 truncate text-[0.585rem] font-semibold tracking-[0.18em] text-(--muted)">{props.label}</span>
        <span class="shrink-0 rounded-lg border border-(--border) bg-white/70 px-2 py-1 font-semibold text-(--foreground)">
          {props.value}
          {props.suffix}
        </span>
      </div>
      <input
        aria-label={props.label}
        class="w-full accent-(--accent)"
        type="range"
        min={props.min}
        max={props.max}
        value={props.value}
        onInput={(event) => props.onChange(clamp(Number(event.currentTarget.value)))}
      />
      <div class="flex justify-between text-[0.65rem] text-(--muted)">
        <span>
          {props.min}
          {props.suffix}
        </span>
        <span>
          {props.max}
          {props.suffix}
        </span>
      </div>
    </label>
  );
}

export function PasswordKeyInput(props: {
  label: string;
  value: string;
  placeholder: string;
  status: string;
  testStatus?: "idle" | "pending" | "ready" | "failed";
  testMessage?: string;
  testMessageId?: string;
  onInput: (value: string) => void;
  onTest: () => void;
}) {
  const [visible, setVisible] = createSignal(false);
  let inputRef: HTMLInputElement | undefined;

  return (
    <div class="grid gap-2">
      <label class="grid gap-1">
        <span class="text-[0.585rem] font-semibold tracking-[0.18em] text-(--muted)">{props.label}</span>
        <div class="flex gap-2">
          <div class="relative min-w-0 flex-1">
            <Input
              ref={inputRef}
              class="pr-10"
              type={visible() ? "text" : "password"}
              value={props.value}
              placeholder={props.placeholder}
              onInput={(event) => props.onInput(event.currentTarget.value)}
            />
            <ActionButton
              tooltip={visible() ? "Hide API key" : "Show API key"}
              ariaLabel={visible() ? `Hide ${props.label}` : `Show ${props.label}`}
              variant="ghost"
              size="icon"
              class="absolute right-1 top-1 h-7 w-7"
              icon={visible() ? <EyeOff class="h-3.5 w-3.5" /> : <Eye class="h-3.5 w-3.5" />}
              onClick={() => {
                setVisible((current) => {
                  const next = !current;
                  if (inputRef) {
                    inputRef.type = next ? "text" : "password";
                  }
                  return next;
                });
              }}
            />
          </div>
          <ActionButton
            tooltip={`Test ${props.label}`}
            disabled={props.testStatus === "pending"}
            disabledReason="Connection test already running."
            variant="secondary"
            onClick={props.onTest}
          >
            Test
          </ActionButton>
        </div>
      </label>
      <div class="flex flex-wrap items-center gap-2 text-[0.7rem]">
        <span
          class="rounded-lg border px-2 py-1"
          classList={{
            "border-teal-200": props.testStatus === "ready",
            "bg-teal-50": props.testStatus === "ready",
            "text-teal-900": props.testStatus === "ready",
            "border-rose-200": props.testStatus === "failed",
            "bg-rose-50": props.testStatus === "failed",
            "text-rose-900": props.testStatus === "failed",
            "border-(--border)": props.testStatus !== "ready" && props.testStatus !== "failed",
            "bg-white/60": props.testStatus !== "ready" && props.testStatus !== "failed",
            "text-(--muted)": props.testStatus !== "ready" && props.testStatus !== "failed"
          }}
        >
          {props.status}
        </span>
        <span data-provider-test-message={props.testMessageId} class="min-w-0 text-(--muted)">
          {props.testMessage}
        </span>
      </div>
    </div>
  );
}

export function AdvancedDisclosure(props: { title: string; description?: string; children: JSX.Element }) {
  const [open, setOpen] = createSignal(false);

  return (
    <section class="rounded-xl border border-(--border) bg-white/45">
      <Button
        tooltip={open() ? "Collapse advanced settings" : "Expand advanced settings"}
        variant="ghost"
        class="flex h-auto w-full justify-between rounded-xl px-4 py-3 text-left"
        aria-expanded={open()}
        onClick={() => setOpen((current) => !current)}
      >
        <span class="min-w-0">
          <span class="block truncate text-[0.585rem] font-semibold tracking-[0.18em] text-(--muted)">{props.title}</span>
          <Show when={props.description}>
            <span class="mt-1 block truncate text-[0.675rem] leading-5 text-(--muted)">{props.description}</span>
          </Show>
        </span>
        <ChevronDown class="h-4 w-4 shrink-0 text-(--muted) transition" classList={{ "rotate-180": open() }} />
      </Button>
      <div class="border-t border-(--border) p-4">{props.children}</div>
    </section>
  );
}
