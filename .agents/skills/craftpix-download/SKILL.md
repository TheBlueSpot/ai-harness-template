---
name: craftpix-download
description: Download Craftpix asset archives from craftpix.net by reusing an exported browser cookie file instead of interactive login. Use when Codex needs to pull free or premium Craftpix packs into a specific game folder, resolve a Craftpix product page to its download endpoint, or work from a Google OAuth-backed Craftpix session without browser automation.
---

# Craftpix Download

## Overview

Use this skill to fetch Craftpix archives into a game-local folder with a saved browser session. Keep the cookie export local, prefer product page URLs as input, and store downloaded packs near the game that uses them. Use the batch plan helper when several queued catalog entries need assets in one sweep.

## Workflow

1. Keep repo-local skills in the generic `.agents/skills` tree.
2. Store the Craftpix cookie export at `.local/craftpix/cookies.txt`, or point `CRAFTPIX_COOKIE_FILE` at another local file.
3. Export cookies in Netscape/Mozilla cookie-jar format. Read [references/cookies.md](references/cookies.md) when you need export or auth guidance.
4. Download into a game-local path such as `<game>/assets/source/craftpix/` instead of the repo root.
5. Prefer the public Craftpix product/freebie page URL. The helper extracts `product_ID` from the page and resolves the endpoint as `https://craftpix.net/download/<product_id>/`.
6. Pass `--subitem <id>` only when the product exposes an alternate package such as a Unity sub-download.
7. After download, unpack and curate only the files the game needs. Keep attribution or pack notes with that game entry.
8. If you need several packs across the queue, write a small local JSON plan and run the batch helper so paths and cookie reuse stay consistent.

## Commands

Resolve the current download URL without writing a file:

```powershell
bun .agents/skills/craftpix-download/scripts/download_asset.ts `
  "https://craftpix.net/freebies/free-tower-defense-2d-vector-tileset/" `
  --resolve-only
```

Download a pack into one game folder:

```powershell
bun .agents/skills/craftpix-download/scripts/download_asset.ts `
  "https://craftpix.net/freebies/free-tower-defense-2d-vector-tileset/" `
  --output-dir "velocity-grind/assets/source/craftpix"
```

Override the cookie file for one run:

```powershell
bun .agents/skills/craftpix-download/scripts/download_asset.ts `
  "https://craftpix.net/freebies/free-tower-defense-2d-vector-tileset/" `
  --cookie-file "C:/Users/you/secure/craftpix.cookies.txt" `
  --output-dir "velocity-grind/assets/source/craftpix"
```

Download a specific alternate subitem:

```powershell
bun .agents/skills/craftpix-download/scripts/download_asset.ts `
  "https://craftpix.net/product/some-pack/" `
  --subitem unity `
  --output-dir "some-game/assets/source/craftpix"
```

Resolve or download several queued packs from one local plan:

```powershell
bun .agents/skills/craftpix-download/scripts/download_plan.ts `
  ".local/craftpix/queue-plan.json" `
  --continue-on-error
```

Example plan shape:

```json
{
  "defaults": {
    "cookieFile": ".local/craftpix/cookies.txt",
    "timeout": 60
  },
  "downloads": [
    {
      "sourceUrl": "https://craftpix.net/product/machine-mobile-ui/",
      "outputDir": "velocity-grind/assets/source/craftpix"
    },
    {
      "sourceUrl": "https://craftpix.net/product/some-pack/",
      "subitem": "unity",
      "outputDir": "some-game/assets/source/craftpix"
    }
  ]
}
```

## Guardrails

- Never commit cookie exports or other session secrets.
- Treat download failures that return HTML as an auth problem first; refresh the cookie export before changing the script.
- Do not create shared asset buckets unless the user explicitly wants cross-game sharing.
- Keep batch plans local and game-scoped. A plan is for queue throughput, not a new shared asset system.
- Keep root markdown high-level; game-specific asset notes belong in the game folder that consumes them.

## Resources

- `scripts/download_asset.ts`: Resolve one Craftpix product page to a download endpoint and stream the archive to disk with Bun.
- `scripts/download_plan.ts`: Run a local JSON plan for multi-game asset sweeps with shared defaults and optional continue-on-error handling.
- [references/cookies.md](references/cookies.md): Cookie file location, format, and auth troubleshooting.
