import { Show, createEffect, createSignal, onCleanup, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { cn } from "../../lib/utils";

type PopoverProps = {
  open: boolean;
  onClose?: () => void;
  children: JSX.Element;
  content: JSX.Element;
  class?: string;
  contentClass?: string;
  align?: "start" | "center" | "end";
  sideOffset?: number;
};

export function Popover(props: PopoverProps) {
  let triggerRef: HTMLDivElement | undefined;
  let contentRef: HTMLDivElement | undefined;
  const [position, setPosition] = createSignal({ top: 0, left: 0 });

  const updatePosition = () => {
    if (!triggerRef || !contentRef) {
      return;
    }

    const triggerRect = triggerRef.getBoundingClientRect();
    const contentRect = contentRef.getBoundingClientRect();
    const viewportPadding = 12;
    const sideOffset = props.sideOffset ?? 8;
    const centeredLeft = triggerRect.left + triggerRect.width / 2 - contentRect.width / 2;
    const alignedLeft =
      props.align === "start"
        ? triggerRect.left
        : props.align === "center"
          ? centeredLeft
          : triggerRect.right - contentRect.width;
    const nextLeft = Math.min(
      window.innerWidth - contentRect.width - viewportPadding,
      Math.max(viewportPadding, alignedLeft)
    );
    const nextTop = Math.min(
      window.innerHeight - contentRect.height - viewportPadding,
      Math.max(viewportPadding, triggerRect.bottom + sideOffset)
    );

    setPosition({
      top: nextTop,
      left: nextLeft
    });
  };

  createEffect(() => {
    if (!props.open) {
      return;
    }

    queueMicrotask(updatePosition);

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!triggerRef?.contains(target) && !contentRef?.contains(target)) {
        props.onClose?.();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        props.onClose?.();
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    onCleanup(() => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    });
  });

  const handleViewportChange = () => {
    if (props.open) {
      updatePosition();
    }
  };

  window.addEventListener("scroll", handleViewportChange, true);
  window.addEventListener("resize", handleViewportChange);
  onCleanup(() => {
    window.removeEventListener("scroll", handleViewportChange, true);
    window.removeEventListener("resize", handleViewportChange);
  });

  const content = (
    <Show when={props.open}>
      <div
        ref={contentRef}
        data-test-popover-content=""
        class={cn(
          "fixed z-[130] w-max rounded-[1.25rem] border border-(--border) bg-(--panel) p-3 shadow-2xl",
          props.contentClass
        )}
        style={{
          top: `${position().top}px`,
          left: `${position().left}px`
        }}
      >
        {props.content}
      </div>
    </Show>
  );

  return (
    <div ref={triggerRef} data-test-popover="" class={cn("relative inline-flex", props.class)}>
      {props.children}
      <Portal>{content}</Portal>
    </div>
  );
}
