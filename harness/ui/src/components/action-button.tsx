import type { JSX } from "solid-js";
import { Button, type buttonVariants } from "./ui/button";
import { Tooltip } from "./ui/tooltip";

type ActionButtonProps = {
  tooltip: string;
  disabledReason?: string;
  icon?: JSX.Element;
  children?: JSX.Element;
  class?: string;
  ariaLabel?: string;
  type?: "button" | "submit";
  variant?: NonNullable<Parameters<typeof buttonVariants>[0]>["variant"];
  size?: NonNullable<Parameters<typeof buttonVariants>[0]>["size"];
  disabled?: boolean;
  onClick?: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent>;
};

export function ActionButton(props: ActionButtonProps) {
  const tooltipText = () => (props.disabled && props.disabledReason ? props.disabledReason : props.tooltip);

  return (
    <Tooltip content={tooltipText()}>
      <span class="inline-flex">
        <Button
          class={props.class}
          type={props.type}
          variant={props.variant}
          size={props.size}
          disabled={props.disabled}
          aria-label={props.ariaLabel ?? props.tooltip}
          onClick={props.onClick}
        >
          {props.icon}
          {props.children}
        </Button>
      </span>
    </Tooltip>
  );
}
