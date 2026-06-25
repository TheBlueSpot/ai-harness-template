import type { JSX } from "solid-js";
import { cn } from "../../lib/utils";
import { submitOnEnter } from "../../textarea-submit";
import { Textarea } from "./textarea";

type ChatComposerProps = {
  value: string;
  placeholder: string;
  rows?: number | string;
  disabled?: boolean;
  disabledReason?: string;
  onInput: (value: string) => void;
  onSubmit: () => void;
  onKeyDown?: JSX.EventHandlerUnion<HTMLTextAreaElement, KeyboardEvent>;
  onKeyUp?: JSX.EventHandlerUnion<HTMLTextAreaElement, KeyboardEvent>;
  onClick?: JSX.EventHandlerUnion<HTMLTextAreaElement, MouseEvent>;
  onSelect?: JSX.EventHandlerUnion<HTMLTextAreaElement, Event>;
  onFocus?: JSX.EventHandlerUnion<HTMLTextAreaElement, FocusEvent>;
  leftControls?: JSX.Element;
  rightActions?: JSX.Element;
  textareaRef?: (element: HTMLTextAreaElement) => void;
  class?: string;
  textareaClass?: string;
  dataTourId?: string;
  ariaControls?: string;
  ariaExpanded?: boolean;
  ariaActiveDescendant?: string;
};

export function ChatComposer(props: ChatComposerProps) {
  return (
    <div data-test-chat-composer="" data-tour-id={props.dataTourId} class={cn("relative", props.class)}>
      <Textarea
        ref={props.textareaRef}
        rows={props.rows ?? 2}
        value={props.value}
        placeholder={props.placeholder}
        disabled={props.disabled}
        aria-description={props.disabled && props.disabledReason ? props.disabledReason : undefined}
        aria-autocomplete="list"
        attr:aria-controls={props.ariaControls}
        attr:aria-expanded={props.ariaExpanded === undefined ? undefined : props.ariaExpanded ? "true" : "false"}
        attr:aria-activedescendant={props.ariaActiveDescendant}
        class={cn("w-full resize-none rounded-xl pb-12 pr-14", props.textareaClass)}
        onKeyDown={(event) => {
          if (typeof props.onKeyDown === "function") {
            props.onKeyDown(event);
            if (event.defaultPrevented) {
              return;
            }
          }
          submitOnEnter(props.onSubmit)(event);
        }}
        onKeyUp={props.onKeyUp}
        onInput={(event) => props.onInput(event.currentTarget.value)}
        onClick={props.onClick}
        onSelect={props.onSelect}
        onFocus={props.onFocus}
      />
      <div class="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1.5">{props.rightActions}</div>
      <div class="absolute bottom-2 left-2">{props.leftControls}</div>
    </div>
  );
}
