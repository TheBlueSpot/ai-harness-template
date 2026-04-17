import type { JSX } from "solid-js";
import { cn } from "../../lib/utils";

export function ScrollArea(props: JSX.IntrinsicElements["div"]) {
  return <div {...props} data-test-scroll-area="" class={cn("overflow-auto", props.class)} />;
}
