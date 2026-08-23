# Review state

## Boundaries

- `report/` is immutable evidence.
- CLI mutable state lives under `<run>/review/`.
- Static viewer state is namespaced by report ID in browser storage.
- Browser writes require Web Locks and an expected revision; a stale tab fails without overwriting state.
- CLI state is committed as an immutable generation through an atomic hard-linked revision record under `<run>/review/commits/`; no process lock can remain stale after a crash.
- Viewed progress, human judgment, comments, and Agent-attention metadata are separate.
- A plain comment never starts an Agent, creates a batch, or changes judgment.
- Selecting Agent attention changes only thread metadata. Context Packs are created during preview or storage, never by the checkbox.
- Feedback Inbox, batches, contexts, and answers are immutable-generation sidecars under `<run>/review/`; they never modify `report/`.

## Export and import

Export before moving state:

```bash
npx -y --package=@utsu-ri/cli@0.3.0 utsuri review export \
  --run .artifacts/utsuri/run-001 \
  --output .artifacts/utsuri/review-bundle.json \
  --json
```

Import only after validating the target report and source identity. Re-anchoring another report always requires a separate explicit opt-in. Use `--reanchor` when moving to a changed run:

```bash
npx -y --package=@utsu-ri/cli@0.3.0 utsuri review import \
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

## Feedback and stale state

- Preview shared and excluded evidence before storing a Feedback Batch.
- Never submit stale, orphaned, or resolved threads as current feedback.
- Agent answers append to their original threads but never mark a change viewed, reviewed, or resolved.
- A changed screenshot fingerprint makes its visual-region anchor stale even when the region identity is unchanged.
- Phase 5 pixel-coordinate visual anchors migrate to the normalized catalog before state or bundle validation; an unmappable cross-report comment remains orphaned.
- Static mode exports an `export-only` batch. Interactive mode stores a fixed-destination batch for return to the Origin Session.
