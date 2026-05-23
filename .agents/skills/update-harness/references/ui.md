# UI

Use this when touching Solid UI, UI state, primitives, interaction behavior, Tailwind classes, toasts, dialogs, tooltips, buttons, icons, or shared component structure.

## Layout And Composition

- Harness UI should stay tight by default. New chrome must earn its visual footprint in dense workflows.
- Avoid box-inside-box composition. Do not repeat wrapper classes like `rounded-[1.2rem] border border-(--border) bg-white/70 p-4` around nested panes; prefer one visible surface boundary, unframed inner sections, or a shared primitive that owns the surface treatment.
- Do not duplicate status, controls, or summaries across header, chat, trace, and local subpanes unless the duplication removes a real workflow break.
- Prefer compact embedded tab strips, pills, or progressive disclosure over large standalone cockpit cards when exposing secondary panes inside an existing surface.
- Preference section navigation belongs in the left sidepanel surface (`h-full rounded-b-2xl border border-t-0 border-(--border) bg-(--panel)`), not inside the main preference detail panel.
- Prefer `gap-*` for layout spacing. Margin utilities are only for small correctness offsets that cannot be expressed cleanly with container gap or padding.

## Primitives And Reuse

- Prefer shadcn-style Solid components for UI primitives already established in repo.
- If a UI pattern, interaction pattern, or UI-adjacent behavior is likely to be reused, create or extend a shared primitive immediately instead of duplicating markup, classes, or behavior.
- Do not wait for a third copy. First-use is enough when reuse is likely.
- Shared visual behavior belongs in `harness/ui/src/components/primitives/**`.
- Shared higher-level UI behavior belongs in a dedicated wrapper component near the feature or in `components/primitives/**` if broadly reusable.
- Shared compact overlays such as inbox menus, quick replies, and lightweight interaction panels should use a shared popover primitive instead of bespoke absolute-position markup.
- Shared primitives and main reusable containers must expose root `data-test-${component-name}` hooks in kebab-case.
- When behavior is likely to be reused but is not visual, extract a shared helper, hook, or adapter at introduction time rather than duplicating logic.
- Repeated prop pass-through is a smell. Shared commands and shared state should move into Solid store or context instead of being drilled through intermediate components.

## Icons

- Prefer `lucide-solid` for UI icons.
- Use icon-only buttons only when the icon is familiar and the accessible label plus tooltip make the action clear.
- Repeated icon action patterns should become shared derivatives instead of repeated raw button markup.
- Keep icon sizing consistent with the existing primitive or local toolbar density.

## Buttons, Dialogs, And Tooltips

- All modal and dialog surfaces must use the shared `Dialog` primitive.
- Dialogs must keep `title` required, close on `Escape`, and default their content body to `max-height: 80vh` plus `overflow: auto`.
- Dialog call sites should not reimplement shell layout, close behavior, or scroll containment unless a documented exception exists.
- All button-like interactions must use `Button`, `ActionButton`, or a derivative built on top of them.
- Preserve existing shared button interaction rules, including `cursor: pointer`.
- Clickable nav items must explicitly use pointer cursor styling.
- Repeated icon-dismiss actions should become a shared derivative instead of repeated raw button markup.
- Checkbox, switch, and toggle-style controls must use a shared primitive rather than repeated checkbox-plus-label card markup.
- Shared toggle primitives must own consistent label, description, disabled, cursor, and click-target behavior.
- Every `Button` call must pass exactly one of `tooltip` or `justificationForNoTooltip`; prefer `tooltip` unless there is a concrete reason no hover/focus copy should appear.
- Disabled buttons must explain why in tooltip copy.
- Hotkey labels shown in button copy, tooltips, menus, or shortcut hints must use TanStack Hotkeys `formatForDisplay(...)` instead of hardcoded platform text.
- All user-facing hover tooltips must use the shared `Tooltip` primitive or an `ActionButton`/`Button` derivative that owns it. Do not wrap `Button` call sites in `Tooltip`; pass `tooltip` to `Button` instead.
- Do not use native HTML `title` attributes or rely on `aria-label` as a visible tooltip. `aria-label` is for accessibility only.
- When a Tooltip trigger must participate in a flex/truncation chain, pass `triggerClass` such as `flex min-w-0 flex-1` instead of falling back to native `title`.
- Extend the primitive before reintroducing native tooltips.
- Icon-only list actions must use icons plus accessible labels.

## State, Errors, And Inputs

- Solid reactive stores, memos, effects, and computations must be created under component-owned roots or providers.
- Do not create long-lived Solid computations at module scope.
- App-level keyboard shortcuts are durable user preferences. Any shortcut registered with `createHotkeys` must be represented in the app hotkey preferences model and visible in the Keybinds preference section, unless it is intentionally non-user-configurable and documented at the call site.
- All visible timestamp renders, including dialog metadata and copied UI summaries, must use the shared formatter from `harness/ui/src/lib/time-format.ts`; raw ISO strings are for data transport, sorting, and persistence only.
- Keep Tailwind classes in canonical form.
- Prefer official utilities and canonical CSS variable shorthand over arbitrary-value spellings when Tailwind can express the same style directly.
- Treat Tailwind canonical-class diagnostics as part of normal quality bar. Editor hints should stay clean, and lint should enforce the same preference in CI.
- Surface caught UI and command errors through toast notifications.
- When an element has dynamic classes, prefer Solid's `classList` binding over conditional class string assembly.
- Textareas that submit user-authored chat or answers should use Enter to send and Shift+Enter to insert a newline, unless the local surface has a clearly documented conflicting convention.
