# Recovery

Use for paused assistants, bootstrap failures, repeated job failures, and circuit breakers.

## Pause And Resume

Flow:

1. Resolve assistant.
2. Pause or resume only the matched assistant.
3. On resume, release pending reprioritize work unless global execution remains paused.
4. Report pending questions or failed jobs that still need attention.

## Bootstrap Retry

Flow:

1. Resolve assistant.
2. Check global execution pause.
3. Reject if assistant is deleted or circuit-tripped unless user explicitly asks to recover.
4. Retry bootstrap as a single-flight operation.
5. Report success, failure, and created initial todos.

## Circuit Breaker

Flow:

1. Inspect critical logs and pending assistant questions.
2. Explain latest failure and failure streak.
3. In the UI, open `Inspect failure` from the assistant card to view breaker reason, latest logs, latest assistant-owned job runs, and pending questions.
4. Use `Retry` to send `assistant.circuit-breaker.retry`; this clears the breaker, resumes the assistant, then retries bootstrap or schedules reprioritize.
5. Ask user whether to edit config or keep paused only when the failure reason needs human correction before retry.

## Scheduler Safety

Assistant-owned jobs must use the same launch gate as direct assistant chat: global pause, assistant pause, deleted state, circuit breaker, and project ownership.
