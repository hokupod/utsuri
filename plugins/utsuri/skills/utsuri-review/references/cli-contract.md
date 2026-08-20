# CLI contract

## Invocation

Invoke the committed bundle with native Node 22 or newer:

```bash
npx -y --package=@utsu-ri/cli@0.3.0 utsuri <command> [arguments]
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

Before `finalize`, choose the report language, read the collected diff/evidence/review plan, and author schema-valid annotations. Treat review-plan candidates as evidence-navigation hints: merge causally related source, test, documentation, and generated hunks into one semantic change, split unrelated hunks when necessary, and classify every hunk exactly once. Add a concise top-level `overview` and exactly one `hunkExplanations` entry for every change `hunkRef`; each entry states the hunk's concise `purpose` and `meaning`, using explicit unknown wording instead of unsupported inference. `finalize` rejects annotations unless their changes cover every collected hunk exactly once; `unclassifiedHunkRefs` is reserved for deterministic fallback reports created without annotations. The annotations `language`, `overview`, and hunk explanations are copied into the report. Pass the artifact with `finalize --annotations <file>`; a normal human-conversation flow serves the resulting report and keeps that viewer alive.

`capture` requires `--run` and `--config`. `worktree` capture additionally requires `--allow-project-code`; configuration content cannot grant that process-execution consent by itself.

`discover` requires the same `--run` and `--config`, writes a diff/capture-bound `discovery.json`, and reports structured known/verified/unknown/planned/succeeded/failed coverage. `compare` requires `--run`, verifies capture digests, and writes a capture-bound `comparison.json` plus content-addressed diff images. Run both before `finalize` when browser evidence is expected.

`compare` returns exit code 4 when a target or evidence class is incomplete. Finalize the preserved result and report the exact gaps; do not retry deterministic malformed evidence or treat a pixel-only difference as a regression.

`serve <report>` binds a random loopback port, returns its URL, and stays alive until it receives a termination signal. Start it through the host's persistent-process facility in a human conversation. Static mode exposes only manifest-listed report assets through GET and HEAD; add `--interactive` only when the run has an Origin Session binding. Both modes permit same-origin reads needed by the multi-file viewer. Interactive mode additionally passes a per-start capability in the URL fragment, removes it from browser history after capture, and exposes only fixed-run review state, feedback, event, and export endpoints. Add `--open` when the user asked to open or view the report locally, then verify the report ID, first change, code diff, and Agent interpretation before replying.

`pack <report> --output <directory>` validates the immutable report and writes deterministic `report.zip`, `report.json`, and `ci-summary.json`. A configured `failOn` match returns exit code 10 after preserving all artifacts. The command never uploads them.

`review export --run <run> --output <file>` writes a new canonical review bundle. `review import --run <run> --input <file>` requires matching source identity; add `--reanchor` to retain changed anchors as stale and missing anchors as orphaned. Neither command modifies `report/` or sends comments to an Agent.

`feedback list --run <run>` lists fixed-run batches. `feedback get --run <run> [--batch <id>]` claims exactly one batch only when the current host, opaque session reference, project fingerprint, and report match. `feedback answer --run <run> [--batch <id>] --input <file>` requires exactly one schema-valid answer per item. `feedback handoff --run <run> [--batch <id>]` prints a copyable return-to-session prompt. Omit `--batch` only when exactly one eligible batch exists.

`review-mcp --run <run>` starts the same fixed-run inbox service over strict NDJSON JSON-RPC. Fixed-run `finalize`, `feedback`, and `review-mcp` accept the legacy `UTSURI_CODEX_SESSION_ID` / `CLAUDE_SESSION_ID` inputs as well as current host inputs; conflicting same-host legacy/new values fail closed. Current Claude host inputs also require the canonical `CLAUDE_PROJECT_DIR`, which remains the binding root when launched from a contained child directory. Its tools accept no path, command, cwd, provider, model, or arbitrary session destination.

`mcp` is the argumentless Git Marketplace broker. Any option or positional argument is invalid. It accepts only current Plugin host variables, resolves the canonical project root and raw current-session identity from the supported host runtime, then reads bounded registrations created by bound finalization. Valid registrations for another host, session, or project are invisible. Zero eligible reports returns `MCP_RUN_UNAVAILABLE`; one is selected automatically; multiple reports return `MCP_RUN_AMBIGUOUS` and require a reviewer-selected opaque `report_id`. A stale, malformed, digest-changed, binding-changed, or filesystem-invalid registration blocks fallback to another run. Tools expose no arbitrary path, command, cwd, provider, model, destination, or raw session input.

`--version --json` emits exactly one JSON object with `ok`, `command`, `package`, `version`, and `protocolVersion`. Published-artifact verification rejects notices, extra stdout, version ranges, tags, ambient executable fallback, malformed MCP NDJSON, or an unsafe Marketplace tool schema.
