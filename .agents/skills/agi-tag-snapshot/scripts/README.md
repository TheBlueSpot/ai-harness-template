# AGI Tag Snapshot

This helper turns playtest evidence into a compact AGI/XAG tag snapshot.

Use it when you already have one observation file or one markdown report and you want a reusable tag summary without editing the source evidence.

## Inputs

- `--observations <path>`: JSON evidence file or markdown report with a fenced JSON observation block.
- `--json-out <path>`: optional JSON output path.
- `--text-out <path>`: optional readable summary output path.
- `--template`: print the expected input and output shape.

## Outputs

- `AgiSnapshotReport` JSON
- readable summary text
- stable tags with provenance, confidence, and claim notes

