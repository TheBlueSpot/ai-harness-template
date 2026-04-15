import { createEffect, createSignal, onCleanup, Show, type JSX } from "solid-js";
import { Portal } from "solid-js/web";

export function Tooltip(props: { content?: string; children: JSX.Element }) {
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
    const nextTop = Math.max(viewportPadding, triggerRect.top - tooltipRect.height - 10);
    const centeredLeft = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
    const nextLeft = Math.min(
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

  const handleShow = () => {
    if (props.content) {
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
      class="inline-flex"
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
            class="pointer-events-none fixed z-[90] max-w-xs rounded-lg border border-[color:var(--border)] bg-[color:var(--foreground)] px-3 py-1.5 text-center text-xs text-[color:var(--surface-foreground)] shadow-xl"
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
