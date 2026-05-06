import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show, splitProps, untrack, type JSX } from "solid-js";
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
const DEFAULT_THRESHOLD_PX = 600;
const DEFAULT_OVERSCAN = 8;
const NEAR_END_PX = 32;

type ViewWindow<T> = {
  items: readonly T[];
  absoluteStart: number;
};

type VirtualRow = {
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
  const [scrollElement, setScrollElement] = createSignal<HTMLDivElement>();
  const [scrollOffset, setScrollOffset] = createSignal(0);
  const [viewportHeight, setViewportHeight] = createSignal(720);
  const [lastAnchor, setLastAnchor] = createSignal<ListAnchor>();
  const [sizeVersion, setSizeVersion] = createSignal(0);
  const measuredSizes = new Map<string, number>();
  const rowObservers = new Map<string, ResizeObserver>();
  const pendingMeasurements = new Map<string, { element: HTMLDivElement; estimatedSize: number }>();
  let measurementFrame: number | undefined;
  let viewportObserver: ResizeObserver | undefined;

  const viewWindow = createMemo<ViewWindow<T>>(() => {
    const items = local.items;
    if (local.pagination.kind === "all") {
      return { items, absoluteStart: 0 };
    }

    const count = Math.min(items.length, loadedCount());
    if (local.pagination.kind === "reverse") {
      const absoluteStart = Math.max(0, items.length - count);
      return {
        items: items.slice(absoluteStart),
        absoluteStart
      };
    }

    return {
      items: items.slice(0, count),
      absoluteStart: 0
    };
  });

  const keyIndex = createMemo(() => {
    const index = new Map<string, number>();
    local.items.forEach((item, absoluteIndex) => {
      index.set(local.getKey(item, absoluteIndex), absoluteIndex);
    });
    return index;
  });

  const totalEstimatedSize = createMemo(() => {
    sizeVersion();
    const count = viewWindow().items.length;
    let total = 0;
    for (let index = 0; index < count; index += 1) {
      total += estimateSizeForIndex(index);
    }
    return total;
  });

  const virtualRows = createMemo<VirtualRow[]>(() => {
    const count = viewWindow().items.length;
    if (count === 0) {
      return [];
    }
    const overscan = local.overscan ?? DEFAULT_OVERSCAN;
    const height = viewportHeight();
    const offset = effectiveScrollOffset(height);
    const startIndex = Math.max(0, findIndexForOffset(offset) - overscan);
    const endIndex = Math.min(count - 1, findIndexForOffset(offset + height) + overscan);
    const rows: VirtualRow[] = [];
    for (let index = startIndex; index <= endIndex; index += 1) {
      rows.push({ index, start: estimateOffsetForIndex(index), size: estimateSizeForIndex(index) });
    }
    return rows;
  });

  const handle: VirtualListHandle = {
    scrollToIndex: (index, align = "start") => {
      ensureIndexLoaded(index);
      const localIndex = Math.max(0, index - viewWindow().absoluteStart);
      const offset = estimateOffsetForIndex(localIndex);
      const size = estimateSizeForIndex(localIndex);
      const height = viewportHeight();
      const nextOffset =
        align === "end" ? offset - height + size : align === "center" ? offset - Math.max(0, (height - size) / 2) : offset;
      const boundedOffset = Math.max(0, nextOffset);
      setScrollOffset(boundedOffset);
      if (viewport) {
        viewport.scrollTop = boundedOffset;
      }
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
    rowObservers.forEach((observer) => observer.disconnect());
    rowObservers.clear();
    viewportObserver?.disconnect();
    if (measurementFrame !== undefined) {
      cancelAnimationFrame(measurementFrame);
    }
  });

  createEffect(() => {
    local.handleRef?.(handle);
  });

  createEffect(() => {
    const anchor = getListAnchor(local.items, local.getKey);
    const previous = untrack(lastAnchor);
    if (!anchorsEqual(previous, anchor)) {
      setLastAnchor(anchor);
    }
    if (!previous) {
      return;
    }

    const currentLoadedCount = loadedCount();
    const initialCount = resolveInitialCount(local.pagination);
    if (local.pagination.kind === "all") {
      setLoadedCount(local.items.length);
      return;
    }

    if (local.pagination.kind === "reverse" && previous.lastKey && anchor.lastKey !== previous.lastKey) {
      const previousLastIndex = local.items.findIndex((item, index) => local.getKey(item, index) === previous.lastKey);
      if (previousLastIndex >= 0 && previousLastIndex < local.items.length - 1) {
        const appendedCount = local.items.length - previousLastIndex - 1;
        setLoadedCount(Math.min(local.items.length, currentLoadedCount + appendedCount));
        return;
      }
    }

    if (local.pagination.kind === "forward" && previous.firstKey && anchor.firstKey === previous.firstKey) {
      setLoadedCount(Math.min(local.items.length, Math.max(initialCount, currentLoadedCount)));
      return;
    }

    if (local.pagination.kind === "reverse" && previous.lastKey && anchor.lastKey === previous.lastKey) {
      setLoadedCount(Math.min(local.items.length, Math.max(initialCount, currentLoadedCount)));
      return;
    }

    setLoadedCount(initialCount);
  });

  createEffect(() => {
    const itemsLength = local.items.length;
    if (local.pagination.kind === "all") {
      setLoadedCount(itemsLength);
    } else if (loadedCount() > itemsLength) {
      setLoadedCount(itemsLength);
    }

    const keys = new Set(local.items.map((item, index) => local.getKey(item, index)));
    let changed = false;
    measuredSizes.forEach((_size, key) => {
      if (!keys.has(key)) {
        measuredSizes.delete(key);
        changed = true;
      }
    });
    rowObservers.forEach((observer, key) => {
      if (!keys.has(key)) {
        observer.disconnect();
        rowObservers.delete(key);
      }
    });
    if (changed) {
      setSizeVersion((version) => version + 1);
    }
  });

  createEffect(() => {
    local.onStickToEndChange?.(isNearEnd());
  });

  createEffect(() => {
    local.items.length;
    if (local.stickToEnd && isNearEnd()) {
      queueMicrotask(scrollToEnd);
    }
  });

  function setViewport(element: HTMLDivElement) {
    viewport = element;
    setScrollElement(element);
    setViewportHeight(element.clientHeight || 720);
    setScrollOffset(element.scrollTop);
    local.viewportRef?.(element);
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
        const nextHeight = Math.ceil(entries[0]?.contentRect.height ?? element.clientHeight);
        setViewportHeight(nextHeight || viewportHeight());
        setScrollOffset(element.scrollTop);
        if (local.stickToEnd && isNearEnd()) {
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
    if (!viewport) {
      return;
    }
    const offset = Math.max(0, totalEstimatedSize() - viewportHeight());
    setScrollOffset(offset);
    viewport.scrollTop = offset;
    queueMicrotask(() => {
      if (viewport) {
        const nextOffset = Math.max(0, totalEstimatedSize() - viewportHeight());
        setScrollOffset(nextOffset);
        viewport.scrollTop = nextOffset;
      }
    });
  }

  function effectiveScrollOffset(height: number) {
    const offset = scrollOffset();
    if (offset > 0 || scrollElement() || (local.pagination.kind !== "reverse" && !local.stickToEnd)) {
      return offset;
    }
    return Math.max(0, totalEstimatedSize() - height);
  }

  function ensureIndexLoaded(index: number) {
    if (local.pagination.kind === "all") {
      return;
    }
    if (local.pagination.kind === "forward") {
      setLoadedCount((current) => Math.max(current, index + 1));
      return;
    }
    setLoadedCount((current) => Math.max(current, local.items.length - index));
  }

  function loadNextPage() {
    if (!viewport || local.pagination.kind === "all" || loadedCount() >= local.items.length) {
      return;
    }

    const batchSize = resolveBatchSize(local.pagination);
    if (local.pagination.kind === "forward") {
      setLoadedCount((current) => Math.min(local.items.length, current + batchSize));
      return;
    }

    const previousScrollHeight = viewport.scrollHeight || totalEstimatedSize();
    const previousScrollTop = viewport.scrollTop;
    setLoadedCount((current) => Math.min(local.items.length, current + batchSize));
    queueMicrotask(() => {
      if (!viewport) {
        return;
      }
      const nextScrollHeight = viewport.scrollHeight || totalEstimatedSize();
      const nextScrollTop = previousScrollTop + Math.max(0, nextScrollHeight - previousScrollHeight);
      viewport.scrollTop = nextScrollTop;
      setScrollOffset(nextScrollTop);
    });
  }

  function handleScroll(event: Event & { currentTarget: HTMLDivElement; target: Element }) {
    local.onScroll?.(event);
    setViewportHeight(event.currentTarget.clientHeight || viewportHeight());
    setScrollOffset(event.currentTarget.scrollTop);
    const thresholdPx = resolveThresholdPx(local.pagination);
    if (local.pagination.kind === "forward") {
      const distanceFromEnd = event.currentTarget.scrollHeight - event.currentTarget.scrollTop - event.currentTarget.clientHeight;
      if (distanceFromEnd <= thresholdPx) {
        loadNextPage();
      }
      local.onStickToEndChange?.(distanceFromEnd <= NEAR_END_PX);
      return;
    }

    if (local.pagination.kind === "reverse" && event.currentTarget.scrollTop <= thresholdPx) {
      loadNextPage();
    }
    local.onStickToEndChange?.(isNearEnd());
  }

  function estimateSizeForIndex(index: number) {
    sizeVersion();
    const item = viewWindow().items[index];
    const absoluteIndex = viewWindow().absoluteStart + index;
    const key = item ? local.getKey(item, absoluteIndex) : undefined;
    const measuredSize = key ? measuredSizes.get(key) : undefined;
    if (measuredSize !== undefined) {
      return measuredSize;
    }
    return estimateBaseSizeForIndex(index);
  }

  function estimateOffsetForIndex(index: number) {
    let offset = 0;
    for (let current = 0; current < index; current += 1) {
      offset += estimateSizeForIndex(current);
    }
    return offset;
  }

  function findIndexForOffset(offset: number) {
    const count = viewWindow().items.length;
    if (count === 0) {
      return 0;
    }
    let currentOffset = 0;
    for (let index = 0; index < count; index += 1) {
      currentOffset += estimateSizeForIndex(index);
      if (currentOffset >= offset) {
        return index;
      }
    }
    return count - 1;
  }

  function setRowElement(element: HTMLDivElement, key: string, baseEstimatedSize: number) {
    queueRowMeasurement(element, key, baseEstimatedSize);
    const ResizeObserverCtor = globalThis.ResizeObserver;
    if (typeof ResizeObserverCtor === "undefined") {
      return;
    }

    rowObservers.get(key)?.disconnect();
    const observer = new ResizeObserverCtor(() => queueRowMeasurement(element, key, baseEstimatedSize));
    observer.observe(element);
    rowObservers.set(key, observer);
  }

  function queueRowMeasurement(element: HTMLDivElement, key: string, estimatedSize: number) {
    pendingMeasurements.set(key, { element, estimatedSize });
    if (measurementFrame !== undefined) {
      return;
    }
    measurementFrame = requestAnimationFrame(() => {
      measurementFrame = undefined;
      let changed = false;
      pendingMeasurements.forEach(({ element: rowElement, estimatedSize: rowEstimatedSize }, rowKey) => {
        changed = measureRowElement(rowElement, rowKey, rowEstimatedSize) || changed;
      });
      pendingMeasurements.clear();
      if (changed) {
        setSizeVersion((version) => version + 1);
      }
    });
  }

  function measureRowElement(element: HTMLDivElement, key: string, estimatedSize: number) {
    const measuredSize = Math.max(estimatedSize, Math.ceil(element.getBoundingClientRect().height || element.offsetHeight || estimatedSize));
    if (measuredSizes.get(key) === measuredSize) {
      return false;
    }
    measuredSizes.set(key, measuredSize);
    return true;
  }

  function estimateBaseSizeForIndex(index: number) {
    const item = viewWindow().items[index];
    const estimateSize = local.estimateSize;
    if (typeof estimateSize === "number") {
      return estimateSize;
    }
    return item === undefined ? DEFAULT_VISIBLE_COUNT : estimateSize(item);
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
      <Show when={local.items.length > 0} fallback={local.empty}>
        <div class={cn("relative w-full", local.contentClass)} style={{ height: `${totalEstimatedSize()}px` }}>
          <For each={virtualRows()}>
            {(virtualRow) => {
              const item = () => viewWindow().items[virtualRow.index];
              const absoluteIndex = () => viewWindow().absoluteStart + virtualRow.index;
              const itemKey = () => {
                const resolvedItem = item();
                return resolvedItem ? local.getKey(resolvedItem, absoluteIndex()) : `virtual-row-${absoluteIndex()}`;
              };
              return (
                <div
                  ref={(element) => setRowElement(element, itemKey(), estimateBaseSizeForIndex(virtualRow.index))}
                  data-index={virtualRow.index}
                  data-test-virtual-list-item=""
                  class={cn("absolute left-0 top-0 w-full", local.itemClass)}
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <Show when={item()}>
                    {(resolvedItem) => local.children(resolvedItem(), absoluteIndex())}
                  </Show>
                </div>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
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

function resolveInitialCount(pagination: VirtualListPagination) {
  return pagination.kind === "all" ? Number.MAX_SAFE_INTEGER : pagination.initialCount ?? DEFAULT_VISIBLE_COUNT;
}

function resolveBatchSize(pagination: Exclude<VirtualListPagination, { kind: "all" }>) {
  return pagination.batchSize ?? pagination.initialCount ?? DEFAULT_VISIBLE_COUNT;
}

function resolveThresholdPx(pagination: VirtualListPagination) {
  return pagination.kind === "all" ? 0 : pagination.thresholdPx ?? DEFAULT_THRESHOLD_PX;
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
