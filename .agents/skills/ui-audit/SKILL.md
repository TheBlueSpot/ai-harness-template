---
name: ui-audit
description: Deep screenshot-backed UI/UX audit workflow for apps, sites, dashboards, tools, games, and harness interfaces. Use when Codex needs to deeply scan an interface, screenshot pages, tabs, menus, dialogs, drawers, trace or debug panels, inspect visual quality, evaluate polish or "magic", create a holistic UX analysis doc, or produce a high-fidelity UX polish plan.
---

# UI Audit

## Goal

Audit the real interface, not an imagined one. Build visual ground truth first, inspect screenshots before judging, then produce evidence-backed findings and a concrete polish plan.

Keep this skill generic. Put project-specific findings and durable observations in `LEARNINGS.md`, not in these instructions.

## Workflow

1. Discover how the app runs and how screenshots are captured. Prefer repo scripts, docs, package metadata, and existing test helpers before inventing browser commands.
2. Start or connect to the app without changing repo-tracked files unless the user asked for implementation work.
3. Enumerate the surface map: routes, primary tabs, secondary tabs, drawers, sheets, dialogs, popovers, menus, trace/debug panels, empty states, loading states, error states, success states, and long-content states.
4. Capture desktop and mobile screenshots unless the user narrows scope. Add tablet when responsive layout is a meaningful risk.
5. Open interactive surfaces before capture: navigation tabs, filters, sort menus, creation/edit dialogs, help/tutorial overlays, notification inboxes, trace panels, and developer/debug menus.
6. Read each screenshot before diagnosing. Use image inspection, visible text, and DOM text snapshots when useful.
7. Inspect UI code only after visual ground truth, and only to explain causes or make an implementation-ready plan.
8. Separate observed evidence from inference. Do not claim a defect unless the screenshot, DOM, console, or code supports it.
9. Rate findings by severity:
   - P0: broken, blocked, unusable, inaccessible, or content clipped.
   - P1: major UX/polish issue that harms core workflow speed, trust, or clarity.
   - P2: quality issue that makes the product feel less refined.
   - P3: small polish or enhancement.
10. If writing docs, keep code references minimal and focus on product, UX, and workflow concepts.

## Evidence Checklist

Capture or explicitly note coverage for:

- desktop, mobile, and any requested viewport
- first screen and primary navigation
- every top-level page or tab
- important secondary tabs and segmented views
- sidebars, sheets, drawers, and responsive nav
- dialogs, modals, popovers, menus, and tooltips
- trace, debug, logs, developer panels, and raw-output areas
- empty, loading, success, warning, and error states
- long lists, overflow, scroll regions, and dense content
- form validation, destructive actions, and disabled states
- keyboard focus, escape behavior, and visible focus rings when relevant
- console errors and browser warnings when available

## Audit Rubric

Read `references/ui-audit-rubric.md` when preparing findings or a polish plan. Use it as the scoring lens, not as a rigid template.

## Output Contract

For a scan or audit, include:

- artifact path for screenshots and trace notes
- surface coverage summary
- findings first, sorted by severity
- evidence links or screenshot filenames for each important finding
- clear distinction between observed evidence and inferred cause
- residual unknowns or states not captured

For a holistic analysis doc, include:

- scan scope and date
- product/experience thesis
- surface-by-surface notes
- severity-ranked gaps
- accessibility and responsive notes
- high-level UX principles for the product
- implementation-ready polish roadmap

For a high-fidelity polish plan, specify:

- exact surfaces to change
- visual treatment and interaction behavior
- information hierarchy and content changes
- responsive/mobile behavior
- accessibility expectations
- tests and screenshot verification
- acceptance criteria that leave no design decisions open

## Writing Standards

- Be direct and evidence-backed.
- Avoid vague praise or taste-only critique.
- Prefer concrete UI language: hierarchy, contrast, density, affordance, feedback, wayfinding, recovery, latency, focus, overflow.
- Treat "magic" as instant orientation, confident control, visible system intelligence, graceful recovery, and small moments of delight.
- Do not overfit the skill to one app, stack, palette, or domain.
