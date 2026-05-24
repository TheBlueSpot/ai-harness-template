# Improve UX Learnings

## Reusable Patterns

- Combine adjacent panels when they repeat identity, source, status, or run facts; one strong summary surface creates faster orientation than several equal-weight cards.
- Affordances work best when visual state carries meaning before copy: semantic borders, status chips, icons, selected markers, disabled reasons, and risk color should guide the first scan.
- Shadows should separate layers quietly: use reduced opacity, broader blur, and restrained spread so depth supports hierarchy instead of becoming decoration.
- Dense developer tools need contrast between summary, action, and raw detail. Summaries should explain state and risk before logs, traces, or long prompts.
- Repeated cards read cleaner with tight radius, stable dimensions, and one clear state marker instead of large rounded nested containers.
- View switchers should use tab semantics with a restrained selected marker; reserve filled button color for commands, not navigation.
- Resumable or failed work should surface above empty or low-signal transcript space, with the recovery action in the same warning region.

## Project Findings

- The trace panel UX pass showed that job and run cards were competing because identity, status, and failure details were split across equal-weight boxes; combining them made the selected trace context easier to scan.

## Evidence Links

- User-provided trace panel screenshot in the request that created this skill.
- Follow-up implementation touched `harness/ui/src/components/trace-panel.tsx` and `harness/ui/src/styles.css`.
