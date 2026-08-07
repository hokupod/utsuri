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
