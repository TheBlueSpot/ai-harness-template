# Kojima Learnings

## 2026-05-06 Durable Refresh

Source set:
- [Todo research notes](../../docs/research/todo-research-notes.md)
- [Current queue](../../todo.md)
- [OpenAI models docs](https://platform.openai.com/docs/models)
- [OpenAI Responses API docs](https://platform.openai.com/docs/api-reference/responses/tutorials-and-guides)

Durable gameplay-quality takeaways:
- Keep the local trust loop first: activation, recovery, and fast retry still matter more than broader assistant-surface bets.
- Make high-pressure play readable from shape, position, and contrast before relying on text or color.
- Preserve intent with small forgiveness windows and low-friction retry, especially where failure is frequent.
- Treat HUD clutter, unclear prompts, and sluggish input response as gameplay blockers, not polish.

Durable workflow takeaways:
- Keep `verify-smoke` and nearby local maintenance ahead of broader roadmap expansion unless a new memo gives stronger evidence.
- Stay honest about capability and tool health before promising portability, remote targets, or background-run expansion.
- Raise background-run and remote-target work only when handoff, recovery, and review surfaces are explicit and trustworthy.
- Treat memory and reusable skills as valuable only when source, freshness, and allowlist state are visible.

Newly reinforced bets:
- `Background runs` and `remote targets` move up as a product pattern only when review inbox, takeover, and stale-run recovery are first-class.
- `Provider portability` stays secondary to visible tool readiness and auth state.
- `Usage and quota visibility` stays important because cost and trust state belong near execution.
- `Memory and skill platform` remains promising, but governance and provenance stay the gating requirement.

Candidate shared tooling ideas:
- A small queue-rank snapshot script that composes the current todo, comparison baseline, and dated memo into one durable summary for future refreshes.
- A reusable research memo template that stores conclusions, queue effect, and source list in a stable markdown shape.
- A skill for background-run recovery review that checks handoff, resume, stale-run detection, and failure recovery before new scope is promoted.

Current ranking truth:
- The current queue only shows completed items, so there is no fresh evidence here that beats the local maintenance pick.
- This refresh should not reorder the roadmap beyond the established trust-first sequence in the comparison baseline.
