import { createEffect, createSignal, onCleanup, Show, type JSX } from "solid-js";
import { Portal } from "solid-js/web";

type TooltipProps = {
  content?: string;
  triggerClass?: string;
  children: JSX.Element;
  side?: "top" | "right" | "bottom" | "left";
  disabled?: boolean;
};

export function Tooltip(props: TooltipProps) {
  let triggerRef: HTMLSpanElement | undefined;
  let tooltipRef: HTMLSpanElement | undefined;
  const [open, setOpen] = createSignal(false);
  const [position, setPosition] = createSignal({ top: 0, left: 0 });

  const updatePosition = () => {
    if (!triggerRef || !tooltipRef || !props.content) {
      return;
    }

    const triggerRect = triggerRef.getBoundingClientRect();
    const tooltipRect = tooltipRef.getBoundingClientRect();
    const viewportPadding = 12;
    const sideOffset = 10;
    const centeredLeft = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
    const centeredTop = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
    const fitsRight = triggerRect.right + sideOffset + tooltipRect.width <= window.innerWidth - viewportPadding;
    const fitsLeft = triggerRect.left - sideOffset - tooltipRect.width >= viewportPadding;
    const fitsBottom = triggerRect.bottom + sideOffset + tooltipRect.height <= window.innerHeight - viewportPadding;
    const preferredSide = props.side ?? "top";
    const resolvedSide =
      preferredSide === "right"
        ? fitsRight || !fitsLeft
          ? "right"
          : "left"
        : preferredSide === "left"
          ? fitsLeft || !fitsRight
            ? "left"
            : "right"
          : preferredSide === "bottom"
            ? fitsBottom
              ? "bottom"
              : "top"
            : "top";
    const nextTop =
      resolvedSide === "right" || resolvedSide === "left"
        ? Math.min(
            window.innerHeight - tooltipRect.height - viewportPadding,
            Math.max(viewportPadding, centeredTop)
          )
        : resolvedSide === "bottom"
          ? Math.min(
              window.innerHeight - tooltipRect.height - viewportPadding,
              Math.max(viewportPadding, triggerRect.bottom + sideOffset)
            )
          : Math.max(viewportPadding, triggerRect.top - tooltipRect.height - sideOffset);
    const nextLeft =
      resolvedSide === "right"
        ? Math.min(
            window.innerWidth - tooltipRect.width - viewportPadding,
            Math.max(viewportPadding, triggerRect.right + sideOffset)
          )
        : resolvedSide === "left"
          ? Math.min(
              window.innerWidth - tooltipRect.width - viewportPadding,
              Math.max(viewportPadding, triggerRect.left - tooltipRect.width - sideOffset)
            )
          : Math.min(
              window.innerWidth - tooltipRect.width - viewportPadding,
              Math.max(viewportPadding, centeredLeft)
            );

    setPosition({
      top: nextTop,
      left: nextLeft
    });
  };

  createEffect(() => {
    if (!open()) {
      return;
    }

    queueMicrotask(updatePosition);
  });

  createEffect(() => {
    if (props.disabled && open()) {
      setOpen(false);
    }
  });

  const handleShow = () => {
    if (props.content && !props.disabled) {
      setOpen(true);
    }
  };

  const handleHide = () => {
    setOpen(false);
  };

  const onViewportChange = () => {
    if (open()) {
      updatePosition();
    }
  };

  window.addEventListener("scroll", onViewportChange, true);
  window.addEventListener("resize", onViewportChange);
  onCleanup(() => {
    window.removeEventListener("scroll", onViewportChange, true);
    window.removeEventListener("resize", onViewportChange);
  });

  return (
    <span
      ref={triggerRef}
      data-test-tooltip=""
      class={props.triggerClass ?? "inline-flex"}
      onMouseEnter={handleShow}
      onMouseLeave={handleHide}
      onFocusIn={handleShow}
      onFocusOut={handleHide}
    >
      {props.children}
      <Portal>
        <Show when={props.content && open()}>
          <span
            ref={tooltipRef}
            data-test-tooltip-content=""
            class="pointer-events-none fixed z-[160] max-w-xs whitespace-pre-line rounded-lg border border-(--border) bg-(--foreground) px-3 py-1.5 text-center text-xs text-(--surface-foreground) shadow-xl"
            style={{
              top: `${position().top}px`,
              left: `${position().left}px`
            }}
          >
            {props.content}
          </span>
        </Show>
      </Portal>
    </span>
  );
}
