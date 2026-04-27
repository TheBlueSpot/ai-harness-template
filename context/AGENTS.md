# Agent Rules

These rules define how AI contributors should work in this game-catalog repository.

- Start all conversations in `/caveman ultra`.
- Always clarify ambiguous tasks before making shared or structural changes.
- Start from catalog mindset. This repo is a collection of game entries, not one unified app.
- Treat each top-level game folder as an independent item unless shared docs say otherwise.
- Preserve direct browser playability where an entry already has it.
- Avoid cross-game coupling, shared abstractions, or repo-wide refactors unless multiple entries clearly need same structure.
- Keep game-specific notes, assets, and implementation detail inside the game's own folder.
- Keep markdown high-level. Prefer concepts and links to other markdown docs over code-heavy explanation.
- Always store repo-local Codex skills in the generic `.agents/skills/` folder, not provider-specific directories, unless the user explicitly asks otherwise.
- Keep skill-specific helpers and support files under that generic `.agents/skills/<skill-name>/` tree unless the user explicitly asks for another layout.
- Use TypeScript for helper, automation, downloader, and skill scripts across the entire repository.
- Do not add new Python scripts. If a legacy Python workflow appears, migrate it to TypeScript before extending or shipping it.
- Prefer Bun for local TypeScript script execution. If `bun.ps1` is blocked by PowerShell execution policy, use `bun.cmd`.
- Update root docs only for shared rules, catalog navigation, or meaningful structural changes.
- When adding or renaming a game, keep naming consistent with existing kebab-case folder style.
- If a task is ambiguous about whether a change is local or shared, ask before restructuring multiple entries.
- Do not make edits to the harness.
