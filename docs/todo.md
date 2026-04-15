# TODO

## Workspace Sync

- Add optional multi-device workspace synchronization after local SQLite workflow is stable
- Evaluate Convex as the sync layer for project metadata, thread records, and message streams
- Keep local-first behavior as source of truth during offline work
- Define conflict handling for concurrent thread edits or resets across devices
- Design remote identity for a workspace without weakening current local-only safety model
- Add explicit reconciliation rules between local SQLite state and remote synced state
- Consider background sync queues, retry behavior, and user-visible sync status

## Non-Goals For Current Phase

- No remote execution
- No shared multi-user editing
- No automatic cloud dependency for normal local use
