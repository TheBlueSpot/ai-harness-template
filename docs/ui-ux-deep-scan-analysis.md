# UI/UX Deep Scan Analysis

## Scan Scope

Date: May 23, 2026

App URL scanned: `http://127.0.0.1:8787/`

Screenshot artifacts: `.local/screenshots/deep-ux-cdp-1779575951704`

Surfaces covered:

- Projects
- Assistants
- Jobs
- Runs
- Settings
- Trace panel
- Help dialog
- Project sort menu
- Assistant creation dialog
- Job creation dialog
- Mobile header
- Mobile workspace sheet
- Mobile tab states

## Experience Thesis

Target feel: magical operator workbench.

Magic means instant orientation, confident control, progressive reveal, and visible system intelligence. The app should keep its dense, trace-rich power-user posture, but make the system state easier to read before exposing raw internals.

## Surface Notes

Projects: strong context and real workflows are visible, but the three-pane layout creates cramped competition between project list, task timeline, and trace.

Assistants: the inspector is useful, but large blank regions and many equal-weight controls weaken orientation.

Jobs: the scheduler model is strong, but risk, failure, and blocked states need a clearer summary before raw detail.

Runs: evidence is rich, but raw run history overwhelms what happened, what changed, and what needs action.

Settings: complete and practical, but too form-heavy and visually close to every other surface.

Trace: powerful as a developer console, but it should be inspect-on-demand. Raw failures need a summarized first read.

Mobile: header and workspace sheet layout need the priority fix. The sheet should fill the viewport and every tab should show usable content.

## Severity-Ranked UX Gaps

P0: mobile sheet/content clipping. Sheet content does not reliably fill viewport height, and nested tab panes need stronger `min-h-0`, `flex-1`, and overflow containment.

P0: trace panel dominance and raw error overwhelm. Trace is valuable, but default visibility makes developer noise compete with the primary workflow.

P1: weak visual hierarchy across cards and panels. Too many surfaces share the same weight, radius, tint, and border.

P1: one-note palette and excessive rounded surfaces. Cream backgrounds dominate, while semantic status colors are present but not structural enough.

P1: jobs/runs actionability. Lists need a short attention summary before dense history and logs.

P2: creation dialogs need guided flow. Assistant and job creation have high capability, but read as dense forms instead of staged creation flows.

P2: search/filter menus need touch-safe behavior. Menus should preserve compact desktop ergonomics while becoming easier to use on mobile.

## Polish Roadmap

Phase 1: visual system reset. Move to a quiet neutral base, keep restrained teal, blue, amber, red, and green semantic accents, reduce repeated card radii to 8px, and define clear elevation levels.

Phase 2: app shell. Turn the header into a compact command bar with workspace identity, active surface label, connection, notifications, pause/resume, help, and trace controls. Mobile should stay within two rows.

Phase 3: mobile workspace sheet. Make sheet content fill the viewport, ensure the tabbed pane can shrink and scroll, and verify all five tabs render actual content.

Phase 4: trace experience. Replace boolean trace visibility with closed, peek, and open modes. Peek should summarize run state, failures, and active agents. Open remains the full inspector. Raw details should stay expandable.

Phase 5: projects and chat. Make the center pane read as a task timeline with clearer status rails. Collapse tool calls by default with summaries and expandable raw detail.

Phase 6: assistants. Convert roster cards into compact status rows and make the inspector top read as an assistant command center with identity, state, jobs, and blockers.

Phase 7: jobs and runs. Add attention summaries above lists. Jobs should show schedule health, next run, owner, risk, and last outcome. Runs should show a failure digest before raw logs.

Phase 8: settings. Keep left section navigation, but convert dense credentials and settings into grouped rows with concise descriptions and clearer action hierarchy.

Phase 9: dialogs. Split assistant creation into Identity, Scope/Routing, Prompts, and Assets. Split job creation into Schedule, Ownership/Risk, Task Prompt, and Execution. Keep sticky footers and add live validation and previews.

Phase 10: verification. Capture desktop, tablet, and mobile screenshots; assert no blank main surfaces, no horizontal overflow, mobile sheet fill, and trace closed/peek/open behavior. Run typecheck and targeted UI tests for sheet, dialogs, popovers, and trace state.
