---
name: catalog-sweep
description: Sweep the catalog for queue drift, browser-entry coverage, README hygiene, cheap direct-boot file/import breaks, and quality-scan prep. Use when Codex needs one reusable pass across top-level game folders before queue reconciliation, per-game cleanup, browser-playability triage, or choosing the next browser-ready slug for cross-entry audits.
---

# Catalog Sweep

## Overview

Use this skill when catalog work needs a fast local scan before deeper implementation. Goal: surface one actionable backlog slice from repo facts: which browser-playable folders are missing queue records, which queue records still have no playable folder, which slugs have duplicate or mixed queue states, which entries lack concise high-level docs, which browser boot scripts already fail cheap syntax sanity, which direct-boot files or imports are already broken, which imports only work because local filesystem casing is forgiving, which entries no longer have current local smoke proof, and which slugs currently have usable review evidence versus missing or stale review rows. Queue-only helpers now also surface partial slug folders that exist without `index.html`, including nearby top-level files such as `README.md`, so completed-history drift can move straight into direct-boot restoration instead of wasting another rediscovery pass on `missing folder` false simplicity. The sweep and next-task helpers pull a few recent reusable signals from repo-local Kojima memory, preferring `./.local/kojima/learnings.md` and falling back to `./.agents/assistants/kojima-learnings.md`, so queue and browser-closure work stays grounded in the latest durable quality learnings without reopening the full log. Flat bullet learnings and full dated durable-learning sections both count. When the first question is `which skill lane should I work right now?`, use `workflow_lane_packet.ts`; it reads current queue, docs, verify, review, and quality state, then emits one exact reusable lane plus the exact commands for that lane and the predicted follow-up lane, so operators stop bouncing between multiple helpers before the first batch starts. When queue truth is already clean and the next step is seeding exactly one fresh pending record, use `seed_next_pending.ts`; it previews or safely appends one `PENDING | ...` line with explicit slug, title, and note only when the queue is actually in the zero-pending seed lane, so empty-queue recovery stops at one guarded todo step instead of an ad hoc edit. When queue truth already points to one pending slug with no top-level playable folder, use `seed_entry_packet.ts`; it turns that missing-folder queue record into one exact isolated starter packet with scaffold paths, browser-first setup steps, and follow-up commands so the first implementation pass does not reopen broader queue helpers. When the next slowdown is rebuilding the same missing starter files by hand, use `seed_entry_scaffold.ts`; it previews or safely applies a minimal direct-boot shell for that pending slug, creates only missing files, and leaves existing work untouched so queue triage can hand off straight into implementation. When one pass is too noisy, use the built-in focus filters to cut the backlog into one small reusable lane. Prefer `throughput` when you want one report that stays on queue drift, direct boot, and per-game docs without smoke-noise spillover; it now starts with `Closure next`, a ranked single-lane batch list that counts queue-only drift even when the slug has no folder yet, so missing pending builds do not disappear behind docs or smoke work. Prefer `verify` when you want one browser-playability lane that batches boot-first fixes and entries that need fresh smoke proof. When the verify lane is known and the next step is actual re-check work, use `verify_pack.ts` to pull one small closure-ready batch with source files, ranked evidence, next steps, and exact per-slug packet commands so browser-playability checks stop paying a second rediscovery pass. When the verify list is still too broad and you need one exact risk-family batch across top-level folders, use `playability_risk_packet.ts`; it groups hard blockers, casing drift, and smoke-only debt into one compact action packet so cross-entry browser triage can start without reopening the broad sweep. When one verify slug is already chosen and the next need is the exact boot surface plus proof target map, use `browser_playability_packet.ts`; it expands one slug into local references, module/import surfaces, smoke targets, review guard, and exact follow-up commands so browser verification stops reopening `index.html` and import chains by hand. When the active lane is smoke refresh and the next slowdown is bouncing between ranked smoke debt and per-slug boot mapping, use `smoke_refresh_kickoff.ts`; it picks one current smoke target, carries the boot map, review guard, and proof paths into the same packet, and keeps browser refresh work on one slug without reopening both smoke and playability helpers by hand. When queue drift is known but the next operator still needs one short handoff, use `reconcile_packet.ts`; it merges the queue recommendation, one slug's top local notes, review-freshness guard, and recent Kojima signals so one-game-at-a-time closure starts from one packet instead of several helper outputs. When one slug is already chosen and the operator wants every maintenance lane in one place, use `maintenance_packet.ts`; it stitches queue state, docs prep, smoke proof targets, and exact review-flag commands into one per-slug packet so maintenance work stops bouncing between separate helpers before the first edit. When existing files are already dirty and the closeout risk is forgetting the canonical review flag, use `review_flag_sync.ts`; it converts the current git dirty tree into exact per-slug `needsAdditionalFeedback` actions, skips brand-new-file-only slugs, and can apply the review flags directly so catalog edits stop relying on manual memory at the end of a run. When dirty slugs are already known and the next risk is forgetting which edited entries need browser proof versus docs-only closeout, use `dirty_verify_pack.ts`; it converts the current git dirty tree into exact boot-fix-first, verify-after-edit, or docs-only packets so browser-playability follow-up stays scoped to touched slugs instead of requiring another broad sweep. When dirty slugs are already known and the next risk is end-of-run closure thrash across verify, review reflagging, and per-slug follow-up commands, use `dirty_closeout_packet.ts`; it leads with issue-first touched-slug closeout packets, then includes the exact review-flag and proof commands needed to finish without reopening several helpers. When the smoke lane is already known and the next step is saving fresh local proof, use `smoke_refresh_pack.ts` to expand missing or stale smoke debt into exact slugs, local proof target patterns, and direct browser re-verification steps so operators stop rediscovering where evidence should land under `./.local`. Prefer `review_freshness_pack.ts` when the next question is `which slugs have missing reviews, blocked reviews, or review rows that must be reflagged after edits?`; it reads `./todo.md`, top-level playable folders, and the same canonical `needsAdditionalFeedback` semantics used by `./scripts/user-reviews.ts` so feedback evidence stays trustworthy during catalog passes. Prefer `quality_scan_pack.ts` when browser proof is already partway handled and the next question is `which slugs are ready for reusable playtest capture and cross-entry audits?`; it ranks fresh-smoke entries missing playtest evidence ahead of slugs that still need smoke refresh or boot repair so onboarding, HUD, pacing, failure-loop, and impact passes stop rediscovering browser-safe targets by hand. When the quality lane is already known and the next step is actual capture work, use `playtest_capture_pack.ts` to expand capture-ready slugs into exact observation, report, and starter-file paths plus the concrete commands needed to initialize and process the playtest packet. When starter files already exist and the next question is `which focused audit can I run right now without reopening capture triage?`, use `audit_handoff_pack.ts`; it reads the saved playtest starter payloads, respects their embedded coverage and claim guardrails, and ranks `audit-ready`, `audit-partial`, and `starter-gap` lanes so cross-entry quality scans can start from one exact downstream packet instead of manual folder spelunking. Prefer `docs` when README debt is the bottleneck; it now emits one `Docs next` batch grouped by rewrite type so the next operator can fix similar docs in one run instead of re-triaging every entry. When docs debt is already known and the next step is actual rewrite work, use `docs_rewrite_pack.ts` to pull one closure-ready lane with exact slugs, rewrite guidance, and a few culprit lines so README cleanup stops wasting time on rediscovery. When the docs lane also needs support-doc handoff and review-closeout context in one place, use `docs_closeout_pack.ts`; it merges README rewrite starters, support-doc links, ready `Related Docs` blocks, and inline review guards so one docs run stops bouncing between rewrite, link, and review helpers. When the next docs bottleneck is support-doc link hygiene across several entries, use `docs_link_pack.ts`; it batches slugs with linked or unlinked nested markdown support docs so README cleanup can target asset, playtest, or `docs/` handoff work without folder-by-folder rediscovery. When one slug is already chosen and the next docs question is `what detail should stay in support markdown instead of the README?`, use `readme_doc_handoff.ts`; it lists support markdown files up to nested asset or docs folders, shows which ones are still unlinked from the README, and emits a ready `Related Docs` block so per-game docs cleanup can stay high level without manual folder spelunking. When you want the actual rewrite starters for several slugs, use `readme_rewrite_batch.ts`; it now carries each slug's inline review-freshness guard plus the exact reflag command when the README edit will require `needsAdditionalFeedback` closeout, so batch docs work does not drift away from canonical review handling. Prefer `queue_reconcile.ts` when the scan already told you queue drift exists and you need one concrete next reconciliation action instead of another broad report, although the sweep now mirrors that recommendation inside `Reconcile next` for faster handoff. When the lane summary is still too broad, use `next_catalog_task.ts` to collapse queue truth plus cheap local folder checks into one exact slug, one exact closure mode, the files to open first, one short next-step list, and one inline review-freshness guard so one-game-at-a-time catalog maintenance stops dropping the `needsAdditionalFeedback` rule between triage and edits. End sweep, queue, docs, verify, smoke-refresh, review-freshness, review-flag-sync, dirty-verify, dirty-closeout, quality, capture-pack, audit-handoff, maintenance-packet, next-task, workflow-lane, browser-playability, browser-risk, fresh-seed, seed-entry, seed-scaffold, smoke-kickoff, or docs-closeout helper runs with `--save-learning` so the same closure packet also records one concise throughput-focused durable learning in both `./.agents/skills/catalog-sweep/LEARNINGS.md` and the repo-local source of truth at `./.local/kojima/learnings.md`.

## Workflow

1. Treat `./todo.md` as queue truth.
2. Run one sweep across top-level folders with `index.html`, then compare that list back to `./todo.md` so queue-only drift, untracked playable folders, duplicate queue slugs, and mixed queue states show up in the same pass.
3. Start with the `Reconcile next` output, then pick one concrete fix path: queue reconciliation, README hygiene, smoke refresh, or direct-boot repair.
4. If queue truth is already in the zero-pending seed lane, run `scripts/seed_next_pending.ts` to preview one explicit `PENDING | ...` line before editing `./todo.md` by hand.
5. If queue truth already points to one pending slug with no playable folder, run `scripts/seed_entry_packet.ts` before broader planning so the scaffold starts from one exact folder-local packet.
6. If the pending slug still needs the same root starter files created by hand, run `scripts/seed_entry_scaffold.ts` in preview first, then `--apply` when the file plan is correct so the missing direct-boot shell appears without overwriting existing work.
7. Keep fixes game-local unless the sweep proves a shared workflow gap.
8. Use the report as triage, not as a replacement for direct play or deeper review.
9. Treat missing or stale smoke proof as a queue-speed warning: it means browser validation likely needs to happen before closing the next reconciliation step.
8. Treat README hygiene drift as throughput debt: implementation-heavy or patrol-log-heavy docs slow later queue passes because the next operator has to re-extract the actual game concept. Use the `docs next` line as the cleanup target, not as a prompt to write long notes.
9. Treat boot-script syntax errors as early browser-playability blockers. A cheap parse failure in `index.html` inline code or a local boot script is enough reason to stop queue reconciliation and repair the entry first.
10. Treat casing drift as a browser-playability risk even on Windows. If the sweep says a path only resolves because of filename case mismatch, fix it before reconciling the entry as healthy.
11. If the issue list is long, re-run with `--focus docs|smoke|boot|verify|reconcile` and optionally `--limit N` so the next operator can stay inside one repeatable task lane.
12. If you need one `what improves catalog throughput next?` pass, run `--focus throughput`. It emits `Closure next` first so the operator sees the biggest single-lane closure batch before deeper lane summaries, counts queue-only missing-folder drift inside that batch ranking, then strips unrelated smoke issues from entry details so queue, boot, and docs work can be batched directly.
13. If queue already points to one pending slug with no playable folder and the next step is isolated entry setup, run `scripts/seed_entry_packet.ts`. It emits the queue line, starter paths, browser-first scaffold steps, and follow-up commands so the first implementation pass does not reopen broader queue helpers.
14. If you need one `what should I re-verify in browser next?` pass, run `--focus verify`. It emits a compact `Verify next` summary with boot blockers first and smoke-refresh targets second so browser time stays on entries that can actually close.
15. If verify debt is already known and the next step is actual browser re-check work, run `scripts/verify_pack.ts`. It emits one small ranked batch with `boot-first` entries ahead of `smoke-refresh` entries, plus exact files, next steps, and per-slug packet commands so the operator can re-check browser playability without rediscovering the same evidence.
16. If verify debt is broad and the next step is choosing one cross-entry browser triage batch, run `scripts/playability_risk_packet.ts`. It groups top-level folders into `hard-blocker`, `casing-risk`, and `smoke-drift` packets so the next browser pass starts from one compact action lane instead of a full sweep.
17. If one verify slug is already chosen and the next step is mapping exact boot surfaces and proof targets, run `scripts/browser_playability_packet.ts --slug <slug>`. It emits local references, module/import surfaces, smoke targets, review guard, and follow-up commands so browser work can stay on one entry.
18. If smoke refresh is the active lane and you want one chosen slug's proof target plus boot map in the same handoff, run `scripts/smoke_refresh_kickoff.ts --group missing|stale|all` or `--slug <slug>`. It turns the ranked smoke lane into one closure-ready slug packet so browser refresh work does not bounce between pack-level ranking and per-slug spelunking.
19. If smoke debt is already known and the next step is saving fresh local proof, run `scripts/smoke_refresh_pack.ts`. It emits one small batch with missing proof before stale proof, exact `./.local` target patterns, and direct browser re-verification steps so proof capture does not stall on naming or path rediscovery.
19. If docs cleanup is the slow lane, run `--focus docs`. It emits one `Docs next` batch split into `add launch line`, `trim implementation detail`, `trim fix-log drift`, and `multi-fix rewrites` so README work can be attacked as one repeatable batch instead of one-off judgment.
20. If docs cleanup is the active task, run `scripts/docs_rewrite_pack.ts` after the docs-focused sweep. It turns one rewrite lane into a small batch pack with the exact slugs, rewrite guidance, and example culprit lines, so the operator can edit several READMEs without reopening every file just to rediscover why the sweep flagged it.
21. If docs cleanup also needs support-doc handoff and review-closeout context in one pass, run `scripts/docs_closeout_pack.ts`. It expands one rewrite lane or explicit slug list into ready README starters plus support-doc links, related-doc blocks, and inline review guards.
22. If one docs lane is already chosen and the next step is several actual rewrites, run `scripts/readme_rewrite_batch.ts`. It consumes the current docs-pack lane or explicit `--slug` values and expands them into a small batch of high-level README starters, with each slug's review-freshness guard inline so batch doc closure does not stall or lose canonical closeout steps.
23. Treat the starter, batch, or closeout helper's `Review guard` block as required execution context for docs edits. `flag-after-edit` means the README edit needs `needsAdditionalFeedback true` before closeout; `needs-feedback` means current review evidence is blocked until refreshed.
24. If one slug is already chosen and the next step is the actual rewrite, run `scripts/readme_rewrite_starter.ts --slug <slug>`. It converts that slug's current docs-pack facts into one high-level README starter with the launch line already present, plus the active review guard, so docs closure can start from a clean draft instead of manual copy-trim work.
25. If the next docs question is `which entries have unlinked support markdown?`, run `scripts/docs_link_pack.ts`. It emits one small pack of playable slugs with asset, playtest, or nested docs markdown plus the exact `readme_doc_handoff.ts` follow-up command for each slug.
26. If one slug is already chosen and the next docs question is `what supporting markdown should stay linked instead of copied into README?`, run `scripts/readme_doc_handoff.ts --slug <slug>`. It emits one per-folder docs packet with support markdown files, linked versus unlinked state, and a ready `Related Docs` block so README cleanup can stay high level without manual folder spelunking.
27. If browser proof is already mostly current and the next operator wants cross-entry quality work, run `scripts/quality_scan_pack.ts`. It turns smoke freshness plus local playtest-artifact drift into one compact lane with `capture-ready`, `refresh-browser-first`, and `boot-blocked` states so quality review starts from reusable evidence instead of guesswork.
27. If a quality lane is already capture-ready and you want to start direct browser evidence work immediately, run `scripts/playtest_capture_pack.ts`. It turns each chosen slug into one exact local packet: `./.local/<slug>-playtest.json`, `./<slug>/playtest-evidence.md`, `./.local/playtest-starters/<slug>/`, plus the concrete commands needed to initialize the observation file, emit the downstream audit starters, and reuse saved downstream starters such as `choice-readback` and `settings-and-assists` without hand-entering them again.
28. If playtest starter files already exist and you want the next focused audit lane instead of another capture pass, run `scripts/audit_handoff_pack.ts`. It ranks `audit-ready`, `audit-partial`, and `starter-gap` states per slug, filters to one audit when needed, and prints the exact downstream audit commands that can run from the saved starter files, including `choice-readback` and `settings-and-assists` when those starters exist.
29. Read the compact `Kojima signals` block in sweep and next-task output before choosing implementation tone or closure order. Those bullets come from repo-local Kojima memory, preferring `./.local/kojima/learnings.md` and falling back to `./.agents/assistants/kojima-learnings.md`, and should be treated as the current durable quality source of truth.
30. End the run with `--save-learning` so the active helper appends one concise catalog-throughput lesson to both `./.agents/skills/catalog-sweep/LEARNINGS.md` and `./.local/kojima/learnings.md` without manual note-writing.
31. If queue drift is the real blocker, run `scripts/queue_reconcile.ts` after the sweep. It converts the snapshot into one explicit next action such as `build pending folder`, `reconcile untracked playable folder`, or `seed exactly one new pending item`, so the next operator does not have to infer queue policy from several separate counters. The sweep now mirrors that same recommendation under `Reconcile next` when drift exists.
32. If the next operator needs one exact target instead of another lane summary, run `scripts/next_catalog_task.ts`. It reads `./todo.md`, top-level playable folder coverage, the chosen entry's `index.html`, `README.md`, local smoke state, recent Kojima signals, and the canonical review freshness state, then emits one exact task packet with `mode`, `slug`, `inputs`, `evidence`, `next steps`, one inline `Review guard`, and reusable quality guidance.
33. If queue already points to one slug or a user named the slug directly, run `scripts/next_catalog_task.ts --slug <slug>` before reopening the broad sweep. It locks one folder or queue-only record into a queue-first, boot-second closure packet so one-game-at-a-time work does not pay another rediscovery pass.
34. If feedback evidence might affect prioritization, docs tone, or edit safety, run `scripts/review_freshness_pack.ts`. It compares `./todo.md`, top-level playable folders, and `./user-reviews.sqlite` using the canonical `needsAdditionalFeedback` review flag so missing rows, blocked reviews, and slugs that must be reflagged after edits are visible before work starts.
35. If queue drift is already known and the operator wants one compact handoff packet, run `scripts/reconcile_packet.ts`. It condenses queue drift counts, the chosen or recommended slug, top local issue notes, review-freshness guard, and a few Kojima signals into one short closure packet.
36. If one slug is already chosen and the next step is actual maintenance inside that same folder, run `scripts/maintenance_packet.ts --slug <slug>`. It condenses queue facts, local docs and boot debt, smoke targets, review freshness, and exact follow-up commands into one per-slug packet so execution stays inside a single folder.
37. If existing catalog files are already dirty and the next risk is forgetting review reflagging, run `scripts/review_flag_sync.ts`. It reads git status, maps changed paths back to queued or playable slugs, separates existing-file edits from brand-new-file-only slugs, and can apply `needsAdditionalFeedback true` directly through `./scripts/user-reviews.ts`.
38. If existing catalog files are already dirty and the next risk is forgetting which touched slugs actually need browser follow-up, run `scripts/dirty_verify_pack.ts`. It reads the same dirty tree, separates README-only edits from content edits, and emits one small boot-fix-first or verify-after-edit packet per touched slug so browser time stays on actual edited entries.
39. If existing catalog files are already dirty and the next risk is closeout thrash across verification, review reflagging, and per-slug follow-up commands, run `scripts/dirty_closeout_packet.ts`. It leads with issue-first touched-slug closeout packets, then includes exact review-flag, verify, and maintenance commands so end-of-run closure stays in one helper.
40. If the broad question is `which reusable lane should I work next?`, run `scripts/workflow_lane_packet.ts`. It ranks queue, verify, docs, review, and capture-ready quality lanes from current repo facts, then prints one exact current lane plus exact commands for the predicted follow-up lane so the next batch can start without multi-helper triage.

## Commands

Print a concise issue-first sweep:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/catalog_sweep.ts --issues-only
```

Print the same sweep and save one durable learning line:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/catalog_sweep.ts `
  --issues-only `
  --save-learning
```

Pull one combined throughput pass for queue drift, broken direct boot, and missing or noisy docs:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/catalog_sweep.ts `
  --issues-only `
  --focus throughput `
  --limit 10 `
  --save-learning
```

Read the ranked closure-first batch list from the same throughput pass:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/catalog_sweep.ts `
  --issues-only `
  --focus throughput
```

Pull only the next few README cleanup targets:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/catalog_sweep.ts `
  --issues-only `
  --focus docs `
  --limit 5
```

Pull one docs batch summary before rewriting several READMEs:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/catalog_sweep.ts `
  --issues-only `
  --focus docs `
  --limit 20
```

Pull a closure-ready batch pack for launch-line rewrites after the docs sweep:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/docs_rewrite_pack.ts `
  --group launch `
  --limit 10
```

Pull one docs closeout batch that already includes README starters, support-doc links, and review guards:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/docs_closeout_pack.ts `
  --group launch `
  --limit 5 `
  --save-learning
```

Pull mixed README rewrites with culprit lines so full rewrites can be batched:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/docs_rewrite_pack.ts `
  --group mixed `
  --limit 10
```

Let the helper pick the biggest docs lane automatically and print the next rewrite pack:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/docs_rewrite_pack.ts --limit 10
```

Save the chosen docs lane as durable local memory while printing the pack:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/docs_rewrite_pack.ts `
  --limit 10 `
  --save-learning
```

Turn one chosen slug into a high-level README rewrite starter:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/readme_rewrite_starter.ts `
  --slug age-evolution
```

Pull one per-slug docs handoff with sibling markdown links and a ready related-docs block:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/readme_doc_handoff.ts `
  --slug qix-fracture
```

Pull one docs-link lane for entries whose README still misses asset, playtest, or nested docs links:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/docs_link_pack.ts `
  --group unlinked `
  --limit 10
```

Save the same docs-link lane as durable local memory while printing the exact follow-up handoff commands:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/docs_link_pack.ts `
  --group unlinked `
  --limit 10 `
  --save-learning
```

Save that docs handoff as durable local memory while printing the same packet:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/readme_doc_handoff.ts `
  --slug qix-fracture `
  --save-learning
```

Turn one docs lane into several README rewrite starters:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/readme_rewrite_batch.ts `
  --group launch `
  --limit 5
```

Turn explicit slugs into a batch of README starters without rerunning lane choice:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/readme_rewrite_batch.ts `
  --slug age-evolution `
  --slug battle-city-ricochet
```

Save the selected README rewrite batch as durable memory while carrying inline review guards:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/readme_rewrite_batch.ts `
  --group launch `
  --limit 5 `
  --save-learning
```

Pull only the next few stale or missing smoke targets:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/catalog_sweep.ts `
  --issues-only `
  --focus smoke `
  --limit 5
```

Pull one browser re-verification lane that combines broken boot and stale or missing smoke proof:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/catalog_sweep.ts `
  --issues-only `
  --focus verify `
  --limit 10 `
  --save-learning
```

Pull one closure-ready verify batch with boot blockers ranked ahead of smoke refresh:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/verify_pack.ts --limit 5
```

Save the current verify lane as durable local memory while pulling the pack:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/verify_pack.ts `
  --limit 5 `
  --save-learning
```

Pull one compact cross-entry browser-risk lane when verify debt is still too broad:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/playability_risk_packet.ts `
  --limit 5
```

Save the chosen browser-risk lane as durable local memory while printing the same packet:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/playability_risk_packet.ts `
  --save-learning
```

Pull only smoke-refresh verify work after boot debt is already cleared:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/verify_pack.ts `
  --group smoke `
  --limit 5
```

Pull one exact per-slug browser packet before a verify edit or smoke refresh:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/browser_playability_packet.ts `
  --slug advance-wars-skirmish
```

Save that packet's throughput learning into skill-local and Kojima memory:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/browser_playability_packet.ts `
  --slug advance-wars-skirmish `
  --save-learning
```

Pull one proof-capture batch for missing smoke artifacts first:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/smoke_refresh_pack.ts `
  --group missing `
  --limit 5
```

Pull one proof-capture batch for stale smoke artifacts:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/smoke_refresh_pack.ts `
  --group stale `
  --limit 5
```

Save the selected smoke-refresh lane as durable local memory while printing exact proof targets:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/smoke_refresh_pack.ts `
  --limit 5 `
  --save-learning
```

Pull one review-freshness lane for missing review rows first:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/review_freshness_pack.ts `
  --limit 10
```

Pull only reviews blocked by `needsAdditionalFeedback`:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/review_freshness_pack.ts `
  --group blocked `
  --limit 10
```

Convert dirty catalog slugs into exact review-flag actions without changing the DB:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/review_flag_sync.ts
```

Limit the dirty-tree review sync to one slug:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/review_flag_sync.ts `
  --slug age-evolution
```

Apply the canonical review flags for all dirty existing-file edits and save one durable learning:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/review_flag_sync.ts `
  --apply `
  --save-learning
```

Convert dirty catalog slugs into exact browser closeout packets:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/dirty_verify_pack.ts
```

Limit the dirty browser-closeout packet to one slug:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/dirty_verify_pack.ts `
  --slug age-evolution
```

Save the current dirty browser-closeout packet as durable local memory:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/dirty_verify_pack.ts `
  --save-learning
```

Pull one issue-first closeout packet for currently touched catalog slugs:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/dirty_closeout_packet.ts
```

Limit the same closeout packet to one slug:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/dirty_closeout_packet.ts `
  --slug age-evolution
```

Save the current touched-slug closeout packet as durable local memory:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/dirty_closeout_packet.ts `
  --save-learning
```

Pull only slugs that likely need `needsAdditionalFeedback: true` after editing existing files:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/review_freshness_pack.ts `
  --group flag `
  --limit 10
```

Save the current review-freshness lane as durable local memory while printing the same packet:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/review_freshness_pack.ts `
  --group blocked `
  --limit 10 `
  --save-learning
```

Pull the next browser-ready slugs for reusable playtest capture and downstream quality audits:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/quality_scan_pack.ts `
  --limit 5
```

Pull only the slugs that are already smoke-fresh and mainly need playtest evidence capture:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/quality_scan_pack.ts `
  --group ready `
  --limit 5
```

Expand those ready slugs into exact observation/report/starter paths and concrete capture commands:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/playtest_capture_pack.ts `
  --group ready `
  --limit 5
```

Save the current playtest capture lane as durable local memory while printing the same packet:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/playtest_capture_pack.ts `
  --group ready `
  --limit 5 `
  --save-learning
```

Pull the next audit-ready downstream packets from saved starter files:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/audit_handoff_pack.ts `
  --group ready `
  --limit 5
```

Limit that handoff to one focused audit lane:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/audit_handoff_pack.ts `
  --audit hud `
  --group ready `
  --limit 5
```

Save the current audit handoff lane as durable local memory while printing the same packet:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/audit_handoff_pack.ts `
  --group partial `
  --limit 5 `
  --save-learning
```

Pull only the slugs that still need fresh browser proof before any quality audit:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/quality_scan_pack.ts `
  --group refresh `
  --limit 5
```

Save the current quality-scan lane as durable local memory while printing the pack:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/quality_scan_pack.ts `
  --limit 5 `
  --save-learning
```

Pull only queue-reconcile drift:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/catalog_sweep.ts `
  --issues-only `
  --focus reconcile
```

Inspect one entry before reconciling it:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/catalog_sweep.ts --folder "gauntlet-hero"
```

Check for entries that need browser re-verification because smoke proof is missing or older than the latest non-markdown content change:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/catalog_sweep.ts --issues-only
```

Write a queue-reconcile snapshot for follow-up automation or manual triage:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/catalog_sweep.ts `
  --issues-only `
  --json `
  --out ".local/catalog-sweep.json"
```

Turn the current queue snapshot into one exact next action:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/queue_reconcile.ts
```

Emit the same queue recommendation as JSON for tooling or local notes:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/queue_reconcile.ts --json
```

Save the queue recommendation as durable local memory while printing the same next action:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/queue_reconcile.ts --save-learning
```

Preview one guarded fresh pending queue line when queue truth is already clean:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/seed_next_pending.ts `
  --slug <slug> `
  --title "<title>" `
  --note "<one-line note>"
```

Pull one exact starter packet for the next pending slug that still lacks a playable folder:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/seed_entry_packet.ts
```

Save that starter packet's throughput lesson into skill-local and Kojima memory:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/seed_entry_packet.ts --save-learning
```

Preview the missing starter files for one pending slug before touching the folder:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/seed_entry_scaffold.ts `
  --slug oregon-trail-crossing
```

Apply the same starter scaffold without overwriting files that already exist:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/seed_entry_scaffold.ts `
  --slug oregon-trail-crossing `
  --apply `
  --save-learning
```

Pull one compact reconciliation packet that merges queue action, local issue notes, and review guard:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/reconcile_packet.ts
```

Lock the same packet to one known slug:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/reconcile_packet.ts `
  --slug age-evolution
```

Save the packet's throughput lesson into skill-local and Kojima memory:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/reconcile_packet.ts `
  --save-learning
```

Pull one exact one-game-at-a-time task packet:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/next_catalog_task.ts
```

Pull one exact current workflow lane plus exact follow-up commands:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/workflow_lane_packet.ts
```

Save that lane decision as durable local memory while printing the same packet:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/workflow_lane_packet.ts `
  --save-learning
```

Pull one exact closure packet for a known queue slug before reopening the broad sweep:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/next_catalog_task.ts `
  --slug age-evolution
```

Pull one per-slug maintenance packet with queue, docs, smoke, and review commands:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/maintenance_packet.ts `
  --slug age-evolution
```

Save the same per-slug packet's throughput lesson into skill-local and Kojima memory:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/maintenance_packet.ts `
  --slug age-evolution `
  --save-learning
```

Pull the next task packet for one lane and save one durable learning line:

```powershell
bun.cmd .agents/skills/catalog-sweep/scripts/next_catalog_task.ts `
  --focus docs `
  --save-learning
```

## What It Checks

- top-level folders with `index.html`
- presence of `README.md`
- whether `README.md` clearly says how to launch the local browser entry
- whether `README.md` drifts into source-file inventory or patrol-log accumulation instead of staying high level
- concise `docs next` guidance for per-folder README cleanup
- presence of `PENDING` or `COMPLETED` queue records in `./todo.md`
- duplicate queue slugs and mixed pending/completed states for the same slug
- queue records in `./todo.md` that still have no matching top-level folder with `index.html`
- untracked top-level playable folders that still need queue records
- missing script tags in `index.html`
- syntax sanity of inline boot scripts and local boot-script files
- missing local assets, scripts, stylesheets, or linked pages from `index.html`
- missing relative JS imports reachable from locally referenced script entrypoints
- local path or import casing drift that can break direct browser play on case-sensitive hosts
- missing local smoke artifacts under `./.local`
- nested smoke artifacts kept one folder deep under `./.local/<run>/` such as patrol or operator-specific captures
- stale smoke artifacts where the latest proof predates the latest non-markdown content file in the entry folder
- review rows missing from `./user-reviews.sqlite` for queued or playable slugs
- review rows blocked by the canonical `needsAdditionalFeedback` freshness flag
- likely slugs to reflag with `needsAdditionalFeedback: true` after editing existing game files
- missing or stale `./.local/<slug>-playtest.*` artifacts relative to current smoke proof or non-markdown entry content
- filtered issue lists for `docs`, `boot`, `smoke`, `verify`, `reconcile`, and combined `throughput` passes so each lane shows only the issues relevant to that closure workflow
- a ranked `Closure next` section inside throughput runs that groups single-lane closure batches into docs-only, smoke-only, queue-only, and boot-only work before listing multi-front blockers, including queue-only slugs that still have no folder
- a compact `Docs next` section that groups README debt by rewrite type so doc cleanup can be batched instead of rediscovered entry by entry
- a `Docs Rewrite Pack` helper that turns one chosen README lane into concrete slugs, rewrite guidance, and a few culprit lines so docs fixes stop paying a second rediscovery pass
- a `Docs Link Pack` helper that turns asset, playtest, or nested docs markdown into one small linked-versus-unlinked README lane so support-doc cleanup can batch before per-slug rewrite work
- a `README Rewrite Batch` helper that consumes the docs-pack lane or explicit slugs and emits several high-level README starters at once so same-lane docs cleanup can happen in one pass
- a `README Rewrite Starter` helper that turns one chosen slug's docs-pack facts into a high-level markdown starter with launch line, reused controls, and compact loop bullets so README closure starts from edit-ready structure
- a `README Doc Handoff` helper that turns one chosen slug's folder into a docs packet with support markdown files, linked-versus-unlinked state, and a ready `Related Docs` block so README cleanup can stay high level and link outward instead of copying detail
- support markdown files inside one chosen entry folder, including nested asset or docs paths, whether the README already links them, and a ready `Related Docs` block for reuse during cleanup
- a compact `Throughput next` section that summarizes the next queue, docs, and direct-boot batches from one scan
- a compact `Kojima signals` section that distills a few recent reusable quality bullets from `./.agents/assistants/kojima-learnings.md` so sweep and next-task output stay grounded in current repo-local learnings
- a compact `Verify next` section that summarizes which entries need boot repair before browser time and which entries mainly need fresh smoke proof
- a `Verify Pack` helper that turns verify debt into one small ordered batch with exact files, ranked evidence, next steps, and per-slug packet commands so browser re-check work can start without a second sweep pass
- a `Playability Risk Packet` helper that groups top-level browser debt into hard blockers, casing risks, and smoke drift so cross-entry verify work can start from one compact action packet
- a `Browser Playability Packet` helper that turns one chosen slug into exact local references, module/import surfaces, proof targets, review guard, and follow-up commands so browser verification stops at the real boot surface instead of a whole-folder rediscovery pass
- a `Smoke Refresh Kickoff` helper that turns the ranked smoke lane into one chosen slug with the boot map, proof targets, and review guard already attached so browser refresh work stops bouncing between list-level triage and per-slug spelunking
- a `Smoke Refresh Pack` helper that turns missing or stale smoke-proof debt into exact proof target patterns plus direct browser re-verification steps so local evidence capture stops wasting time on naming and path rediscovery
- a `Review Freshness Pack` helper that separates missing review rows, blocked review rows, and likely post-edit reflag targets so stale feedback stops leaking into catalog decisions
- a `Quality Scan Pack` helper that ranks fresh-smoke slugs with missing or stale playtest artifacts ahead of entries that still need smoke refresh or boot repair, so cross-entry audit passes start from reusable browser evidence instead of ad hoc slug hunting
- an `Audit Handoff Pack` helper that reads `./.local/playtest-starters/<slug>/` starter payloads, preserves each audit's embedded coverage and claim guardrails, and ranks `audit-ready`, `audit-partial`, or `starter-gap` downstream lanes so focused quality passes stop reopening capture triage by hand
- a `Reconcile Packet` helper that merges queue recommendation, one slug's top local notes, review-freshness guard, and recent Kojima signals into one compact catalog handoff
- a `Maintenance Packet` helper that merges one chosen slug's queue state, local docs or boot debt, smoke proof targets, review-freshness lane, and exact follow-up commands into one per-slug execution packet
- a `Workflow Lane Packet` helper that picks one exact current queue, verify, docs, review, or capture-ready quality lane from repo facts and prints the exact helper commands to run now and next
- one explicit queue recommendation that turns the current snapshot into a single next reconciliation action instead of leaving the operator to infer queue policy from several separate counters, surfaced both in `queue_reconcile.ts` and inside `Reconcile next`
- one exact `Seed Entry Packet` that turns the next pending missing-folder slug into starter paths, browser-first scaffold steps, and follow-up commands
- one exact `Next Catalog Task` packet that converts queue truth plus the selected or explicitly requested slug's local browser, docs, and review-freshness facts into one closure-ready assignment
- one concise durable learning line derived from the same sweep, queue helper, docs pack, verify pack, quality pack, or next-task helper when `--save-learning` is used, so throughput lessons keep accumulating in local skill memory and the repo-local Kojima source of truth instead of disappearing into terminal history

## Guardrails

- This sweep is a cheap preflight, not proof of full playability.
- Queue-only drift is throughput-critical. Missing playable folder for pending or completed record means queue history and repo state disagree before browser testing even starts.
- Duplicate or mixed queue states are also queue drift. If one slug is both pending and completed, clear that ambiguity before closing work against it.
- Untracked playable folders are also queue drift. Reconcile them early so later runs do not keep rediscovering the same hidden candidate.
- Cheap parse failure is enough to fail direct-boot sanity even before a browser run. Fix syntax first, then spend time on deeper playability checks.
- Smoke proof is only local evidence. Use it to prioritize browser checks, not to skip them.
- Treat browser-profile dumps and other unrelated `.local` cache files as noise, not smoke proof. Only evidence-like local artifacts should count.
- In `verify` focus, treat boot blockers as first-class re-verification debt. A browser rerun is wasted if direct boot is already broken on local files.
- Use `verify_pack.ts` after the verify sweep when actual browser work starts. The point is a small ranked handoff, not another broad report.
- Use `playability_risk_packet.ts` when the verify lane is still too broad and the next need is one exact top-level browser triage batch. The point is risk-family grouping, not another full sweep dump.
- Use `browser_playability_packet.ts` once one verify slug is chosen and you need the actual boot surface. The point is exact references, imports, and proof targets for one entry, not another broad lane report.
- Use `smoke_refresh_kickoff.ts` when smoke refresh is the active lane and the next slowdown is jumping from ranked smoke debt into manual per-slug boot discovery. The point is one closure-ready smoke target, not another broad verify summary.
- Use `smoke_refresh_pack.ts` after the smoke lane is known and the next step is saving fresh proof. The point is exact `./.local` targets and direct browser closure, not another broad verify summary.
- In quality prep, require current smoke proof before trusting playtest capture. If browser evidence is stale or missing, refresh it before writing cross-entry audit notes.
- In downstream audit prep, trust the starter payload's embedded coverage guardrails. If the helper says `partial` or `starter-gap`, keep claims narrow or rebuild starters before writing a confident audit note.
- In feedback-driven catalog work, treat `needsAdditionalFeedback: true` as a hard block on using that review for evidence, prioritization, or design direction until fresh input clears it.
- When editing existing files for a slug with a usable review row, reflag that row to `needsAdditionalFeedback: true` before closing the work so later passes do not trust stale player evidence.
- Treat `*-playtest.*` artifacts under `./.local` as reusable evidence only when they are at least as new as the current smoke proof and non-markdown content. Old playtest notes are drift, not proof.
- In `throughput` focus, start with `Closure next` before touching the per-entry issue list. The ranked single-lane batch is the intended throughput shortcut, not just extra summary text.
- If queue drift is already visible, prefer `queue_reconcile.ts` before manual todo edits. One explicit next action is faster and less error-prone than rereading the whole sweep every run.
- Use `seed_next_pending.ts` only when queue truth is already on the fresh-seed lane. The point is one guarded pending-line append, not bypassing pending or drift cleanup.
- Use `seed_entry_packet.ts` only when queue truth already has one pending slug without a playable folder. The point is faster isolated scaffolding, not seeding extra work while another pending run is active.
- Prefer folder-local fixes after the scan; do not turn one broken entry into a repo-wide abstraction.
- Keep markdown high level. Use README notes for player-facing concepts, not code dumps.
- If a README starts listing local source files or stacking many fix-log bullets, compress it back to premise, controls, play path, and one concise note about the loop.
- Use `docs_rewrite_pack.ts` for edit prep, not as an excuse to keep long README history. The point is faster closure, not richer docs diagnostics.
- Use `docs_closeout_pack.ts` when one docs run needs rewrite starter, support-doc handoff, and review-closeout context together. The point is one closure packet, not three helper hops.
- Use `docs_link_pack.ts` when the problem is missing support-doc links across several slugs. The point is batching asset, playtest, or nested-doc handoff work before opening individual folders.
- Use `readme_rewrite_batch.ts` when the lane is already known and several README starters are needed. The point is batch closure, not generating starters for every docs issue in the repo.
- Use `readme_rewrite_starter.ts` only after a slug is chosen. It is an edit starter, not a replacement for reading the actual game's premise and controls.
- Use `readme_doc_handoff.ts` when the slug is already chosen and the next question is where the cut detail should live. The point is faster high-level README cleanup, not turning every folder into a mini wiki or manually spelunking nested docs paths.
- Use `quality_scan_pack.ts` before cross-entry audits when the question is `what can I quality-review next?` The point is to hand off a small capture-ready batch, not to spend browser time rediscovering which slugs already have fresh smoke.
- Use `maintenance_packet.ts` when the slug is already chosen and the work is truly per-entry. The point is one closure packet with exact commands, not another broad lane report.
- Ignore external URLs and browser-built paths; only local repo paths count as sweep failures.
- Do not trust Windows-only existence checks for browser health. The sweep now treats case mismatches as real direct-boot risk.
- Durable learnings should stay short and throughput-oriented. Save why the selected helper or lane matters, not a full issue dump.
- Prefer helper-level learning capture over manual notes. Queue, verify, docs, and next-task runs already know the closure packet; saving that packet immediately cuts rediscovery on the next catalog pass.

## Resources

- `scripts/catalog_sweep.ts`: Local scanner for queue coverage, queue-only drift, README hygiene, cheap boot-syntax sanity, direct-boot breakage, and smoke-proof drift.
- `scripts/throughput_lanes.ts`: Shared focus filters plus compact closure-first, queue, verify, and docs-batch summaries for throughput-first sweep runs.
- `scripts/boot_sanity.ts`: Local parser-backed syntax checks for inline boot scripts and local browser entry scripts.
- `scripts/catalog_candidates.ts`: Queue parser and playable-folder helper that also flags case-sensitive local path risk during direct-boot checks.
- `scripts/readme_hygiene.ts`: Local README heuristics plus concise `docs next` guidance for launch clarity, implementation-heavy doc drift, and patrol-log bloat.
- `scripts/docs_rewrite_pack.ts`: Local docs-batch helper that turns one README rewrite lane into concrete slugs, guidance, and culprit-line evidence for faster batched cleanup.
- `scripts/docs_closeout_pack.ts`: Local docs-closeout helper that merges README starters, support-doc links, related-doc blocks, and inline review guards for one batch or explicit slug list.
- `scripts/docs_link_pack.ts`: Local docs-batch helper that turns support markdown coverage into one linked-versus-unlinked lane with exact per-slug follow-up handoff commands.
- `scripts/readme_rewrite_batch.ts`: Local docs-batch starter helper that consumes the docs-pack lane or explicit slug list and emits several high-level README starters in one pass.
- `scripts/readme_rewrite_starter.ts`: Single-slug docs helper that turns the current README plus docs-pack-style evidence into one high-level rewrite starter with an explicit browser launch line.
- `scripts/readme_doc_handoff.ts`: Single-slug docs helper that inspects support markdown files, including nested asset or docs paths, marks linked versus unlinked support docs, and emits a ready `Related Docs` block for high-level README cleanup.
- `scripts/support_docs.ts`: Shared support-doc collector used by docs-link and per-slug handoff helpers so nested markdown discovery and README link checks stay consistent.
- `scripts/smoke_artifacts.ts`: Local helper that matches root or one-folder-deep `./.local` evidence artifacts against each entry's latest non-markdown content change while ignoring unrelated cache noise.
- `scripts/verify_pack.ts`: Local verify-batch helper that ranks boot blockers before smoke proof drift and emits one small closure-ready browser re-check pack.
- `scripts/playability_risk_packet.ts`: Local cross-entry browser-risk helper that groups top-level folders into hard-blocker, casing-risk, or smoke-drift action packets with exact follow-up commands.
- `scripts/browser_playability_packet.ts`: Single-slug browser helper that maps local references, module/import surfaces, smoke targets, review guard, and follow-up commands for one chosen verify target.
- `scripts/smoke_refresh_pack.ts`: Local smoke-refresh helper that turns missing or stale proof into exact `./.local` evidence target patterns plus direct browser re-verification steps.
- `scripts/smoke_refresh_kickoff.ts`: Local smoke-refresh handoff helper that picks one current smoke target and bundles its boot map, proof targets, review guard, and follow-up commands into one packet.
- `scripts/review_freshness_pack.ts`: Local review-freshness helper that reads queue truth, top-level playable folders, and canonical review semantics to report missing review rows, blocked rows, and likely post-edit reflag targets.
- `scripts/quality_scan_pack.ts`: Local quality-batch helper that ranks fresh-smoke entries missing reusable playtest capture ahead of slugs that still need smoke refresh or boot repair before cross-entry audits.
- `scripts/audit_handoff_pack.ts`: Local downstream-audit helper that reads saved playtest starter payloads, filters by audit lane, and emits exact audit commands plus coverage-aware next steps.
- `../agi-tag-snapshot/scripts/agi_tag_snapshot.ts`: Local AGI/XAG tag snapshot helper that turns playtest evidence into stable downstream tags without mutating source artifacts.
- `scripts/queue_reconcile.ts`: Queue-focused helper that reads `./todo.md` plus top-level playable folders and returns one concrete next reconciliation action.
- `scripts/seed_next_pending.ts`: Queue seeding helper that validates the zero-pending lane, previews one explicit pending record, and can append it safely to `./todo.md`.
- `scripts/seed_entry_packet.ts`: Queue-to-scaffold helper that reads the next pending slug with no playable folder and emits one isolated browser-playable starter packet plus optional durable learning.
- `scripts/seed_entry_scaffold.ts`: Queue scaffold helper that previews or applies only the missing direct-boot starter files for the next pending slug without overwriting existing folder work.
- `scripts/reconcile_packet.ts`: Compact queue handoff helper that merges queue recommendation, one slug's top issue notes, review-freshness guard, and recent Kojima signals into one short packet.
- `scripts/maintenance_packet.ts`: Per-slug execution helper that merges queue state, local docs or boot debt, smoke proof targets, review-freshness state, and exact follow-up commands into one maintenance packet.
- `scripts/dirty_closeout_packet.ts`: Dirty-tree closeout helper that leads with issue-first touched-slug packets, then lists exact review-flag, verify, and maintenance commands for end-of-run closure.
- `scripts/workflow_lane_packet.ts`: Lane picker that reads queue truth, verify debt, README lanes, review freshness, and quality-capture readiness, then emits one exact current lane plus the next exact helper commands.
- `scripts/next_catalog_task.ts`: One-game-at-a-time helper that reads `./todo.md`, top-level playable folder coverage, the selected or explicit slug's local browser and docs signals, and the canonical review-freshness state, then returns one exact next task packet plus an optional durable learning line.
- `scripts/review_freshness_core.ts`: Shared review-freshness loader used by next-task and review-freshness helpers so `needsAdditionalFeedback` guidance stays consistent across queue triage and per-slug execution.
- `scripts/kojima_signals.ts`: Local helper that reads recent sections from `./.agents/assistants/kojima-learnings.md` and distills a few reusable bullets for sweep and next-task output.
- `scripts/learning_capture.ts`: Shared durable-learning writer used by sweep, queue, verify, review-freshness, quality, docs, and next-task helpers so catalog-throughput lessons land in both skill-local memory and repo-local Kojima memory without duplicated append logic.
