# Harness UI Source

Solid UI source for harness frontend.

- `harness-store.ts` owns websocket-driven view state and transient UI state.
- Assistant creation events and setup prompts keep project-chat assistant creation visible, recoverable, and routed into the Assistants surface.
- Browser-local preference saves merge partial updates so composer controls like fast mode and reasoning survive refresh-time sync and unrelated settings edits.
- The left workspace tabs own primary navigation, restoring the last selected Projects, Assistants, or Jobs tab from browser session state.
- Project sidebar sort, grouping, and manual order choices stay browser-local so navigation can be personalized without changing workspace data.
- The Jobs tab keeps its list, inbox segment, search, and selected detail as UI-only state so scheduler data remains backend-owned.
- Assistant-owned job notifications route to the owning assistant log so scheduled work evidence stays near assistant history.
- Shared time formatting keeps visible timestamps compact and browser-local.
- `components/` renders transcript, planning, run state, assistants, and supporting surfaces.
- The inbox surfaces assistant questions only after backend policy classifies them as high-confidence blockers; soft repeats stay in assistant guidance and logs.
- Live transcript rendering keeps harness progress rows thread-local so switching threads and switching back restores in-flight transcript state, while reconnect can still rebuild partial assistant text from the persisted transcript row without duplicating it in chat.
- `mount-app.tsx` owns the browser mount boundary so dev remount or reload flows keep root wiring in one place.

See [root README](../../../README.md) for repo overview.
