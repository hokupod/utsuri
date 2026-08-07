# CLI contract

## Invocation

Invoke the committed bundle with native Node 22 or newer:

```bash
node "${PLUGIN_ROOT}/skills/utsuri-review/scripts/utsuri.mjs" <command> [arguments]
```

Use `--json` for a single JSON result and `--ndjson` only on commands that explicitly support event streams. Machine output is written to stdout; diagnostics are written to stderr.

## Exit codes

| Code | Meaning                               |
| ---: | ------------------------------------- |
|    0 | Success                               |
|    2 | Invalid usage or configuration        |
|    3 | Git collection failure                |
|    4 | Runtime or capture failure            |
|    5 | Schema or artifact validation failure |
|    6 | Security policy failure               |
|   10 | Configured CI review-policy violation |

Do not discard an output path merely because a command reports a partial result. Strictly validate the preserved report and explain its gaps.

`capture` requires `--run` and `--config`. `worktree` capture additionally requires `--allow-project-code`; configuration content cannot grant that process-execution consent by itself.

`discover` requires the same `--run` and `--config`, writes a diff/capture-bound `discovery.json`, and reports structured known/verified/unknown/planned/succeeded/failed coverage. `compare` requires `--run`, verifies capture digests, and writes a capture-bound `comparison.json` plus content-addressed diff images. Run both before `finalize` when browser evidence is expected.

`compare` returns exit code 4 when a target or evidence class is incomplete. Finalize the preserved result and report the exact gaps; do not retry deterministic malformed evidence or treat a pixel-only difference as a regression.

`serve <report>` binds a random loopback port and does not open a browser without `--open`. Add `--interactive` only when the run has an Origin Session binding. Interactive mode passes a per-start capability in the URL fragment, removes it from browser history after capture, and exposes only fixed-run review state, feedback, event, and export endpoints.

`pack <report> --output <directory>` validates the immutable report and writes deterministic `report.zip`, `report.json`, and `ci-summary.json`. A configured `failOn` match returns exit code 10 after preserving all artifacts. The command never uploads them.

`review export --run <run> --output <file>` writes a new canonical review bundle. `review import --run <run> --input <file>` requires matching source identity; add `--reanchor` to retain changed anchors as stale and missing anchors as orphaned. Neither command modifies `report/` or sends comments to an Agent.

`feedback list --run <run>` lists fixed-run batches. `feedback get --run <run> [--batch <id>]` claims exactly one batch only when the current host, opaque session reference, project fingerprint, and report match. `feedback answer --run <run> [--batch <id>] --input <file>` requires exactly one schema-valid answer per item. `feedback handoff --run <run> [--batch <id>]` prints a copyable return-to-session prompt. Omit `--batch` only when exactly one eligible batch exists.

`review-mcp --run <run>` starts the same fixed-run inbox service over strict NDJSON JSON-RPC. Its tools accept no path, command, cwd, provider, model, or arbitrary session destination.

`--version --json` emits exactly one JSON object with `ok`, `command`, `package`, `version`, and `protocolVersion`. Published-artifact verification rejects notices, extra stdout, version ranges, tags, and ambient executable fallback.
