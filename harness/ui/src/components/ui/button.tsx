import type { JSX } from "solid-js";
import { Dynamic } from "solid-js/web";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-xl text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45 ring-offset-[color:var(--bg)]",
  {
    variants: {
      variant: {
        default:
          "bg-[color:var(--accent)] text-[color:var(--accent-foreground)] shadow-sm hover:bg-[color:var(--accent-strong)]",
        secondary:
          "bg-[color:var(--panel-strong)] text-[color:var(--foreground)] border border-[color:var(--border)] hover:bg-[color:var(--panel)]",
        ghost: "text-[color:var(--foreground)] hover:bg-[color:var(--panel-strong)]",
        danger: "bg-[color:var(--danger)] text-white hover:bg-[color:var(--danger-strong)]"
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

type ButtonProps = {
  class?: string;
  as?: "button" | "span";
} & VariantProps<typeof buttonVariants> &
  JSX.IntrinsicElements["button"];

export function Button(props: ButtonProps) {
  const component = () => props.as ?? "button";

  return (
    <Dynamic
      component={component()}
      class={cn(buttonVariants({ variant: props.variant, size: props.size }), props.class)}
      type={props.as === "span" ? undefined : props.type ?? "button"}
      disabled={props.disabled}
      aria-label={props["aria-label"]}
      onClick={props.onClick}
    >
      {props.children}
    </Dynamic>
  );
}

export { buttonVariants };
