/** @jsxImportSource solid-js */
import type { JSX } from "solid-js";
import { Button, type buttonVariants } from "./primitives/button";

type ActionButtonProps = {
  tooltip: string;
  disabledReason?: string;
  icon?: JSX.Element;
  children?: JSX.Element;
  class?: string;
  classList?: Record<string, boolean | undefined>;
  wrapperClass?: string;
  ariaLabel?: string;
  type?: "button" | "submit";
  variant?: NonNullable<Parameters<typeof buttonVariants>[0]>["variant"];
  size?: NonNullable<Parameters<typeof buttonVariants>[0]>["size"];
  disabled?: boolean;
  dataTourId?: string;
  onClick?: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent>;
};

export function ActionButton(props: ActionButtonProps) {
  const tooltipText = () => (props.disabled && props.disabledReason ? props.disabledReason : props.tooltip);

  return (
    <Button
      class={props.class}
      classList={props.classList}
      tooltip={tooltipText()}
      tooltipTriggerClass={props.wrapperClass}
      type={props.type}
      variant={props.variant}
      size={props.size}
      disabled={props.disabled}
      data-tour-id={props.dataTourId}
      aria-label={props.ariaLabel ?? props.tooltip}
      aria-description={props.disabled && props.disabledReason ? props.disabledReason : undefined}
      onClick={props.onClick}
    >
      {props.icon}
      {props.children}
    </Button>
  );
}
