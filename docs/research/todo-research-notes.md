# Todo Research Notes

## External Evidence By Pending Item

- `Engine Package Priorities`: Current package expectations for TypeScript libraries center on explicit `exports`, accurate declaration files, and artifact-level consumer checks. Node documents subpath exports as the package boundary, TypeScript documents declaration output as the consumer contract, Vite documents `?url` asset imports for stable browser asset hosting, and MDN documents `WebAssembly.instantiateStreaming` as MIME-sensitive enough to require fallback handling.
  - Evidence: [Node.js package entry points](https://nodejs.org/api/packages.html#package-entry-points), [TypeScript declaration files](https://www.typescriptlang.org/docs/handbook/declaration-files/introduction.html), [Vite static asset handling](https://vite.dev/guide/assets.html), [MDN WebAssembly.instantiateStreaming](https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/instantiateStreaming_static)
  - Prioritization effect: keeps export-surface audit and packed-consumer proof above new primitives; keeps WASM loading narrow, diagnosable, and fallback-first.

- `Background Runs`: Cursor now treats background agents as a first-class remote async workflow with status, follow-up, handoff, isolated machines, and web/mobile access. That makes artifact-first remote review and recovery feel like a live market pattern, not a speculative bet.
  - Evidence: [Cursor Background Agents](https://docs.cursor.com/en/background-agents), [Cursor Web & Mobile](https://docs.cursor.com/background-agent/web-and-mobile)
  - Prioritization effect: raises the value of inbox-style review, trust summaries, and resumable background work.

- `Remote Targets`: Cursor background agents run in isolated Ubuntu machines and support repo handoff through GitHub branches, while the web/mobile surface exists specifically for checking status and taking over remotely. That suggests remote-target support should stay explicit and capability-aware, not buried behind generic shell abstraction.
  - Evidence: [Cursor Background Agents](https://docs.cursor.com/en/background-agents)
  - Prioritization effect: increases urgency for clear target capability labels and safe reconnect flows.

- `Provider Portability`: Kilo Code documents an MCP marketplace and a discover/install flow for MCP servers, which signals that tool breadth is becoming a visible buying criterion. Portability still matters, but only if tool and capability discovery stays honest.
  - Evidence: [Using MCP in Kilo Code](https://kilo.ai/docs/features/mcp/using-mcp-in-kilo-code)
  - Prioritization effect: supports keeping provider choice secondary to visible tool health and readiness.

- `Memory And Skill Platform`: The same Kilo material shows MCP servers and skills surfacing through a marketplace model. That makes governed skills and reusable playbooks more credible as a product layer, but only if source, freshness, and trust are visible.
  - Evidence: [Using MCP in Kilo Code](https://kilo.ai/docs/features/mcp/using-mcp-in-kilo-code)
  - Prioritization effect: supports explicit provenance and allowlists before broader automation reuse.

- `Usage And Quota Visibility`: Cursor's background-agent docs expose pricing and privacy implications directly alongside execution. That is a market signal that cost state and trust state belong near execution, not hidden in account settings.
  - Evidence: [Cursor Background Agents](https://docs.cursor.com/en/background-agents)
  - Prioritization effect: strengthens visible usage, quota, and risk summaries before long runs.

- `Run Ledgers And Proof Bundles`: Current agent products are converging on durable run evidence, but public pain still clusters around stuck states and missing recovery affordances. Cursor documents cloud-agent artifacts, remote desktop control, spend limits, troubleshooting, hooks, MCP, and managed or self-hosted runtimes; Kilo cloud agents auto-create branches and push work during remote sessions; OpenHands users are asking for reviewer-facing evidence gates; Kilo and Cline issue queues show stuck-agent, terminal, checkpoint, and cancel-path pain.
  - Evidence: [Cursor Cloud Agents](https://cursor.com/docs/cloud-agent), [Cursor Cloud Agent setup](https://cursor.com/docs/cloud-agent/setup.md), [Kilo Cloud Agent](https://kilo.ai/docs/code-with-ai/platforms/cloud-agent/), [OpenHands evidence-gate request](https://github.com/OpenHands/OpenHands/issues/14857), [Kilo stuck issue](https://github.com/Kilo-Org/kilocode/issues/7742), [Kilo stop-button request](https://github.com/Kilo-Org/kilocode/issues/7862), [Cline stuck issue](https://github.com/cline/cline/issues/10031)
  - Prioritization effect: raises run ledger, proof bundle, heartbeat, stop/cancel, stale-run detection, and retry/resume work above broad runtime expansion.

- `Target Capability And Tool Health`: Cloud, worktree, container, and local targets differ in secrets, MCP auth, hooks, browser, terminal, network, and artifact behavior. Cursor's cloud-agent docs explicitly call out environment setup, snapshots, secrets, hooks, MCP, artifacts, billing, and troubleshooting; Cursor forum reports show MCP auth breaking in new worktree agents and terminal commands hanging on some Windows environments; OpenHands issue signals show sandbox preview and runtime image expectations.
  - Evidence: [Cursor Cloud Agent setup](https://cursor.com/docs/cloud-agent/setup.md), [Cursor MCP worktree auth thread](https://forum.cursor.com/t/mcp-servers-are-not-enabled-authenticated-in-new-worktree-agents-oauth-making-worktrees-impractical/159989), [Cursor terminal hang thread](https://forum.cursor.com/t/run-terminal-command-hangs-interactive-terminal-works-fine/160409), [OpenHands sandbox preview issue](https://github.com/OpenHands/OpenHands/issues/14831), [OpenHands runtime image issue](https://github.com/OpenHands/OpenHands/issues/8845)
  - Prioritization effect: supports a target capability matrix and preflight health checks before adding more target types or MCP breadth.

- `Context, Rules, Memory, And Skills`: Serious users are mixing Cursor, Claude Code, Codex, Aider, Cline, and other tools, so context portability and governance are becoming product problems. Cursor forum discussion points to repo markdown, rules, memory servers, and tool-specific context stores as a recurring friction area; Hermes exposes persistent memory, skills, cron jobs, sessions, profiles, gateways, multiple terminal backends, and logs as explicit configuration assets; Claude Code docs position instructions, memory, skills, hooks, MCP, permissions, and multiple surfaces as core; Aider issues include dynamic context lifecycle and large-context token problems.
  - Evidence: [Cursor cross-tool context thread](https://forum.cursor.com/t/how-are-people-handling-context-across-different-ai-coding-tools/159891), [Hermes configuration](https://hermes-agent.nousresearch.com/docs/user-guide/configuration), [Hermes sessions](https://hermes-agent.nousresearch.com/docs/user-guide/sessions), [Claude Code overview](https://docs.anthropic.com/en/docs/claude-code/overview), [Aider dynamic context issue](https://github.com/Aider-AI/aider/issues/5071), [Aider large-context issue](https://github.com/Aider-AI/aider/issues/3948)
  - Prioritization effect: keeps governed memory, reusable skills, source/freshness metadata, hit history, and pin/expire controls high, while avoiding opaque auto-memory.

- `Checkpoint And Rollback`: Kilo documents checkpoint restore as a user-facing recovery flow, including a dedicated snapshot repository outside the project and message-level restore behavior. Public Kilo and Cline issues still report checkpoint regressions or broken revert behavior, so restore should remain narrow and proof-backed until reliability is strong.
  - Evidence: [Kilo Checkpoints](https://kilo.ai/docs/features/checkpoints/), [Kilo revert issue](https://github.com/Kilo-Org/kilocode/issues/8777), [Cline checkpoint issue](https://github.com/cline/cline/issues/4388)
  - Prioritization effect: keeps checkpoint restore behind git safety, storage bounds, clear compare states, and durable run evidence.

## Skill And Knowledge Gaps

- Engine migrated-consumer evidence: need real game migration data before expanding root primitives or tightening benchmark thresholds. Without migrated hot paths, export growth risks looking elegant while carrying dead API weight.
- Engine artifact proof discipline: need release checks that start from the packed package rather than source files so declaration, export, and WASM hosting problems cannot hide behind local path imports.
- Background-agent ops design: need stronger expertise in remote-run lifecycle, takeover handoff, and stale-run recovery. Without that, the queue may over-rank features that look good in a doc but fail in a real resume flow.
- MCP ecosystem coverage: need current breadth data on which tool families users actually expect first, because the marketplace signal alone does not tell us which missing tools block adoption most.
- Provider economics: need sharper knowledge of real quota, pricing, and failure patterns across the main backends. That matters because portability is only useful if failover can happen before user trust breaks.
- Remote-target capability matrix: need clearer evidence on what local, WSL, SSH, and headless targets can safely expose without turning the product into a generic remote shell. That matters for scope control.
- Skill governance model: need more concrete references for how users want skills installed, updated, trusted, and revoked. That matters because reusable automation can become a trust hazard if freshness and source are vague.
