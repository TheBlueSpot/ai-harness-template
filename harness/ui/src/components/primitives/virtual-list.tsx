import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show, splitProps, untrack, type JSX } from "solid-js";
import { createVirtualizer, measureElement as measureVirtualElement } from "@tanstack/solid-virtual";
import { recordUiTelemetry } from "../../lib/ui-telemetry";
import { cn } from "../../lib/utils";

export type VirtualListPagination =
  | { kind: "forward"; initialCount?: number; batchSize?: number; thresholdPx?: number }
  | { kind: "reverse"; initialCount?: number; batchSize?: number; thresholdPx?: number }
  | { kind: "all" };

export type VirtualListHandle = {
  scrollToIndex: (index: number, align?: "start" | "center" | "end") => void;
  scrollToKey: (key: string, align?: "start" | "center" | "end") => void;
  scrollToEnd: () => void;
  isNearEnd: () => boolean;
};

export type VirtualListProps<T> = {
  items: readonly T[];
  getKey: (item: T, absoluteIndex: number) => string;
  estimateSize: number | ((item: T) => number);
  pagination: VirtualListPagination;
  overscan?: number;
  class?: string;
  contentClass?: string;
  itemClass?: string;
  dataTest?: string;
  empty?: JSX.Element;
  stickToEnd?: boolean;
  viewportRef?: (element: HTMLDivElement) => void;
  handleRef?: (handle: VirtualListHandle) => void;
  onScroll?: JSX.EventHandler<HTMLDivElement, Event>;
  onStickToEndChange?: (stuck: boolean) => void;
  children: (item: T, absoluteIndex: number) => JSX.Element;
};

const DEFAULT_VISIBLE_COUNT = 80;
const DEFAULT_THRESHOLD_PX = 1000;
const DEFAULT_OVERSCAN = 20;
const NEAR_END_PX = 32;
const PAGINATION_SCROLL_THROTTLE_MS = 50;

type ViewWindow<T> = {
  items: readonly T[];
  absoluteStart: number;
};

type EstimatedVirtualItem = {
  index: number;
  start: number;
  size: number;
};

type VirtualListScrollTargetProps<T> = {
  items: readonly T[];
  getKey: (item: T, absoluteIndex: number) => string;
  key: string;
  pagination: VirtualListPagination;
  loadedCount: number;
  estimateSize: number | ((item: T) => number);
  viewportHeight: number;
  align?: "start" | "center" | "end";
};

export function getVirtualListNextLoadedCount(
  pagination: VirtualListPagination,
  loadedCount: number,
  itemCount: number,
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number
) {
  if (pagination.kind === "all" || loadedCount >= itemCount) {
    return loadedCount;
  }

  const thresholdPx = resolveThresholdPx(pagination);
  if (pagination.kind === "forward" && scrollHeight - scrollTop - clientHeight > thresholdPx) {
    return loadedCount;
  }
  if (pagination.kind === "reverse" && scrollTop > thresholdPx) {
    return loadedCount;
  }

  return Math.min(itemCount, loadedCount + resolveBatchSize(pagination));
}

export function getVirtualListReverseScrollTop(previousScrollTop: number, previousScrollHeight: number, nextScrollHeight: number) {
  return previousScrollTop + Math.max(0, nextScrollHeight - previousScrollHeight);
}

export function getVirtualListStickToEndScrollTop(
  wasNearEnd: boolean,
  currentScrollTop: number,
  totalSize: number,
  viewportHeight: number
) {
  return wasNearEnd ? Math.max(0, totalSize - viewportHeight) : currentScrollTop;
}

export function getVirtualListScrollTarget<T>(props: VirtualListScrollTargetProps<T>) {
  const absoluteIndex = props.items.findIndex((item, index) => props.getKey(item, index) === props.key);
  if (absoluteIndex < 0) {
    return undefined;
  }

  const loadedCount =
    props.pagination.kind === "all"
      ? props.items.length
      : props.pagination.kind === "forward"
        ? Math.max(props.loadedCount, absoluteIndex + 1)
        : Math.max(props.loadedCount, props.items.length - absoluteIndex);
  const windowStart = props.pagination.kind === "reverse" ? Math.max(0, props.items.length - loadedCount) : 0;
  const localIndex = Math.max(0, absoluteIndex - windowStart);
  const offset = estimateVirtualListOffset(props.items.slice(windowStart), props.estimateSize, localIndex);
  const size = estimateVirtualListSize(props.items[absoluteIndex], props.estimateSize);
  const align = props.align ?? "start";
  const scrollTop =
    align === "end"
      ? offset - props.viewportHeight + size
      : align === "center"
        ? offset - Math.max(0, (props.viewportHeight - size) / 2)
        : offset;
  return {
    absoluteIndex,
    loadedCount,
    localIndex,
    scrollTop: Math.max(0, scrollTop)
  };
}

export function VirtualList<T>(props: VirtualListProps<T>) {
  let viewport: HTMLDivElement | undefined;
  const [local, rest] = splitProps(props, [
    "items",
    "getKey",
    "estimateSize",
    "pagination",
    "overscan",
    "class",
    "contentClass",
    "itemClass",
    "dataTest",
    "empty",
    "stickToEnd",
    "viewportRef",
    "handleRef",
    "onScroll",
    "onStickToEndChange",
    "children"
  ]);
  const [loadedCount, setLoadedCount] = createSignal(resolveInitialCount(local.pagination));
  const [lastAnchor, setLastAnchor] = createSignal<ListAnchor>();
  const [stuckToEnd, setStuckToEnd] = createSignal(true);
  const [itemSignature, setItemSignature] = createSignal("");
  const [measurementVersion, setMeasurementVersion] = createSignal(0);
  let viewportObserver: ResizeObserver | undefined;
  let paginationThrottle: number | undefined;
  let pendingPaginationFrame: number | undefined;
  let paginationAbortController: AbortController | undefined;
  const rowObservers = new WeakMap<HTMLDivElement, ResizeObserver>();
  const items = () => props.items;

  const viewWindow = createMemo<ViewWindow<T>>(() => {
    const currentItems = items();
    if (local.pagination.kind === "all") {
      return { items: readWindowItems(currentItems, 0, currentItems.length), absoluteStart: 0 };
    }

    const count = Math.min(currentItems.length, loadedCount());
    if (local.pagination.kind === "reverse") {
      const absoluteStart = Math.max(0, currentItems.length - count);
      return {
        items: readWindowItems(currentItems, absoluteStart, currentItems.length),
        absoluteStart
      };
    }

    return {
      items: readWindowItems(currentItems, 0, count),
      absoluteStart: 0
    };
  });

  const keyIndex = createMemo(() => {
    const index = new Map<string, number>();
    items().forEach((item, absoluteIndex) => {
      index.set(local.getKey(item, absoluteIndex), absoluteIndex);
    });
    return index;
  });

  const virtualizer = createVirtualizer<HTMLDivElement, HTMLDivElement>({
    get count() {
      return viewWindow().items.length;
    },
    getScrollElement: () => viewport ?? null,
    estimateSize: (index) => estimateBaseSizeForIndex(index),
    getItemKey: (index) => {
      const item = viewWindow().items[index];
      const absoluteIndex = viewWindow().absoluteStart + index;
      return item ? local.getKey(item, absoluteIndex) : `virtual-row-${absoluteIndex}`;
    },
    overscan: local.overscan ?? DEFAULT_OVERSCAN,
    gap: 0,
    initialRect: { width: 0, height: 720 },
    initialOffset: () => (local.pagination.kind === "reverse" || local.stickToEnd ? estimateWindowTotalSize() : 0),
    measureElement: (element, entry, instance) => {
      const measuredSize = measureVirtualElement(element, entry, instance);
      return Math.ceil(measuredSize || element.getBoundingClientRect().height || estimateBaseSizeForIndex(instance.indexFromElement(element)));
    }
  });

  const virtualItems = createMemo(() => {
    measurementVersion();
    const items = virtualizer.getVirtualItems();
    if (items.length > 0 || viewWindow().items.length === 0) {
      return items;
    }
    return estimateVisibleVirtualItems();
  });
  createEffect(() => {
    const count = viewWindow().items.length;
    virtualizer.setOptions({
      ...virtualizer.options,
      count
    });
    virtualizer.measure();
    setMeasurementVersion((version) => version + 1);
  });

  const handle: VirtualListHandle = {
    scrollToIndex: (index, align = "start") => {
      recordUiTelemetry("virtual-list.scroll-to-index", {
        dataTest: local.dataTest,
        index,
        align,
        itemCount: items().length,
        loadedCount: loadedCount(),
        absoluteStart: viewWindow().absoluteStart
      });
      ensureIndexLoaded(index);
      setMeasurementVersion((version) => version + 1);
      queueMicrotask(() => {
        queueMicrotask(() => virtualizer.scrollToIndex(Math.max(0, index - viewWindow().absoluteStart), { align }));
      });
    },
    scrollToKey: (key, align = "start") => {
      const index = keyIndex().get(key) ?? -1;
      if (index < 0) {
        return;
      }
      handle.scrollToIndex(index, align);
    },
    scrollToEnd: () => {
      scrollToEnd();
    },
    isNearEnd: () => isNearEnd()
  };

  local.handleRef?.(handle);

  onMount(() => {
    observeViewport();
    if (local.stickToEnd || local.pagination.kind === "reverse") {
      queueMicrotask(scrollToEnd);
    }
  });

  onCleanup(() => {
    if (paginationThrottle !== undefined) {
      window.clearTimeout(paginationThrottle);
    }
    if (pendingPaginationFrame !== undefined) {
      window.cancelAnimationFrame(pendingPaginationFrame);
    }
    paginationAbortController?.abort();
    viewportObserver?.disconnect();
    document.querySelectorAll("[data-test-virtual-list-item]").forEach((element) => {
      rowObservers.get(element as HTMLDivElement)?.disconnect();
    });
  });

  createEffect(() => {
    local.handleRef?.(handle);
  });

  createEffect(() => {
    const currentItems = items();
    const anchor = getListAnchor(currentItems, local.getKey);
    const previous = untrack(lastAnchor);
    if (!anchorsEqual(previous, anchor)) {
      setLastAnchor(anchor);
    }
    if (currentItems.length === 0) {
      setLoadedCount(0);
      return;
    }
    if (!previous) {
      return;
    }

    const currentLoadedCount = loadedCount();
    const initialCount = resolveInitialCount(local.pagination);
    if (local.pagination.kind === "all") {
      setLoadedCount(currentItems.length);
      return;
    }

    if (local.pagination.kind === "reverse" && previous.lastKey && anchor.lastKey !== previous.lastKey) {
      const previousLastIndex = currentItems.findIndex((item, index) => local.getKey(item, index) === previous.lastKey);
      if (previousLastIndex >= 0 && previousLastIndex < currentItems.length - 1) {
        const appendedCount = currentItems.length - previousLastIndex - 1;
        setLoadedCount(Math.min(currentItems.length, currentLoadedCount + appendedCount));
        return;
      }
    }

    if (local.pagination.kind === "forward" && previous.firstKey && anchor.firstKey === previous.firstKey) {
      setLoadedCount(clampLoadedCount(currentItems.length, Math.max(initialCount, currentLoadedCount)));
      return;
    }

    if (local.pagination.kind === "reverse" && previous.lastKey && anchor.lastKey === previous.lastKey) {
      setLoadedCount(clampLoadedCount(currentItems.length, Math.max(initialCount, currentLoadedCount)));
      return;
    }

    setLoadedCount(clampLoadedCount(currentItems.length, initialCount));
  });

  createEffect(() => {
    if (local.pagination.kind === "all") {
      setLoadedCount(items().length);
    } else if (loadedCount() > items().length) {
      setLoadedCount(items().length);
    }
  });

  createEffect(() => {
    itemSignature();
    virtualizer.measure();
  });

  createEffect(() => {
    local.onStickToEndChange?.(stuckToEnd());
  });

  createEffect(() => {
    const currentItems = items();
    const keys = currentItems.map((item, index) => local.getKey(item, index)).join("\n");
    if (keys !== untrack(itemSignature)) {
      recordUiTelemetry("virtual-list.item-signature", {
        dataTest: local.dataTest,
        itemCount: currentItems.length,
        loadedCount: loadedCount(),
        paginationKind: local.pagination.kind
      });
      setItemSignature(keys);
    }
  });

  createEffect(() => {
    const itemCount = items().length;
    const wasStuck = untrack(stuckToEnd);
    if (local.stickToEnd && wasStuck && itemCount > 0) {
      queueMicrotask(scrollToEnd);
    }
  });

  function setViewport(element: HTMLDivElement) {
    viewport = element;
    local.viewportRef?.(element);
    observeViewport();
  }

  function observeViewport() {
    if (!viewport) {
      return;
    }
    const ResizeObserverCtor = globalThis.ResizeObserver;
    if (typeof ResizeObserverCtor !== "undefined") {
      const element = viewport;
      viewportObserver?.disconnect();
      viewportObserver = new ResizeObserverCtor((entries) => {
        entries[0]?.contentRect.width;
        entries[0]?.contentRect.height;
        const wasStuck = stuckToEnd();
        virtualizer.measure();
        setStuckToEnd(isNearEnd());
        if (local.stickToEnd && wasStuck) {
          queueMicrotask(scrollToEnd);
        }
      });
      viewportObserver.observe(element);
    }
  }

  function isNearEnd() {
    if (!viewport) {
      return true;
    }
    return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= NEAR_END_PX;
  }

  function scrollToEnd() {
    queueMicrotask(() => {
      const count = viewWindow().items.length;
      if (viewport && count > 0) {
        viewport.scrollTop = Math.max(0, totalEstimatedSize() - (viewport.clientHeight || 720));
        virtualizer.scrollToIndex(count - 1, { align: "end" });
        setMeasurementVersion((version) => version + 1);
      }
    });
  }

  function ensureIndexLoaded(index: number) {
    if (local.pagination.kind === "all") {
      return;
    }
    if (local.pagination.kind === "forward") {
      setLoadedCount((current) => Math.max(current, index + 1));
      return;
    }
    setLoadedCount((current) => Math.max(current, items().length - index));
  }

  function loadNextPage() {
    const currentItems = items();
    if (!viewport || local.pagination.kind === "all" || loadedCount() >= currentItems.length) {
      return false;
    }

    const batchSize = resolveBatchSize(local.pagination);
    paginationAbortController?.abort();
    const abortController = new AbortController();
    paginationAbortController = abortController;
    if (local.pagination.kind === "forward") {
      setLoadedCount((current) => Math.min(currentItems.length, current + batchSize));
      if (abortController.signal.aborted) {
        return false;
      }
      queueCatchUpPaginationCheck();
      return true;
    }

    const previousScrollHeight = viewport.scrollHeight || virtualizer.getTotalSize();
    const previousScrollTop = viewport.scrollTop;
    setLoadedCount((current) => Math.min(currentItems.length, current + batchSize));
    if (pendingPaginationFrame !== undefined) {
      window.cancelAnimationFrame(pendingPaginationFrame);
    }
    pendingPaginationFrame = window.requestAnimationFrame(() => {
      pendingPaginationFrame = undefined;
      if (!viewport || abortController.signal.aborted) {
        return;
      }
      const nextScrollHeight = viewport.scrollHeight || virtualizer.getTotalSize();
      const nextScrollTop = previousScrollTop + Math.max(0, nextScrollHeight - previousScrollHeight);
      viewport.scrollTop = nextScrollTop;
      virtualizer.scrollToOffset(nextScrollTop);
      setStuckToEnd(isNearEnd());
      setMeasurementVersion((version) => version + 1);
      queueCatchUpPaginationCheck();
    });
    return true;
  }

  function schedulePaginationCheck(immediate = false) {
    if (paginationThrottle !== undefined) {
      window.clearTimeout(paginationThrottle);
      paginationThrottle = undefined;
    }
    if (immediate) {
      runPaginationCheck();
      return;
    }
    paginationThrottle = window.setTimeout(() => {
      paginationThrottle = undefined;
      runPaginationCheck();
    }, PAGINATION_SCROLL_THROTTLE_MS);
  }

  function runPaginationCheck() {
    if (!viewport || !isWithinPaginationThreshold()) {
      return;
    }
    loadNextPage();
  }

  function queueCatchUpPaginationCheck() {
    queueMicrotask(() => {
      if (viewport && isWithinPaginationThreshold()) {
        schedulePaginationCheck(true);
      }
    });
  }

  function isWithinPaginationThreshold() {
    if (!viewport || local.pagination.kind === "all") {
      return false;
    }
    const thresholdPx = resolveThresholdPx(local.pagination);
    if (local.pagination.kind === "forward") {
      return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= thresholdPx;
    }
    return viewport.scrollTop <= thresholdPx;
  }

  function handleScroll(event: Event & { currentTarget: HTMLDivElement; target: Element }) {
    local.onScroll?.(event);
    if (local.pagination.kind !== "all") {
      schedulePaginationCheck();
    }
    if (local.pagination.kind === "forward") {
      const distanceFromEnd = event.currentTarget.scrollHeight - event.currentTarget.scrollTop - event.currentTarget.clientHeight;
      setStuckToEnd(distanceFromEnd <= NEAR_END_PX);
      return;
    }
    setStuckToEnd(isNearEnd());
  }

  function renderVirtualItemFallback(size: number) {
    return (
      <div
        class="w-full animate-pulse rounded-lg bg-black/[0.035]"
        style={{ height: `${Math.max(24, size)}px` }}
        aria-hidden="true"
      />
    );
  }


  function setRowElement(element: HTMLDivElement, index: number) {
    element.setAttribute("data-index", String(index));
    queueMicrotask(() => measureRowElement(element, index));

    const ResizeObserverCtor = globalThis.ResizeObserver;
    if (typeof ResizeObserverCtor === "undefined" || rowObservers.has(element)) {
      return;
    }

    const observer = new ResizeObserverCtor(() => measureRowElement(element, index));
    observer.observe(element);
    rowObservers.set(element, observer);
  }

  function measureRowElement(element: HTMLDivElement, index: number) {
    if (!element.isConnected || index < 0 || index >= viewWindow().items.length) {
      recordUiTelemetry("virtual-list.measure-row-skipped", {
        dataTest: local.dataTest,
        index,
        itemCount: items().length,
        windowItemCount: viewWindow().items.length,
        loadedCount: loadedCount(),
        connected: element.isConnected
      });
      return;
    }

    virtualizer.measureElement(element);
    const measuredSize = Math.ceil(element.getBoundingClientRect().height || element.offsetHeight || estimateBaseSizeForIndex(index));
    recordUiTelemetry("virtual-list.measure-row", {
      dataTest: local.dataTest,
      index,
      measuredSize,
      itemCount: items().length,
      loadedCount: loadedCount()
    });
    virtualizer.resizeItem(index, measuredSize);
    setMeasurementVersion((version) => version + 1);
  }

  function estimateBaseSizeForIndex(index: number) {
    const item = viewWindow().items[index];
    const estimateSize = local.estimateSize;
    if (typeof estimateSize === "number") {
      return estimateSize;
    }
    return item === undefined ? DEFAULT_VISIBLE_COUNT : estimateSize(item);
  }

  function estimateWindowTotalSize() {
    const count = viewWindow().items.length;
    let total = 0;
    for (let index = 0; index < count; index += 1) {
      total += estimateBaseSizeForIndex(index);
    }
    return Math.max(0, total - 720);
  }

  return (
    <div
      {...rest}
      ref={setViewport}
      data-test-scroll-area=""
      data-test-virtual-list={local.dataTest ?? ""}
      class={cn("overflow-auto", local.class)}
      onScroll={handleScroll}
    >
      <Show when={items().length > 0} fallback={local.empty}>
        <div class={cn("relative w-full", local.contentClass)} style={{ height: `${totalContentSize()}px` }}>
          <For each={virtualItems()}>
            {(virtualRow) => {
              const item = () => viewWindow().items[virtualRow.index];
              const absoluteIndex = () => viewWindow().absoluteStart + virtualRow.index;
              return (
                <div
                  ref={(element) => setRowElement(element, virtualRow.index)}
                  data-index={virtualRow.index}
                  data-test-virtual-list-item=""
                  class={cn("absolute left-0 top-0 w-full", local.itemClass)}
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <Show when={item()} keyed fallback={renderVirtualItemFallback(virtualRow.size)}>
                    {(resolvedItem) => local.children(resolvedItem, absoluteIndex())}
                  </Show>
                </div>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );

  function totalContentSize() {
    measurementVersion();
    return getVirtualListContentSize(virtualizer.getTotalSize(), estimateWindowContentSize());
  }

  function totalEstimatedSize() {
    measurementVersion();
    return totalContentSize();
  }

  function estimateVisibleVirtualItems(): EstimatedVirtualItem[] {
    const count = viewWindow().items.length;
    if (count === 0) {
      return [];
    }

    const viewportHeight = viewport?.clientHeight || 720;
    const overscan = local.overscan ?? DEFAULT_OVERSCAN;
    const estimateSize = Math.max(1, estimateAverageSize());
    const scrollOffset = Math.max(0, virtualizer.scrollOffset ?? viewport?.scrollTop ?? 0);
    const visibleStartIndex = Math.floor(scrollOffset / estimateSize);
    const visibleEndIndex = visibleStartIndex + Math.ceil(viewportHeight / estimateSize);
    const startIndex = Math.max(0, visibleStartIndex - overscan);
    const endIndex = Math.min(count - 1, visibleEndIndex + overscan);
    const items: EstimatedVirtualItem[] = [];
    for (let index = startIndex; index <= endIndex; index += 1) {
      items.push({
        index,
        start: estimateOffsetForIndex(index),
        size: estimateBaseSizeForIndex(index)
      });
    }
    return items;
  }

  function estimateAverageSize() {
    const count = viewWindow().items.length;
    if (count === 0) {
      return DEFAULT_VISIBLE_COUNT;
    }
    if (typeof local.estimateSize === "number") {
      return local.estimateSize;
    }
    const sampleCount = Math.min(count, 24);
    let total = 0;
    for (let index = 0; index < sampleCount; index += 1) {
      total += estimateBaseSizeForIndex(index);
    }
    return total / sampleCount;
  }

  function estimateWindowContentSize() {
    const count = viewWindow().items.length;
    let total = 0;
    for (let index = 0; index < count; index += 1) {
      total += estimateBaseSizeForIndex(index);
    }
    return total;
  }

  function estimateOffsetForIndex(index: number) {
    let offset = 0;
    for (let current = 0; current < index; current += 1) {
      offset += estimateBaseSizeForIndex(current);
    }
    return offset;
  }

  function findEstimatedIndexForOffset(offset: number) {
    const count = viewWindow().items.length;
    if (count === 0) {
      return 0;
    }
    let currentOffset = 0;
    for (let index = 0; index < count; index += 1) {
      currentOffset += estimateBaseSizeForIndex(index);
      if (currentOffset >= offset) {
        return index;
      }
    }
    return count - 1;
  }
}

type ListAnchor = {
  firstKey?: string;
  lastKey?: string;
};

function getListAnchor<T>(items: readonly T[], getKey: (item: T, absoluteIndex: number) => string): ListAnchor {
  return {
    firstKey: items[0] ? getKey(items[0], 0) : undefined,
    lastKey: items.length > 0 ? getKey(items[items.length - 1], items.length - 1) : undefined
  };
}

function anchorsEqual(left: ListAnchor | undefined, right: ListAnchor) {
  return left?.firstKey === right.firstKey && left?.lastKey === right.lastKey;
}

function readWindowItems<T>(items: readonly T[], start: number, end: number) {
  const windowItems: T[] = [];
  for (let index = start; index < end; index += 1) {
    const item = items[index];
    if (item !== undefined) {
      windowItems.push(item);
    }
  }
  return windowItems;
}

function resolveInitialCount(pagination: VirtualListPagination) {
  return pagination.kind === "all" ? Number.MAX_SAFE_INTEGER : pagination.initialCount ?? DEFAULT_VISIBLE_COUNT;
}

function clampLoadedCount(itemCount: number, count: number) {
  return Math.min(itemCount, Math.max(0, count));
}

function resolveBatchSize(pagination: Exclude<VirtualListPagination, { kind: "all" }>) {
  return pagination.batchSize ?? pagination.initialCount ?? DEFAULT_VISIBLE_COUNT;
}

function resolveThresholdPx(pagination: VirtualListPagination) {
  return pagination.kind === "all" ? 0 : pagination.thresholdPx ?? DEFAULT_THRESHOLD_PX;
}

export function getVirtualListContentSize(virtualizedSize: number, estimatedSize: number) {
  return virtualizedSize > 0 ? virtualizedSize : estimatedSize;
}

function estimateVirtualListSize<T>(item: T | undefined, estimateSize: number | ((item: T) => number)) {
  if (typeof estimateSize === "number") {
    return estimateSize;
  }
  return item === undefined ? DEFAULT_VISIBLE_COUNT : estimateSize(item);
}

function estimateVirtualListOffset<T>(items: readonly T[], estimateSize: number | ((item: T) => number), index: number) {
  if (typeof estimateSize === "number") {
    return index * estimateSize;
  }
  let offset = 0;
  for (let current = 0; current < index; current += 1) {
    offset += estimateVirtualListSize(items[current], estimateSize);
  }
  return offset;
}
