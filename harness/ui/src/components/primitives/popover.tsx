import { Show, createEffect, createSignal, onCleanup, type JSX } from "solid-js";
import { cn } from "../../lib/utils";
import { PrimitivePortal } from "./primitive-portal";
import { isTopOverlay, registerOverlay } from "./overlay-stack";

type PopoverProps = {
  open: boolean;
  onClose?: () => void;
  children: JSX.Element;
  content: JSX.Element;
  class?: string;
  contentClass?: string;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
};

export function Popover(props: PopoverProps) {
  let triggerRef: HTMLDivElement | undefined;
  let contentRef: HTMLDivElement | undefined;
  const overlayId = `popover-${Math.random().toString(36).slice(2)}`;
  const [position, setPosition] = createSignal({
    top: 0,
    left: 0,
    triggerWidth: 0,
    triggerHeight: 0
  });

  const updatePosition = () => {
    if (!triggerRef || !contentRef) {
      return;
    }

    const triggerRect = triggerRef.getBoundingClientRect();
    const contentRect = contentRef.getBoundingClientRect();
    const viewportPadding = 12;
    const sideOffset = props.sideOffset ?? 8;
    const preferredSide = props.side ?? "bottom";
    const spaceAbove = triggerRect.top - viewportPadding;
    const spaceBelow = window.innerHeight - triggerRect.bottom - viewportPadding;
    const spaceRight = window.innerWidth - triggerRect.right - viewportPadding;
    const spaceLeft = triggerRect.left - viewportPadding;
    const contentFitsAbove = contentRect.height + sideOffset <= spaceAbove;
    const contentFitsBelow = contentRect.height + sideOffset <= spaceBelow;
    const contentFitsRight = contentRect.width + sideOffset <= spaceRight;
    const contentFitsLeft = contentRect.width + sideOffset <= spaceLeft;
    const resolvedSide =
      preferredSide === "top"
        ? contentFitsAbove || (!contentFitsBelow && spaceAbove >= spaceBelow)
          ? "top"
          : "bottom"
        : preferredSide === "right"
          ? contentFitsRight || (!contentFitsLeft && spaceRight >= spaceLeft)
            ? "right"
            : "left"
          : preferredSide === "left"
            ? contentFitsLeft || (!contentFitsRight && spaceLeft >= spaceRight)
              ? "left"
              : "right"
            : contentFitsBelow || (!contentFitsAbove && spaceBelow >= spaceAbove)
              ? "bottom"
              : "top";
    const centeredLeft = triggerRect.left + triggerRect.width / 2 - contentRect.width / 2;
    const centeredTop = triggerRect.top + triggerRect.height / 2 - contentRect.height / 2;
    const alignedLeft =
      props.align === "start"
        ? triggerRect.left
        : props.align === "center"
          ? centeredLeft
          : triggerRect.right - contentRect.width;
    const alignedTop =
      props.align === "start"
        ? triggerRect.top
        : props.align === "center"
          ? centeredTop
          : triggerRect.bottom - contentRect.height;
    const rawLeft =
      resolvedSide === "right"
        ? triggerRect.right + sideOffset
        : resolvedSide === "left"
          ? triggerRect.left - contentRect.width - sideOffset
          : alignedLeft;
    const nextLeft = Math.min(
      window.innerWidth - contentRect.width - viewportPadding,
      Math.max(viewportPadding, rawLeft)
    );
    const rawTop =
      resolvedSide === "top"
        ? triggerRect.top - contentRect.height - sideOffset
        : resolvedSide === "bottom"
          ? triggerRect.bottom + sideOffset
          : alignedTop;
    const nextTop = Math.min(
      window.innerHeight - contentRect.height - viewportPadding,
      Math.max(viewportPadding, rawTop)
    );

    setPosition({
      top: nextTop,
      left: nextLeft,
      triggerWidth: triggerRect.width,
      triggerHeight: triggerRect.height
    });
  };

  createEffect(() => {
    if (!props.open) {
      return;
    }
    const unregister = registerOverlay(overlayId, { onEscape: () => props.onClose?.() });

    queueMicrotask(updatePosition);

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const targetElement = target instanceof Element ? target : undefined;
      if (
        !triggerRef?.contains(target) &&
        !contentRef?.contains(target) &&
        !targetElement?.closest("[data-test-popover-content]")
      ) {
        props.onClose?.();
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    onCleanup(() => {
      unregister();
      window.removeEventListener("mousedown", handlePointerDown);
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
          "app-zoom-portal-content fixed z-[130] w-max rounded-[1.25rem] border border-(--border) bg-(--panel) p-3 shadow-2xl",
          props.contentClass
        )}
        style={{
          top: `${position().top}px`,
          left: `${position().left}px`,
          "--popover-trigger-width": `${position().triggerWidth}px`,
          "--popover-trigger-height": `${position().triggerHeight}px`
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && isTopOverlay(overlayId)) {
            event.preventDefault();
            event.stopPropagation();
            props.onClose?.();
          }
        }}
      >
        {props.content}
      </div>
    </Show>
  );

  return (
    <div ref={triggerRef} data-test-popover="" class={cn("relative inline-flex", props.class)}>
      {props.children}
      <PrimitivePortal active={props.open} layer="popover">
        {content}
      </PrimitivePortal>
    </div>
  );
}
