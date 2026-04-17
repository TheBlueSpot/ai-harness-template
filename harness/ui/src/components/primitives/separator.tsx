import { cn } from "../../lib/utils";

export function Separator(props: { class?: string }) {
  return <div data-test-separator="" class={cn("h-px w-full bg-(--border)", props.class)} />;
}
