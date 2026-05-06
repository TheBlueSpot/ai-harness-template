---
name: agi-tag-snapshot
description: Build a compact AGI/XAG-aligned tag snapshot from playtest evidence JSON or markdown-derived observations, preserving provenance and confidence notes for later audit handoff.
---

# AGI Tag Snapshot

## Overview

Use this skill when one playtest evidence bundle needs to be translated into a stable tag snapshot for later audit or handoff work.

The helper reads JSON evidence directly or extracts a JSON observation block from markdown, then classifies the evidence into AGI/XAG-aligned tags for input and visual surfaces. It keeps evidence provenance, confidence, and claim notes intact and writes a new report without mutating the source artifact.

## What It Produces

- stable tags for input, visual, pacing, restart, recovery, and cue readability
- provenance notes that point back to the source artifact and captured fields
- confidence and claim notes so later operators know how far to trust each tag
- JSON output plus a readable summary

## Commands

Print the template and expected input shape:

```powershell
bun.cmd .agents/skills/agi-tag-snapshot/scripts/agi_tag_snapshot.ts --template
```

Build a snapshot from a JSON evidence file:

```powershell
bun.cmd .agents/skills/agi-tag-snapshot/scripts/agi_tag_snapshot.ts --observations ".local/playtest-session.json" --json-out ".local/playtest-session-agi-tags.json"
```

Build a snapshot from a markdown report that contains an observation JSON block:

```powershell
bun.cmd .agents/skills/agi-tag-snapshot/scripts/agi_tag_snapshot.ts --observations "game/playtest-evidence.md" --json-out ".local/game-agi-tags.json"
```

## Input Shape

Use the existing playtest observation structure as the source of truth. The helper expects the same session fields already produced by playtest capture, then reads them as a stable input bundle for AGI/XAG tagging.

## Output Shape

- `AgiSnapshotReport`
- `AgiSnapshotTag[]`
- source provenance, confidence, and claim notes
- summary counts for input and visual surfaces

## Sources

- `./.agents/skills/playtest-evidence-capture/SKILL.md`
- `./.agents/skills/catalog-sweep/SKILL.md`

