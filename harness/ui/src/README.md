# Harness UI Source

Solid UI source for harness frontend.

- `harness-store.ts` owns websocket-driven view state and transient UI state.
- Assistant creation events and setup prompts keep project-chat assistant creation visible, recoverable, and routed into the Assistants surface.
- Browser-local preference saves merge partial updates so composer controls like fast mode and reasoning survive refresh-time sync and unrelated settings edits.
- The left workspace tabs own primary navigation, restoring the last selected Projects, Assistants, Jobs, or Runs tab from browser session state.
- Main panel widths are resizable on desktop and restore from browser session state, with a preferences action for default layout.
- Project sidebar sort, grouping, and manual order choices stay browser-local so navigation can be personalized without changing workspace data.
- Project chat exposes transient search across open project titles first, then loaded active-thread transcript hits.
- Assistants, Jobs, and Runs expose browser-session search and filters so dense rosters, schedules, and run history stay inspectable without backend ownership changes.
- The Background Jobs surface now includes a Health segment with recent reliability diagnostics, active backoff visibility, dominant failure categories, and prompt repetition signals, while keeping the selected segment browser-local.
- Job details expose active-run recovery actions so blocked scheduled work can be stopped without switching to the run inbox.
- Run notifications open the Runs tab on the matching status bucket so selected execution details stay visible.
- Assistant-owned job notifications route to the owning assistant log so scheduled work evidence stays near assistant history, with compact row summaries and full details in dialogs.
- Execution log detail dialogs share transcript markdown formatting so long prompts stay readable without changing compact list rows.
- Assistant chat follows project chat scroll behavior, opening at latest messages and exposing a return-to-latest control when browsing history.
- Assistant learnings render with empty states and bounded batches so large memory sets stay inspectable without special compacted-summary labeling.
- Dense transcript, assistant, job, run, trace, and log collections use virtual infinite scrolling so tab switches stay responsive with large histories.
- Assistant todo and learning rows expose cleanup actions while completed todos age out through backend retention.
- Trace panel follows selected Projects, Assistants, or Jobs context and shows unified execution evidence plus running-agent counts.
- Provider preferences and context usage surfaces include Claude and cached-input visibility for efficient runs.
- Shared time formatting keeps visible timestamps compact and browser-local.
- The app shell uses a compact global scale so dense workflows fit without manual browser zoom.
- Shared overlay primitives route portal content through reusable document roots so closed tooltips, popovers, and dialogs do not leave document-level empty containers.
- `components/` renders transcript, planning, run state, assistants, and supporting surfaces.
- The inbox surfaces assistant questions only after backend policy classifies them as high-confidence blockers; soft repeats stay in assistant guidance and logs.
- Live transcript rendering keeps harness progress rows thread-local so switching threads and switching back restores in-flight transcript state, while reconnect can still rebuild partial assistant text from the persisted transcript row without duplicating it in chat.
- `mount-app.tsx` owns the browser mount boundary so dev remount or reload flows keep root wiring in one place.

See [root README](../../../README.md) for repo overview.
