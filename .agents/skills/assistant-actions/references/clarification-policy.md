# Clarification Policy

Ask when a mutation could hit the wrong assistant, wrong project, wrong schedule, or wrong job.

## Must Ask

- Assistant name/id missing and more than one assistant exists.
- Assistant name matches multiple assistants.
- Project target missing for global assistant project work.
- Schedule missing for job creation.
- Job name matches multiple assistant-owned jobs.
- Todo/question reference matches multiple rows.
- Recovery request could resume a circuit-tripped assistant without fixing cause.

## Do Not Ask

- Exact assistant id matches.
- Exact assistant name is unique in the current project.
- User asks read-only state and the state script finds a unique assistant.
- No rows exist for the requested state; report empty state.

## Answer Format

Use one concise question. Include the resolved candidates and recommend the safest option.
