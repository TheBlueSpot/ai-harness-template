import { splitProps, type JSX } from "solid-js";
import { Dynamic } from "solid-js/web";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";
import { Tooltip } from "./tooltip";

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-xl text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) focus-visible:ring-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45 ring-offset-(--bg)",
  {
    variants: {
      variant: {
        default:
          "bg-(--accent) text-white shadow-sm hover:bg-(--accent-strong)",
        secondary:
          "bg-(--panel-strong) text-(--foreground) border border-(--border) hover:bg-(--panel)",
        ghost: "text-(--foreground) hover:bg-(--panel-strong)",
        danger: "bg-(--danger) text-white hover:bg-(--danger-strong)",
        warning:
          "bg-(--warning) text-(--foreground) shadow-sm hover:bg-(--warning-strong)"
      },
      size: {
        default: "h-9 px-3 py-2",
        sm: "h-8 rounded-lg px-3",
        icon: "h-9 w-9"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

type ButtonTooltipProps =
  | {
      tooltip: string;
      justificationForNoTooltip?: never;
    }
  | {
      tooltip?: never;
      justificationForNoTooltip: string;
    };

type ButtonProps = {
  class?: string;
  as?: "button" | "span";
  tooltipTriggerClass?: string;
} & VariantProps<typeof buttonVariants> &
  JSX.IntrinsicElements["button"] &
  ButtonTooltipProps;

export function Button(props: ButtonProps) {
  const [local, rest] = splitProps(props, [
    "class",
    "as",
    "variant",
    "size",
    "children",
    "tooltip",
    "tooltipTriggerClass",
    "justificationForNoTooltip"
  ]);
  const component = () => local.as ?? "button";

  return (
    <Tooltip content={local.tooltip} triggerClass={local.tooltipTriggerClass}>
      <Dynamic
        component={component()}
        {...rest}
        data-test-button=""
        class={cn(buttonVariants({ variant: local.variant, size: local.size }), local.class)}
        type={local.as === "span" ? undefined : props.type ?? "button"}
      >
        {local.children}
      </Dynamic>
    </Tooltip>
  );
}

export { buttonVariants };
