# Operation Handoffs

Use this as the canonical bridge from project chat intent to harness action. If a branch doc conflicts with this table, this table wins.

## State Lookup

Always verify state before answering status or after a mutation:

```powershell
bun.cmd .agents/skills/assistant-actions/scripts/assistant-state.ts --assistant "<name-or-id>" --project "<project-name-or-id>" --limit 10
```

Use `--json` when another script or automation needs the result.

For destructive assistant maintenance, dry-run before `--execute`:

```powershell
bun.cmd .agents/skills/assistant-actions/scripts/assistant-maintenance.ts --action remove-jobs --assistant "<name-or-id>" --project "<project-name-or-id>"
```

## Project-Chat Handoffs

| User intent | Accepted project-chat shape | Harness action | Required fields | Verify by reading |
|---|---|---|---|---|
| Create assistant | `create a project assistant named <name> to <purpose>` | `assistant.create` through the project-chat create flow | name, scope, purpose | assistant row, bootstrap state, created card |
| Update assistant | UI edit or explicit update request naming a field | `assistant.update` | assistant id, changed field values | assistant row, updated card/log |
| Clone assistant | `clone <assistant> to this project` | `assistant.clone-to-project` or project-chat `clone` action | source assistant id, destination project id | cloned assistant row, clone origin |
| Direct chat | `ask <assistant> <message>` or `<assistant> <work request>` | `assistant.chat.send` or project-chat `chat` action | assistant id, message | assistant messages and logs |
| Inspect state | `ask <assistant> status` or `what has <assistant> queued/open/learned/logged` | `assistant.inspect` or state script | assistant id, optional project id | state script output |
| Remember guidance | `ask <assistant> remember this: <guidance>` | `assistant.chat.send`, then reprioritize may persist `newLearnings` | assistant id, guidance | assistant message, reprioritize log, new learning if produced |
| List jobs | `hey <assistant> what jobs do you have queued` | project-chat `list-jobs` action | assistant id | `backgroundJobs`, `backgroundJobRuns` |
| Create job | `schedule <assistant> to <job prompt> every <schedule>` | project-chat `create-job` action | assistant id, project id, job prompt, schedule | enabled job, next run time |
| Run job now | `run <assistant> job now` | project-chat `run-job` action | assistant id, one matching job id | queued job run |
| Start all assistant jobs | `start all jobs for <assistant>` or `start all assistant jobs for this project` | maintenance script `--action start-jobs`, then live `bulk-operation.apply` with `run-now` | assistant subset or project id, harness URL when executing | new `backgroundJobRuns` |
| Remove assistant jobs | `remove all jobs for <assistant>` | maintenance script `--action remove-jobs` | assistant id, optional project id | empty `backgroundJobs` |
| Remove project assistants | `remove all assistants for this project` | maintenance script `--action remove-project-assistants` | project id | no active project-scoped assistants |
| Pause assistant | `pause <assistant>` | `assistant.pause` or project-chat `pause` action | assistant id | run state `paused` |
| Pause assistants subset | `pause all assistants for this project` or `pause <assistant> and <assistant>` | maintenance script `--action pause-assistants` | assistant subset, project id, or explicit `--all` | run state `paused` for matched assistants |
| Resume assistant | `resume <assistant>` | `assistant.resume` or project-chat `resume` action | assistant id | run state `active`, reprioritize log unless globally paused |
| Resume assistants subset | `resume all assistants for this project` or `resume <assistant> and <assistant>` | maintenance script `--action resume-assistants` | assistant subset, project id, or explicit `--all` | run state `active` for matched assistants |
| Retry bootstrap | assistant card `Retry bootstrap` | `assistant.bootstrap.retry` | assistant id | bootstrap state and latest bootstrap log |
| Rebootstrap assistant(s) | `rebootstrap <assistant>` or `rebootstrap assistants for this project` | maintenance script `--action rebootstrap`, then live retry if immediate execution is needed | assistant id or project id | bootstrap state `pending` or subsequent bootstrap log |
| Recover breaker | assistant card `Retry` on failure | `assistant.circuit-breaker.retry` | assistant id | breaker closed, run state active, retry log |
| Answer question | `answer <assistant>'s question: <answer>` | `assistant.question.answer` or project-chat `answer-question` action | assistant id, question id, answer | question answered, linked work unblocked |
| Update todo | `mark <assistant> todo "<title>" done` | `assistant.todo.update` or project-chat `update-todo` action | assistant id, todo id, new state | todo state, reprioritize log |
| Reorder todos | Assistants surface reorder control | `assistant.todo.reorder` | assistant id, ordered todo ids | todo sort order |
| Pause job | Jobs surface pause control | `background-job.pause` | project id, job id | job status `paused` |
| Resume job | Jobs surface resume control | `background-job.resume` | project id, job id | job status `enabled`, next run time |

## Manual Job Creation Contract

When creating an assistant-owned job from project chat, use this exact shape:

```text
schedule <assistant name> to <one clear job prompt> every <interval, datetime, or cron text>
```

Example:

```text
schedule Kojima to research one arcade-game design topic and save durable learnings every 15m
```

Expected result:

- One enabled `ai-routine` background job linked to the assistant.
- One automation thread for that job.
- `scheduleInput` equals the user schedule text.
- `nextRunAt` is present for recurring schedules.
- Output appears as assistant/job state, not normal project-chat narrative unless explicitly promoted.

## Stop Conditions

Do not hand off a mutation when:

- Assistant target is ambiguous.
- Global assistant needs project work but no project is known.
- Job creation lacks schedule or one-shot intent.
- Job run request matches more than one enabled job.
- Recovery would retry a breaker without addressing a human-correctable cause.
