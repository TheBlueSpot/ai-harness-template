import { cn } from "../../lib/utils";

export function Separator(props: { class?: string }) {
  return <div class={cn("h-px w-full bg-[color:var(--border)]", props.class)} />;
}
