# UI Audit Rubric

Use this rubric after screenshots are captured and inspected. Score with evidence, not taste alone.

## Core Questions

- **First impression:** Can a new user tell what this product is, where they are, and what to do next within a few seconds?
- **Information architecture:** Are pages, tabs, panels, and actions organized around user goals instead of implementation structure?
- **Visual hierarchy:** Does the eye land on the most important state, task, or next action first?
- **Density and scan speed:** Is the interface dense where it needs to be, but still readable under repeated use?
- **Wayfinding:** Can users recover their location, active object, active filters, and current mode cheaply?
- **Status readback:** Does the UI explain what happened, what is happening, what is blocked, and what changed?
- **Progressive disclosure:** Are raw logs, traces, advanced settings, and destructive controls available without overwhelming primary workflows?
- **Recovery:** Are errors summarized, actionable, and easy to inspect when deeper detail matters?
- **Responsive behavior:** Does mobile/tablet preserve core workflows without clipping, overlap, hidden actions, or excessive vertical chrome?
- **Accessibility basics:** Are focus, contrast, labels, keyboard dismissal, disabled states, and touch targets usable?
- **Motion and feedback:** Do transitions, loading indicators, hover/focus states, and success/error feedback increase confidence without distraction?
- **Design-system consistency:** Do buttons, cards, panels, dialogs, tabs, menus, and form controls share predictable structure and tone?

## "Magic" Heuristics

Magic is not decoration. Score it by:

- fast orientation: current object, mode, and next action are obvious
- confident control: actions feel predictable, reversible when possible, and clearly scoped
- visible intelligence: summaries, grouping, prioritization, and recommendations reduce cognitive load
- graceful recovery: failures produce next steps, not raw dumps first
- refined craft: spacing, typography, icon use, color, and motion feel intentional

## Polish Rules

- Prefer real screenshots and actual app state over static code reading.
- Avoid one-note palettes; use semantic color for state, priority, and action.
- Keep repeated item cards compact. Use 8px radius unless the existing design system demands otherwise.
- Avoid cards inside cards unless the nested element is a true list item, modal, or tool frame.
- Prefer recognizable icons for common commands, with labels or tooltips where ambiguity remains.
- Keep raw traces, logs, and diagnostics inspectable but secondary to human-readable summaries.
- Prevent text overlap, horizontal overflow, clipped sheets, clipped dialogs, and hidden primary actions.
- Verify desktop and mobile after any proposed UI change.

## Severity Guide

- **P0:** Broken or blocked workflow, unusable mobile state, clipped required content, inaccessible critical action.
- **P1:** Major loss of clarity, trust, hierarchy, or speed in a core workflow.
- **P2:** Noticeable polish issue, inconsistent component behavior, weak empty/error/readback state.
- **P3:** Small refinement, copy tightening, spacing adjustment, optional delight.
