# Virtual List Implementation Notes

## Current Goal

Stabilize virtualized chat and sidebar rows across streaming content, window-width changes, and browser zoom changes.

## Findings

- The same primitive drives project chat, project sidebar, trace panes, and log-like lists.
- The visible symptom appears in both chat and sidebar lists, which points to shared measurement behavior.
- When the viewport gets narrower or zoomed in, text wraps onto more lines and rows need larger measured heights.
- When the viewport gets wider or zoomed out, old large row heights can remain visible as blank allocation.
- Red debug boundaries are sometimes hard to see because the visible child content can paint beyond the row wrapper that owns the debug outline.
- Browser geometry confirms visible row wrappers can be much taller than the virtual row size used for the next row offset.
- Overlap is caused by the next row using stale virtual start positions, not by the child content failing normal layout inside its own wrapper.

## Working Hypotheses

- Row measurement must be tied to row identity, not only local index.
- A width or zoom reflow must invalidate measured heights even if the item list did not change.
- Measuring only after ResizeObserver callbacks may be too late for streaming rows that update content rapidly.
- The scroll canvas must use live virtualizer totals after measured sizes are refreshed, not stale estimates.
- The primitive needs an explicit post-render measurement pass for visible rows, because relying on ResizeObserver alone leaves virtual offsets stale in the failing state.
- Concrete failure path: size cache invalidation and local "unchanged" suppression can disagree. After a cache reset, the primitive may skip sending a still-current measured height back to the virtualizer, so offsets fall back to estimates.

## Fix Direction

- Let the virtualizer receive measured sizes after every observed row measurement; it already ignores no-op updates internally.
- Keep any local measurement memory only as diagnostic context, not as a gate that prevents `resizeItem`.
- After viewport resize or row-signature invalidation, queue a visible-row measurement pass so unchanged DOM heights repopulate the virtualizer cache.

## Confirmed Fix

- The row measurement decision now compares the last DOM measurement with the current virtual row size.
- If TanStack has reverted to an estimate, the same DOM measurement is sent again instead of being suppressed.
- Mounted rows are remeasured after virtualizer cache resets caused by viewport changes and item signature changes.
- Viewport mount and resize now queue a browser-frame measurement pass, then immediately remeasure mounted rows and restore reverse/sticky anchoring before first paint can stay blank.

## Manual Validation

- Static browser geometry at 1920, 3840, and 1280 widths showed no visible chat/sidebar row overlap after the fix.
- A browser-backed smoke mounts delayed-height reverse and forward virtual lists, checks visible row geometry before any tab remount, then switches tabs and checks the same anchors again.
- Desktop and mobile screenshots showed row outlines aligned with visible row bounds.
- Synthetic streaming growth appended 12 chunks into an already-mounted chat row; the row's virtual size increased from 137 to 713 and following rows kept non-overlapping offsets.
- A real UI send was attempted, but the run failed before model streaming with an unrelated `paths[0]` error. The failure row itself did not overlap.

## Validation Plan

- Compare each wrapper rectangle to its visible child rectangle.
- Confirm every visible child bottom is at or above the next wrapper top.
- Repeat at wide, narrow, zoomed-in, and zoomed-out layouts.
- Verify streaming-like text growth changes measured size before the next row can overlap it.
