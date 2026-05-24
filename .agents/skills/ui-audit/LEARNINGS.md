# UI Audit Learnings

## Reusable Patterns

- Always capture the app's actual current state before judging polish. Dense tools often look reasonable in code but reveal hierarchy and overflow issues only in screenshots.
- Trace, log, and debug panels should be easy to open, but they should not compete with the main user workflow by default.
- Raw failures need a human-readable summary before stack traces, command output, or long diagnostic text.
- Mobile audits must include drawers or sheets, not only the main route. Navigation shells often fail on touch layouts before content itself fails.
- Repeated cards benefit from tight radius, stable row heights, and strong state markers. Large rounded nested cards make dense tools feel soft and hard to scan.
- "Magic" usually comes from orientation and readback: show where the user is, what changed, what is blocked, and what the next useful action is.

## Project Findings

- Recent scan artifacts: `.local/screenshots/deep-ux-cdp-1779575951704`.
- The scanned app has strong operational depth, but hierarchy is weakened when many panels, cards, and trace rows use similar visual weight.
- Mobile workspace navigation needs explicit scrutiny because sheet content can look clipped or underfilled while the main content still renders.
- Developer trace surfaces are valuable but can dominate the product feel when always visible beside primary workflows.
- Jobs and runs benefit from a top-level digest that explains attention, risk, next run, and failure state before showing detailed logs.
- Creation dialogs should be reviewed as guided setup flows, not just forms with many controls.

## Evidence Links

- Desktop surface captures live under `.local/screenshots/deep-ux-cdp-1779575951704/desktop-*.png`.
- Mobile surface captures live under `.local/screenshots/deep-ux-cdp-1779575951704/mobile-*.png`.
- Scan metadata and click notes live at `.local/screenshots/deep-ux-cdp-1779575951704/scan-result.json`.

## Follow-Up Prompts

- "Use ui-audit to scan this app and write a holistic UX analysis doc."
- "Use ui-audit to capture every tab, menu, dialog, and mobile sheet, then produce a P0-P3 findings list."
- "Use ui-audit to turn these screenshots into a high-fidelity polish plan with acceptance criteria."
- "Use ui-audit to re-scan after the UI polish pass and compare before/after screenshots."
