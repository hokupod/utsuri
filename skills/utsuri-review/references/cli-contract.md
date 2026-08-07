# CLI contract

## Invocation

Invoke the committed bundle with native Node 22 or newer:

```bash
node "${PLUGIN_ROOT}/skills/utsuri-review/scripts/utsuri.mjs" <command> [arguments]
```

Use `--json` for a single JSON result and `--ndjson` only on commands that explicitly support event streams. Machine output is written to stdout; diagnostics are written to stderr.

## Exit codes

| Code | Meaning                                |
| ---: | -------------------------------------- |
|    0 | Success                                |
|    2 | Invalid usage or configuration         |
|    3 | Git collection failure                 |
|    4 | Runtime or capture failure             |
|    5 | Schema or artifact validation failure  |
|    6 | Security policy failure                |
|    7 | Review conflict or stale feedback      |
|    8 | Partial result with preserved evidence |

Do not discard an output path merely because a command reports a partial result. Strictly validate the preserved report and explain its gaps.

`capture` requires `--run` and `--config`. `worktree` capture additionally requires `--allow-project-code`; configuration content cannot grant that process-execution consent by itself.

`discover` requires the same `--run` and `--config`, writes a diff/capture-bound `discovery.json`, and reports structured known/verified/unknown/planned/succeeded/failed coverage. `compare` requires `--run`, verifies capture digests, and writes a capture-bound `comparison.json` plus content-addressed diff images. Run both before `finalize` when browser evidence is expected.

`compare` returns exit code 4 when a target or evidence class is incomplete. Finalize the preserved result and report the exact gaps; do not retry deterministic malformed evidence or treat a pixel-only difference as a regression.
