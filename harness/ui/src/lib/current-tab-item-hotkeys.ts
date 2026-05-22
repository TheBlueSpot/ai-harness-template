import type { HarnessLeftTab } from "../harness-store";

export type CurrentTabItemSelector = (index: number) => boolean;

const selectors = new Map<HarnessLeftTab, CurrentTabItemSelector[]>();

export function registerCurrentTabItemSelector(tab: HarnessLeftTab, selector: CurrentTabItemSelector) {
  const tabSelectors = selectors.get(tab) ?? [];
  tabSelectors.push(selector);
  selectors.set(tab, tabSelectors);

  return () => {
    const current = selectors.get(tab);
    if (!current) {
      return;
    }
    const next = current.filter((entry) => entry !== selector);
    if (next.length > 0) {
      selectors.set(tab, next);
    } else {
      selectors.delete(tab);
    }
  };
}

export function selectCurrentTabItem(tab: HarnessLeftTab, index: number) {
  const tabSelectors = selectors.get(tab) ?? [];
  for (let offset = tabSelectors.length - 1; offset >= 0; offset -= 1) {
    if (tabSelectors[offset]?.(index)) {
      return true;
    }
  }
  return false;
}

export function clearCurrentTabItemSelectorsForTests() {
  selectors.clear();
}
