# OpenAI CLI Provider Notes

The MVP integrates through the OpenAI CLI path only.

The backend should:

- treat model ids as data, not command text
- use a single adapter boundary for CLI invocation
- keep all command construction template-driven
- avoid arbitrary shell execution
- return structured failures when the CLI is unavailable or returns invalid output

If the installed OpenAI CLI syntax changes in the future, only the adapter boundary should need adjustment.

