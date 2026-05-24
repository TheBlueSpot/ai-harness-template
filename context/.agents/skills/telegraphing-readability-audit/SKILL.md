---
name: telegraphing-readability-audit
description: Review browser-game telegraph legibility, early-response windows, future-path readability, and competing must-read cues. Use when Codex needs a focused pass on whether threats, prompts, windups, dodge paths, or other reaction cues are readable under motion and pressure.
---

# Telegraphing Readability Audit

Use this skill when a browser game needs a focused read on telegraph legibility, early-response windows, and future-path readability.

## Input

The CLI reads a JSON observation file shaped like the shared playtest starter. The file may be a raw starter object or a smaller telegraph-focused slice.

### Observation Schema

Required focus:

- `telegraphCues`: list of cue observations for threats, prompts, windups, dodge paths, and other must-read signals
- `stressFrames`: list of moments where motion, clutter, or overlap may hide a cue
- `competitionMoments`: list of moments where more than one signal asks for attention at once
- `resumeProbes`: list of interruption or return-to-play probes if the cue must survive a break

Helpful fields:

- `mode`
- `sampledRuns`
- `sampledBusyFrames`
- `sampledContacts`
- `sampledResumeProbes`
- `notes`

### Cue Observation Shape

Each entry should include as much of this as is known:

- `name`
- `importance`
- `nearAction`
- `telegraphReadable`
- `requiredResponseObvious`
- `futurePathVisible`
- `contrastStable`
- `readableUnderMotion`
- `motionDistraction`
- `signalChannels`
- `reliesOnColorAlone`
- `reliesOnAudioAlone`
- `notes`

### Output Sections

The generated audit markdown should always include:

- source summary
- blocker findings
- major findings
- minor findings
- cue-by-cue notes
- durable learning

## Command

```bash
bun .agents/skills/telegraphing-readability-audit/scripts/telegraphing_readability_audit.ts --observations path/to/observations.json
```

Optional template output:

```bash
bun .agents/skills/telegraphing-readability-audit/scripts/telegraphing_readability_audit.ts --template --observations path/to/observations.json
```

Write to a file:

```bash
bun .agents/skills/telegraphing-readability-audit/scripts/telegraphing_readability_audit.ts --observations path/to/observations.json --out audit.md
```

## Contract

- Keep the audit centered on telegraph legibility, response timing, and path readability.
- Do not drift into broad HUD or pacing prose unless it directly affects cue recognition.
- Treat blocker findings as the first visible section in the rendered report.
