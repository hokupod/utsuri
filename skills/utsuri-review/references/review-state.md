# Review state

## Boundaries

- `report/` is immutable evidence.
- CLI mutable state lives under `<run>/review/`.
- Static viewer state is namespaced by report ID in browser storage.
- Browser writes require Web Locks and an expected revision; a stale tab fails without overwriting state.
- CLI state is committed as an immutable generation through an atomic hard-linked revision record under `<run>/review/commits/`; no process lock can remain stale after a crash.
- Viewed progress, human judgment, comments, and Agent-attention metadata are separate.
- A plain comment never starts an Agent, creates a batch, or changes judgment.

## Export and import

Export before moving state:

```bash
node "${PLUGIN_ROOT}/skills/utsuri-review/scripts/utsuri.mjs" review export \
  --run .artifacts/utsuri/run-001 \
  --output .artifacts/utsuri/review-bundle.json \
  --json
```

Import only after validating the target report and source identity. Re-anchoring another report always requires a separate explicit opt-in. Use `--reanchor` when moving to a changed run:

```bash
node "${PLUGIN_ROOT}/skills/utsuri-review/scripts/utsuri.mjs" review import \
  --run .artifacts/utsuri/run-002 \
  --input .artifacts/utsuri/review-bundle.json \
  --reanchor \
  --json
```

Interpret results conservatively:

- `matched`: exact anchor fingerprint and context;
- `stale`: probable or changed context requiring human confirmation; and
- `orphaned`: the referenced evidence is absent.

Never activate a probable anchor automatically. Preserve import conflicts in the generated diagnostic and ask the reviewer which human state to retain.

## Phase 5 limit

There is no Origin Session submission path in Phase 5. Do not invent a `feedback` command or copy comments into another Agent session. Report the local bundle path and wait for an explicit Phase 6-capable handoff.
