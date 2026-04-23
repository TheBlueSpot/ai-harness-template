# Harness UI Source

Solid UI source for harness frontend.

- `harness-store.ts` owns websocket-driven view state and transient UI state.
- Browser-local preference saves merge partial updates so composer controls like fast mode and reasoning survive refresh-time sync and unrelated settings edits.
- `components/` renders transcript, planning, run state, assistants, and supporting surfaces.
- Live transcript rendering keeps harness progress rows thread-local so switching threads and switching back restores in-flight transcript state, while reconnect can still rebuild partial assistant text from the persisted transcript row without duplicating it in chat.
- `mount-app.tsx` owns the browser mount boundary so dev remount or reload flows keep root wiring in one place.

See [root README](../../../README.md) for repo overview.
