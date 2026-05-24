---
name: improve-ux
description: Evidence-backed UX improvement workflow for apps, sites, dashboards, tools, games, and dense developer surfaces. Use when Codex is asked to make UI/UX better, polish a screen, combine panels, improve visual hierarchy, affordances, readability, perceived quality, interaction feedback, responsive layout, or post-audit UX implementation, and should update durable UX learnings after the work.
---

# Improve UX

## Goal

Turn a real interface into a clearer, more delightful, more usable one. Prefer observed evidence, product intent, and workflow speed over generic visual taste.

Read `LEARNINGS.md` at the start when it exists, and update it at the end when the work reveals a reusable UX heuristic. Keep this file generic.

## Workflow

1. Build visual ground truth before designing: inspect the running app, screenshots, the user's image, or existing UI tests. If no visual evidence exists, capture it unless the change is trivial.
2. Identify the user's real workflow and the primary state the surface must communicate first.
3. Reduce competing surfaces before adding decoration. Combine panels when they repeat identity, status, source, or run state.
4. Establish hierarchy with position, scale, weight, contrast, and semantic color before relying on copy.
5. Add affordances and signifiers: states, borders, icons, hover/focus feedback, selected markers, disabled reasons, progress, risk, and failure readback.
6. Use depth sparingly. Shadows should have low opacity and enough blur to separate layers without becoming the focal point.
7. Keep dense tools dense but scannable: tight radii, stable row heights, clear state bars or chips, predictable controls, and no nested card stacks.
8. Verify responsive behavior, long content, empty states, loading states, failure states, and keyboard/focus behavior when relevant.
9. Run the narrowest meaningful tests/builds, plus screenshot or browser verification for visual changes.
10. Append one concise durable learning to `LEARNINGS.md` when the work reveals a reusable UX rule, anti-pattern, or acceptance criterion.

## Implementation Lens

- Orientation: Can the user instantly tell where they are, what entity is selected, and why this state matters?
- Priority: Does the eye land first on the most actionable or risky information?
- Readback: Does the UI show what changed, what is blocked, what succeeded, and what to do next?
- Control: Are commands discoverable, enabled/disabled for visible reasons, and placed near the object they affect?
- Density: Is information compressed without becoming same-weight noise?
- Trust: Are errors, risk, automation, and background work summarized before raw logs or long diagnostic text?
- Craft: Do radius, spacing, typography, shadow, and color feel intentional and consistent with the product domain?

## Visual Rules

- Use semantic accents for status: success, warning, danger, info, neutral. Avoid one-note palettes.
- Prefer icon plus label for important commands and familiar icons for compact tool actions.
- Use containers as signifiers, not filler. One strong parent surface is better than multiple similar cards.
- Keep cards at 8px radius or less unless the existing design system requires otherwise.
- Avoid oversized type inside compact panels. Display scale belongs to true page-level heroes.
- Avoid hidden truncation of critical status; truncate names and verbose prompts instead.
- Prefer progressive disclosure for logs, stack traces, raw output, and debug detail.

## Learning Updates

Update `LEARNINGS.md` only with reusable, evidence-backed observations:

- Add learnings under `Reusable Patterns`.
- Put project-specific observations under `Project Findings`.
- Include screenshot paths, test names, or user-provided artifacts when they explain where the learning came from.
- Keep each learning short enough to survive repeated future reads.
- Do not store one-off implementation details, code snippets, or personal preference.

## Output

For implementation work, finish with:

- changed surfaces and UX rationale
- verification commands and screenshot/browser checks
- remaining risks only if they affect user-visible behavior

For plan-only work, finish with:

- target surfaces
- hierarchy and interaction changes
- responsive/accessibility expectations
- acceptance criteria
