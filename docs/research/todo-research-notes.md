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

- `Usage And Quota Visibility`: Cursor’s background-agent docs expose pricing and privacy implications directly alongside execution. That is a market signal that cost state and trust state belong near execution, not hidden in account settings.
  - Evidence: [Cursor Background Agents](https://docs.cursor.com/en/background-agents)
  - Prioritization effect: strengthens visible usage, quota, and risk summaries before long runs.

## Skill And Knowledge Gaps

- Engine migrated-consumer evidence: need real game migration data before expanding root primitives or tightening benchmark thresholds. Without migrated hot paths, export growth risks looking elegant while carrying dead API weight.
- Engine artifact proof discipline: need release checks that start from the packed package rather than source files so declaration, export, and WASM hosting problems cannot hide behind local path imports.
- Background-agent ops design: need stronger expertise in remote-run lifecycle, takeover handoff, and stale-run recovery. Without that, the queue may over-rank features that look good in a doc but fail in a real resume flow.
- MCP ecosystem coverage: need current breadth data on which tool families users actually expect first, because the marketplace signal alone does not tell us which missing tools block adoption most.
- Provider economics: need sharper knowledge of real quota, pricing, and failure patterns across the main backends. That matters because portability is only useful if failover can happen before user trust breaks.
- Remote-target capability matrix: need clearer evidence on what local, WSL, SSH, and headless targets can safely expose without turning the product into a generic remote shell. That matters for scope control.
- Skill governance model: need more concrete references for how users want skills installed, updated, trusted, and revoked. That matters because reusable automation can become a trust hazard if freshness and source are vague.
