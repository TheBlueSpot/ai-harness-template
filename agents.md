# Agents Rules

These rules are hard requirements for this repository.

- Use Bun latest syntax for scripts, tests, and generated files.
- Keep filenames and directories in kebab-case.
- Treat `/context` as the searchable reference source for project knowledge.
- Keep the MVP OpenAI-only unless the repository is explicitly expanded later.
- Never execute raw shell commands from websocket input.
- Prefer explicit typed contracts over ad hoc string commands.
- Fail fast on invalid input, malformed payloads, and unexpected message types.
- Keep development local-first.
- Keep chat history in memory for the current run only unless persistence is added later.
- Keep command handling behind a narrow, typed bridge.
- Do not place code examples in this file.
- The project internals should always be in either bun typescript (or lower level code like c++ for extreme performance wins)
- Always clarify any ambiguous tasks. Never make assumptions.
- Make sure developer builds have toggleable world class debugging logging
- After finishing a task locate the nearest readme.md and update it as needed. if one does not exist create it
- MD files should contain as little references to code and more high level concepts and links to other MD files.