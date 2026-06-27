import { splitProps, type JSX } from "solid-js";
import { cn } from "../../lib/utils";

export type StatusChipTone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

type StatusChipProps = {
  tone?: StatusChipTone;
  dot?: boolean;
  class?: string;
  children: JSX.Element;
} & JSX.HTMLAttributes<HTMLSpanElement>;

export function StatusChip(props: StatusChipProps) {
  const [local, rest] = splitProps(props, ["tone", "dot", "class", "children"]);
  const tone = () => local.tone ?? "neutral";

  return (
    <span
      {...rest}
      data-test-status-chip=""
      class={cn("status-chip", `status-chip-${tone()}`, local.class)}
    >
      {local.dot ? <span class="status-chip-dot" /> : null}
      {local.children}
    </span>
  );
}
