# Create And Configure

Use for assistant create, update, clone, and asset-link work from project chat.

## Create

Flow:

1. Resolve scope: project by default when project chat is active; global only when user says global.
2. Require name and job purpose.
3. Use `assistant.create` or the project-chat shape from [operation-handoffs.md](operation-handoffs.md): `create a project assistant named <name> to <purpose>`.
4. Keep project chat as the active surface.
5. Post a compact assistant-action card with `Open assistant`, `Retry bootstrap`, and `Schedule job` actions.

Ask clarification if name or job purpose is missing.

## Update

Flow:

1. Resolve assistant.
2. Identify exact field: name, description, personality prompt, job prompt, mode, model, assets, run state.
3. Use `assistant.update`.
4. Validate asset refs before save.
5. Summarize changed fields in project chat and verify the assistant row.

Ask clarification if user says "update assistant" without the field to update.

## Clone

Flow:

1. Resolve source assistant.
2. Resolve destination project, using current project when unambiguous.
3. Use `assistant.clone-to-project` or `clone <assistant> to this project`.
4. Reset failure streak and circuit breaker on clone.
5. Keep clone project-scoped and report where it landed.

Ask clarification if destination project is missing and no project is active.
