# Assistant Selection

Use deterministic resolution before invoking a model or making a mutation.

## Resolution Order

1. Exact assistant id.
2. Exact assistant name in current project.
3. Exact global assistant name.
4. Single case-insensitive name match across visible assistants.
5. Single fuzzy name match only if it is unambiguous.
6. Ask for clarification.

## Project Scope

- Project assistant: prefer current project unless user names another project.
- Global assistant: allow state questions anywhere; require target project before project work or job creation.
- Clone requests: source may be global or another project; destination must be explicit or current project.

## Ambiguity Cases

Ask before acting when:

- Multiple assistants share the same name.
- User says `assistant` without a name and more than one assistant is visible.
- User asks a project mutation for a global assistant without destination project.
- User asks job creation without schedule or one-shot intent.
- User asks to recover a circuit-tripped assistant without saying whether to retry or only inspect.

## Clarification Shape

Use short options with one recommended path. Include assistant name, scope, and project label in each option.
