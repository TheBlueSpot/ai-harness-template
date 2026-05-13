---
name: analyze-pr
description: Audit a git branch or commit from a senior/staff engineering review perspective without changing code. Use when the user asks to analyze, review, compare, or assess a remote branch, local branch, PR branch, or commit hash for code quality, glaring bugs, duplicated work, merge impact, or whether the current branch already handles the same behavior.
---

# Analyze PR

Review a branch or commit as code, not as intent. Prefer direct git object inspection over checkout. Keep the current worktree untouched unless the user explicitly asks for changes.

## Inputs

Accept:

- Remote branch: `origin/name`, `NDO/foo`, `feature/foo`
- Local branch: `branch-name`
- Commit hash: short or full SHA
- Optional base: if user gives one, use it; otherwise use merge-base with current `HEAD` or the remote tracking base that makes sense from context

If target is ambiguous, discover candidates first:

```powershell
git branch --all --list "*<name>*"
git rev-parse --verify <target>
```

Fetch remote targets before review when target names a remote branch or could be stale:

```powershell
git fetch origin <branch>
```

## Workflow

1. Preserve current worktree.
   - Start with `git status --short --branch`.
   - Do not checkout target in the main worktree.
   - Use `git show`, `git diff`, `git grep`, and `git merge-tree`.

2. Identify review shape.
   - For commit: compare `<sha>^..<sha>`.
   - For branch: compare `<base>...<branch>`, where base is `git merge-base <base-ref> <branch>`.
   - Record commit count, touched paths, and summary:

```powershell
git show --stat --oneline <commit>
git diff --name-status <base>...<branch>
git log --oneline <base>..<branch>
git diff --check <base>...<branch>
```

3. Read the actual diff.
   - Start broad with `--stat` and `--name-status`.
   - Then read focused diffs with enough context:

```powershell
git diff --unified=80 <range> -- <paths>
git show --unified=80 <commit> -- <paths>
```

4. Inspect surrounding code only where needed.
   - Use `git show <target>:<path>` for target-side files.
   - Use `Get-Content <path>` for current worktree files.
   - Use `rg` or `git grep` to find call sites, schemas, tests, and duplicate behavior.

5. Compare with current branch/worktree.
   - Search current code for the concepts introduced by target, not only exact names.
   - Inspect local diffs for touched paths:

```powershell
rg -n "<new-symbol>|<behavior-keyword>" <paths>
git diff --name-status HEAD -- <paths>
git diff --unified=80 -- <paths>
git diff --name-status HEAD..<target>
git merge-tree $(git merge-base HEAD <target>) HEAD <target> | Select-String -Pattern '<<<<<<<|changed in both|CONFLICT'
```

   - Classify overlap:
     - `missing`: current branch lacks target behavior.
     - `duplicated`: current branch implements same user-visible behavior.
     - `superseded`: current branch implements broader/cleaner behavior.
     - `conflicting`: target would regress or fight current behavior.

6. Verify when useful.
   - Prefer BranchFS when verifying the current dirty branch, duplicated local behavior, dev-server behavior, screenshots, or commands that may write `.local/`, logs, DB files, caches, or temp artifacts. BranchFS is faster than a fresh git worktree when the command should see current uncommitted edits because it materializes the dirty workspace and symlinks existing `node_modules`.
   - Do not use BranchFS as the primary way to inspect an arbitrary target branch/commit: the mount excludes `.git`, so it is not a checkout target. Use git object reads or a detached git worktree for target-side tests.
   - For current-branch verification in this repository, use the existing screenshot script or BranchFS-backed harness commands when appropriate:

```powershell
bun.cmd run screenshot
```

   - For custom BranchFS test/smoke runs, create a one-shot BranchFS lease from a small script or existing harness tooling, run the command with `cwd = lease.projectMountPath`, pass `HARNESS_PORT=0` for servers, then always discard the lease. Do not flush review experiments.
   - Use BranchFS especially when:
     - current worktree is dirty but local behavior needs focused tests;
     - target likely duplicates current work and you need quick proof current behavior already passes;
     - UI/dev-server smoke would create or mutate `.local/harness.db`;
     - several independent smoke runs need isolated DB/log state without repeated dependency installs.
   - Use a temp detached git worktree when the target itself must be executed:

```powershell
$tmp = Join-Path $env:TEMP "<review-name>"
git worktree add --detach $tmp <target>
bun.cmd install
bun.cmd test <focused-tests>
bun.cmd run typecheck
```

   - Run focused tests first. Add `bun.cmd run build:ui` for UI/build-risk changes and `bun.cmd run lint:tailwind` for UI class changes when available.
   - If full suite times out, report timeout and rely only on completed checks.
   - Clean up temp worktree or BranchFS lease. If Windows locks files, stop only processes started for that worktree/mount, then remove. Do not kill unrelated dev servers.

7. Judge code quality.
   - Prioritize correctness, regressions, boundary validation, data migration/persistence, concurrency, stale state, UI accessibility, and test coverage.
   - For harness files, apply harness conventions: typed websocket contracts, zod at boundaries, Bun commands, local-first persistence, shared UI primitives, compact UI, and focused tests.
   - Distinguish blocker findings from minor style nits.

## Output

Use code-review stance. Lead with findings.

Recommended shape:

- `Findings:` numbered by severity, with file/line refs when available.
- `Quality:` concise staff-level judgment.
- `Impact on current branch:` whether current branch lacks, duplicates, supersedes, or conflicts with target.
- `Verification:` exact commands run and pass/fail/blocked status.
- `Recommendation:` merge, skip, cherry-pick partially, or prefer current implementation.

If no bugs found, say that directly and name residual risks.

Keep branch/commit analysis non-destructive and terse. Do not over-index on commit message quality; judge behavior and integration risk.
