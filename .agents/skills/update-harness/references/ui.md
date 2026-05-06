# UI

Use this when touching Solid UI, UI state, primitives, interaction behavior, Tailwind classes, toasts, dialogs, tooltips, buttons, icons, or shared component structure.

## Layout And Composition

- Harness UI should stay tight by default. New chrome must earn its visual footprint in dense workflows.
- Avoid box-inside-box composition. Do not repeat wrapper classes like `rounded-[1.2rem] border border-(--border) bg-white/70 p-4` around nested panes; prefer one visible surface boundary, unframed inner sections, or a shared primitive that owns the surface treatment.
- Do not duplicate status, controls, or summaries across header, chat, trace, and local subpanes unless the duplication removes a real workflow break.
- Prefer compact embedded tab strips, pills, or progressive disclosure over large standalone cockpit cards when exposing secondary panes inside an existing surface.
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
- Repeated icon-dismiss actions should become a shared derivative instead of repeated raw button markup.
- Checkbox, switch, and toggle-style controls must use a shared primitive rather than repeated checkbox-plus-label card markup.
- Shared toggle primitives must own consistent label, description, disabled, cursor, and click-target behavior.
- Every button must have tooltip copy.
- Disabled buttons must explain why in tooltip copy.
- All user-facing hover tooltips must use the shared `Tooltip` primitive or an `ActionButton`/`Button` derivative that wraps it.
- Do not use native HTML `title` attributes or rely on `aria-label` as a visible tooltip. `aria-label` is for accessibility only.
- When a Tooltip trigger must participate in a flex/truncation chain, pass `triggerClass` such as `flex min-w-0 flex-1` instead of falling back to native `title`.
- Extend the primitive before reintroducing native tooltips.
- Icon-only list actions must use icons plus accessible labels.

## State, Errors, And Inputs

- Solid reactive stores, memos, effects, and computations must be created under component-owned roots or providers.
- Do not create long-lived Solid computations at module scope.
- Keep Tailwind classes in canonical form.
- Prefer official utilities and canonical CSS variable shorthand over arbitrary-value spellings when Tailwind can express the same style directly.
- Treat Tailwind canonical-class diagnostics as part of normal quality bar. Editor hints should stay clean, and lint should enforce the same preference in CI.
- Surface caught UI and command errors through toast notifications.
- Textareas that submit user-authored chat or answers should use Enter to send and Shift+Enter to insert a newline, unless the local surface has a clearly documented conflicting convention.
