import { describe, expect, test } from "bun:test";
import { createToastStoreForProvider, type ToastScheduler } from "./toast-store";

type PendingScheduled = {
  callback: () => void;
  delayMs: number;
  cancelled: boolean;
};

function createManualScheduler() {
  const pending: PendingScheduled[] = [];
  const scheduler: ToastScheduler = {
    schedule(callback, delayMs) {
      const entry: PendingScheduled = { callback, delayMs, cancelled: false };
      pending.push(entry);
      return () => {
        entry.cancelled = true;
      };
    }
  };

  return {
    scheduler,
    pending,
    flushNext() {
      const next = pending.shift();
      if (!next) {
        throw new Error("No scheduled callback to flush");
      }
      if (!next.cancelled) {
        next.callback();
      }
    },
    activeCount() {
      return pending.filter((entry) => !entry.cancelled).length;
    }
  };
}

describe("toast store", () => {
  test("auto-dismisses toast after scheduled delay", () => {
    const manual = createManualScheduler();
    const store = createToastStoreForProvider({ scheduler: manual.scheduler, autoDismissMs: 1234 });

    store.push({ title: "Saved" });
    expect(store.toasts.length).toBe(1);
    expect(manual.pending[0]?.delayMs).toBe(1234);

    manual.flushNext();
    expect(store.toasts.length).toBe(0);
    expect(store.pendingTimerCount).toBe(0);
  });

  test("manual dismiss before the timer fires does not throw or double-remove", () => {
    const manual = createManualScheduler();
    const store = createToastStoreForProvider({ scheduler: manual.scheduler });

    store.push({ title: "First" });
    const [{ id }] = store.toasts;
    store.dismiss(id!);
    expect(store.toasts.length).toBe(0);
    expect(manual.activeCount()).toBe(0);

    // Firing the (now cancelled) timer callback is a no-op on the store state.
    manual.flushNext();
    expect(store.toasts.length).toBe(0);
  });

  test("dispose cancels every pending timer and ignores late callbacks", () => {
    const manual = createManualScheduler();
    const store = createToastStoreForProvider({ scheduler: manual.scheduler });

    store.push({ title: "One" });
    store.push({ title: "Two" });
    expect(store.pendingTimerCount).toBe(2);

    store.dispose();
    expect(store.toasts.length).toBe(0);
    expect(store.pendingTimerCount).toBe(0);
    expect(manual.activeCount()).toBe(0);

    // Any pending callback that somehow still runs after dispose must not
    // resurrect toasts or crash on a detached store.
    expect(() => {
      manual.flushNext();
      manual.flushNext();
    }).not.toThrow();
    expect(store.toasts.length).toBe(0);
  });

  test("push after dispose is a no-op so late async work cannot re-populate a torn-down store", () => {
    const manual = createManualScheduler();
    const store = createToastStoreForProvider({ scheduler: manual.scheduler });

    store.dispose();
    store.push({ title: "Late" });
    expect(store.toasts.length).toBe(0);
    expect(manual.activeCount()).toBe(0);
  });

  test("clear removes every toast and cancels pending timers", () => {
    const manual = createManualScheduler();
    const store = createToastStoreForProvider({ scheduler: manual.scheduler });

    store.push({ title: "A" });
    store.push({ title: "B" });
    expect(store.pendingTimerCount).toBe(2);

    store.clear();
    expect(store.toasts.length).toBe(0);
    expect(store.pendingTimerCount).toBe(0);
    expect(manual.activeCount()).toBe(0);
  });
});
