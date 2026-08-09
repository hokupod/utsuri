# Utsuri report UI guidelines

- **Status**: Phase 6 implemented baseline
- **Scope**: static and interactive code, visual, structural, runtime, coverage, human-review, and Origin Session feedback UI
- **Reference date**: 2026-08-07
- **Normative accessibility baseline**: WCAG 2.2 Level AA

## 1. Product direction

The report uses a **diff ledger** direction: editorial hierarchy, compact evidence records, and a dark structured-patch surface. The memorable element is a persistent three-state review rail paired with one focused change. Decoration must never compete with evidence.

The primary path is fixed:

```text
decision summary → review queue → focused change → Agent interpretation
→ measured evidence → finding / changed region → structured diff
```

At every depth, a reviewer can return to the prior focus target. The report does not use an external font, Apple artwork, or a platform-specific asset.

## 2. Information hierarchy

| Level | Content                               | Rule                                                                                                                                      |
| ----- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Overall status and decision statement | Appears before counts; `UNCOVERED` and verification gaps remain visible.                                                                  |
| 2     | Three-state review queue              | Uses `Action required`, `Needs confirmation`, and `No issue found`; rows show at most risk and gap badges in addition to the queue state. |
| 3     | Focused Semantic Change               | Shows one change at a time in the fixed explanation order.                                                                                |
| 4     | Measured evidence and findings        | Separates deterministic visual/structural/runtime evidence from Agent interpretation and exposes coverage gaps before code detail.        |
| 5     | Context and inventory                 | Uses native disclosure controls for hidden context, remaining evidence, and the complete file inventory.                                  |

## 3. Semantic design tokens

| Token group | Implementation                                      | Required behavior                                                                                                |
| ----------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Canvas      | `--paper`, `--paper-raised`, `--rail`               | Separate navigation, content, and raised review records without relying on shadows alone.                        |
| Text        | `--ink`, `--ink-muted`                              | Maintain readable contrast in both color schemes.                                                                |
| State       | `--coral`, `--amber`, `--green`, `--blue`           | Pair every color with text, border, shape, or icon.                                                              |
| Focus       | `--focus`                                           | Use a three-pixel visible outline and preserve it in light and dark modes.                                       |
| Diff        | `--code-bg`, `--addition`, `--deletion`, `--word-*` | Keep line signs and line numbers in addition to color; render code with a local monospace stack.                 |
| Geometry    | `--radius`, spacing based on `rem`                  | Keep controls familiar and content alignment consistent; avoid decorative pill overuse outside compact statuses. |

## 4. HIG traceability

Apple HIG is design guidance, not the web conformance standard. WCAG 2.2 AA and semantic HTML take precedence when they differ.

| Concern                       | Primary reference                                                                                             | Decision     | Utsuri mapping                                                                                                                                                                     | Verification                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Hierarchy                     | [HIG design principles](https://developer.apple.com/design/human-interface-guidelines/design-principles)      | Adopt        | Status, summary, queue, focused change, and evidence use distinct levels and a consistent reading order.                                                                           | Heading order and screenshots at 1024, 1280, and 1440 px.                    |
| Layout and alignment          | [HIG layout](https://developer.apple.com/design/human-interface-guidelines/layout)                            | Adopt        | Leading review rail, aligned content columns, maximum reading width, and one-column small-screen reflow.                                                                           | No page-level horizontal overflow at the tested widths or 200% reflow proxy. |
| Progressive disclosure        | [HIG layout](https://developer.apple.com/design/human-interface-guidelines/layout)                            | Adopt        | Native `details` controls expose file inventory and extra evidence; a labeled button expands diff context.                                                                         | Keyboard activation plus context-expansion E2E.                              |
| Typography                    | [HIG typography](https://developer.apple.com/design/human-interface-guidelines/typography)                    | Adapt        | A system font stack preserves platform legibility; type scale and weight express hierarchy. Native point-size minima are not copied mechanically because browser CSS units differ. | English/Japanese screenshots and 200% reflow review.                         |
| Accessibility                 | [HIG accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility/)             | Adopt        | Semantic landmarks, native controls, labels, text-plus-color state, reduced-motion support, and zoom-safe layout.                                                                  | Keyboard E2E, locale/theme matrix, and WCAG checks below.                    |
| Focus and selection           | [HIG focus and selection](https://developer.apple.com/design/human-interface-guidelines/focus-and-selection/) | Adopt        | Focus uses a visible ring; queue selection uses a separate leading marker; deep links restore focus to the hunk or change.                                                         | `queue → change → hunk → change → queue` focus record.                       |
| Keyboard conventions          | [HIG keyboards](https://developer.apple.com/design/human-interface-guidelines/keyboards)                      | Adopt        | Links, buttons, search, and disclosure widgets retain native keyboard behavior. Optional `1`–`5`, `j`/`k`, `n`/`p`, `e`, and `/` shortcuts mirror labeled actions.                 | Keyboard-only E2E with native controls and documented shortcuts.             |
| Dark appearance               | [HIG Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode)                      | Adopt        | Light and dark values are semantic variants, not direct color inversion.                                                                                                           | Japanese dark-mode screenshot and state-label assertions.                    |
| Color                         | [HIG color](https://developer.apple.com/design/human-interface-guidelines/color)                              | Adopt        | Queue and risk colors always include text, border, or line-sign cues.                                                                                                              | DOM assertions and manual screenshot review.                                 |
| Lists                         | [HIG lists and tables](https://developer.apple.com/design/human-interface-guidelines/lists-and-tables)        | Adapt        | The queue uses a stable list hierarchy; code diff is a labeled region containing grouped text lines so it does not claim incomplete grid semantics.                                | Screen-reader role inspection and axe E2E.                                   |
| Liquid Glass and Apple assets | [HIG materials](https://developer.apple.com/design/human-interface-guidelines/materials)                      | Do not adopt | The portable static report avoids Apple-only material and artwork. A restrained local surface system keeps evidence primary and works offline.                                     | Release layout contains no font, remote image, or Apple asset.               |

## 5. WCAG 2.2 mapping

| Criterion                           | Requirement                                                  | Phase 3 evidence                                                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1.3.1 Info and Relationships        | Structure is programmatic, not visual-only.                  | `header`, `nav`, `main`, ordered lists, headings, definition list, articles, and labeled sections.                                               |
| 1.4.3 Contrast (Minimum)            | Normal text reaches 4.5:1; large text reaches 3:1.           | Semantic light/dark palettes plus axe checks; current Phase 3 report fixture has no serious or critical automated violations.                    |
| 1.4.4 Resize Text                   | 200% text sizing loses no content or function.               | 512 CSS px with device scale factor 2 exercises the 1024 physical-pixel equivalent without page-level overflow.                                  |
| 1.4.10 Reflow                       | Ordinary content does not require two-dimensional scrolling. | Layout becomes one column below 760 CSS px; only the code-diff region may scroll horizontally because two-dimensional alignment carries meaning. |
| 1.4.11 Non-text Contrast            | Focus and state boundaries remain perceivable.               | Three-pixel focus outline, borders, line signs, and queue labels.                                                                                |
| 2.1.1 Keyboard                      | Every primary action works from a keyboard.                  | Queue, change, hunk, context, mode, evidence, and return controls use native interactive elements.                                               |
| 2.2.2 Pause, Stop, Hide             | Moving information can be stopped.                           | Blink starts only after an explicit mode selection, its control becomes `Stop blink`, and reduced motion disables the mode and shortcut.         |
| 2.4.3 Focus Order                   | Focus follows the task sequence.                             | Automated focus record covers the complete primary path.                                                                                         |
| 2.4.7 Focus Visible                 | Keyboard focus is visible.                                   | Global `:focus-visible` token and active-hunk ring.                                                                                              |
| 2.4.11 Focus Not Obscured (Minimum) | Sticky content does not fully hide focus.                    | Focus targets scroll into view and the fixed header height is accounted for by the page layout.                                                  |
| 2.5.8 Target Size (Minimum)         | Small targets have sufficient size or spacing.               | Header anchor buttons have a 32 CSS px minimum; text links and compact controls retain surrounding spacing.                                      |
| 4.1.2 Name, Role, Value             | Custom state is exposed.                                     | `aria-current`, `aria-pressed`, labeled navigation/groups/regions, descriptive images, and native disclosure state.                              |

WCAG reference: [Web Content Accessibility Guidelines (WCAG) 2.2](https://www.w3.org/TR/WCAG22/).

## 6. Structured diff rules

1. Parse Git text before report generation; never inject raw patch HTML.
2. Render every code fragment through Svelte text interpolation.
3. Preserve old and new line numbers, line kind, hunk range, paths, binary status, and low-signal status.
4. Unified and side-by-side modes use the same structured line records.
5. Word emphasis highlights only the changed middle between nearby addition/deletion counterparts.
6. Context expansion reveals only context already present in the collected patch; it does not read repository files from the report UI.
7. URL fragments identify a Semantic Change or hunk. Opening a fragment restores both scroll position and focus.
8. An unclassified hunk remains independently reachable from the queue.

## 7. Phase 1 verification matrix

| Evidence     | Condition                                    | Expected result                                                              | Location                                                |
| ------------ | -------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------- |
| Screenshot   | English, light, 1024 × 900                   | Queue and focus remain readable with no page overflow.                       | `.artifacts/phase-1-ui/english-light-1024.png`          |
| Screenshot   | Japanese, dark, 1280 × 900                   | Labels expand safely and semantic dark colors remain distinct.               | `.artifacts/phase-1-ui/japanese-dark-1280.png`          |
| Screenshot   | English, light, 1440 × 900                   | Reading width remains bounded and evidence hierarchy remains stable.         | `.artifacts/phase-1-ui/english-light-1440.png`          |
| Screenshot   | English, light, 512 CSS px at device scale 2 | 200% reflow proxy keeps all ordinary content and controls available.         | `.artifacts/phase-1-ui/english-light-1024-zoom-200.png` |
| Focus record | Keyboard-only primary path                   | Queue, change, hunk, change, and original queue target are focused in order. | `.artifacts/phase-1-ui/focus-record.json`               |
| Security E2E | Diff contains an HTML event-handler payload  | Payload is visible as code text, creates no element, and executes no script. | `tests/e2e/code-only.spec.ts`                           |

## 8. Phase 1 Must checklist

- [x] **Hierarchy**: overall status, queue state, focused change, gaps, evidence, and diff are distinguishable.
- [x] **Readability**: English and Japanese remain readable in light/dark and tested widths.
- [x] **State identification**: queue, risk, selected item, and verification status never depend on color alone.
- [x] **Keyboard primary path**: queue, change, hunk, context, diff mode, and return actions use keyboard-operable controls.
- [x] **Focus restoration**: deep links and return actions focus the correct destination.
- [x] **Untrusted code text**: diff content is rendered as text under the static CSP.
- [x] **External dependency**: no remote font, Apple-specific asset, or runtime network call is required.

There are no unresolved Phase 1 Must items in this checklist; its documentation/UI review gate has passed.

## 9. Phase 3 visual evidence rules

1. Keep **Agent interpretation** and **Measured evidence** as separate labeled sections.
2. Default to side-by-side before/after images. Wipe, blink, pixel diff, and after-only are peer controls with visible text labels.
3. Preserve both full-page and component-crop evidence. The selector states the current scope.
4. Synchronize side-by-side scroll positions by normalized scroll range and apply one shared zoom value.
5. Identify changed regions by ordinal, pixel count, position, and size; markers and borders supplement rather than replace text.
6. Cross-link hunk → visual evidence and finding → linked hunk while restoring keyboard focus at the destination.
7. Keep `INCOMPLETE` and `UNCOVERED` visible in the header and affected evidence surface. Never rely on a disappearing toast.
8. A pixel-only difference remains informational and does not use blocker styling.
9. Blink is off by default, stoppable, and unavailable under `prefers-reduced-motion: reduce`, including its numeric shortcut.
10. Long paths and finding titles use safe wrapping; only the inherently two-dimensional diff and image panes may scroll horizontally.

## 10. Phase 3 verification matrix

| Evidence       | Condition                                            | Expected result                                                                                  | Location                                                       |
| -------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| Comparison E2E | Modes, region, finding, evidence, and hunk shortcuts | Every destination is keyboard reachable and restores focus.                                      | `tests/e2e/comparison.spec.ts`                                 |
| Coverage E2E   | known 12 / verified 7 / unknown true                 | Counts stay separate and no single coverage percentage is shown.                                 | `tests/e2e/global-token-change.spec.ts`                        |
| Visual fixture | English light, Japanese dark, partial failure        | Status, hierarchy, mode controls, and measured evidence remain distinguishable.                  | `.artifacts/phase-3-ui/*-partial.png`                          |
| Visual fixture | Long path and 24 findings                            | Titles wrap without page overflow; dense evidence preserves the primary path.                    | `.artifacts/phase-3-ui/english-light-1440-long-dense.png`      |
| Visual fixture | Empty and loading                                    | Stable status/fallback surfaces appear without unintended layout shift.                          | `.artifacts/phase-3-ui/english-light-1024-{empty,loading}.png` |
| Visual fixture | 512 CSS px at device scale 2                         | 200% reflow proxy keeps all ordinary controls and content available.                             | `.artifacts/phase-3-ui/english-light-1024-zoom-200.png`        |
| Reduced motion | Browser preference is `reduce`                       | Blink button is disabled and shortcut `4` leaves side-by-side active.                            | `.artifacts/phase-3-ui/english-light-1024-reduced-motion.png`  |
| Accessibility  | WCAG 2.2 A/AA tags through axe                       | No serious or critical automated violation; manual keyboard/focus/reflow checks remain required. | `tests/a11y/report-a11y.spec.ts`                               |

## 11. Phase 3 Must checklist

- [x] **Evidence separation**: Agent claims do not overwrite deterministic counts, hashes, status, comparison, or coverage.
- [x] **Mode consistency**: all five visual modes use the same labeled control group and image scope.
- [x] **Multiple perception channels**: mode, region, severity, finding state, and coverage never depend on color or motion alone.
- [x] **Failure persistence**: incomplete and uncovered scope remains on the judgment surface.
- [x] **Cross-linking**: code, visual evidence, findings, and changed regions preserve a keyboard path.
- [x] **Responsive evidence**: light/dark, Japanese/English, long/dense, empty/loading/partial, reduced-motion, and 200% proxy fixtures have no page-level overflow.
- [x] **Automated accessibility**: the Phase 3 fixture has zero serious or critical axe violations.

There are no unresolved Phase 3 Must items in this checklist; its documentation/UI review gate has passed.

## 12. Phase 5 review-state rules

1. **Viewed is navigation progress, not approval.** It uses an independent checkbox and never changes human judgment.
2. Human judgment is an explicit `unreviewed`, `approved`, `changes-requested`, or `blocked` control for the focused change.
3. Comments are anchored to a code line, hunk, target, finding, verification gap, or visual region. Plain comment text remains local and never implies Agent submission.
4. Import/export actions state their report identity and result. Exact, stale, and orphaned anchors always include text labels; probable matches are never activated automatically.
5. Static browser storage is namespaced by report ID. Exported review data is a portable convenience copy, not an immutable report asset.
6. Mutable state errors remain visible in the review workspace. A failed import or persistence operation must not be reduced to a disappearing toast.
7. The primary evidence path remains usable when review state is empty, unavailable, stale, or imported from a previous run.
8. Importing another report requires a separate, explicit re-anchor checkbox; selecting the file alone is not consent.
9. Browser writes require Web Locks and the expected revision. A stale tab shows a persistent conflict and never overwrites the newer state.
10. No provider, model, Agent selector, or send action appears in Phase 5. Origin Session feedback belongs to Phase 6.

## 13. Phase 5 verification matrix

| Evidence       | Condition                                     | Expected result                                                                                | Location                                                                |
| -------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Unit           | Viewed and judgment transitions               | Viewed changes no judgment; Agent-derived data changes neither.                                | `packages/review-state/src/review-state.test.ts`                        |
| Unit           | Canonical export/import                       | Stable ordering and hashes survive round-trip; report mismatch fails closed.                   | `packages/review-state/src/review-state.test.ts`                        |
| Unit           | Browser import and concurrent writes          | Malformed or mismatched bundles and stale-tab writes fail before storage changes.              | `packages/review-state/src/browser-store.test.ts`                       |
| Unit           | Re-anchor exact/probable/changed/missing      | Only exact remains matched; probable/changed are stale and missing is orphaned.                | `packages/review-state/src/review-state.test.ts`                        |
| E2E definition | Reload, export/import, comment, keyboard path | The same report resumes state and every review control remains labeled and keyboard reachable. | `tests/e2e/review-state.spec.ts`                                        |
| Integration    | Static serve                                  | Loopback-only random port, Host validation, traversal rejection, and no implicit browser open. | `tests/integration/phase5-serve-pack.test.ts`                           |
| Schema         | Review event and bundle                       | Unknown events, invalid anchors, oversized text, and malformed state fail validation.          | `schemas/review-event.schema.json`, `schemas/review-bundle.schema.json` |

Browser-backed E2E execution uses the pinned Nix Chromium job and never launches the user's normal Chrome profile. Exact-SHA evidence is retained in the [Phase 6 browser job](https://github.com/hokupod/utsuri/actions/runs/31274872922/job/93146719488).

## 14. Phase 5 Must checklist

- [x] **State separation**: viewed progress, human judgment, and comment/thread state use independent fields and controls.
- [x] **Immutable boundary**: UI persistence and CLI import/export never modify `report/`.
- [x] **Anchor status**: matched, stale, and orphaned states use text and structure in addition to color.
- [x] **Explicit portability**: export/import is initiated by a labeled control and validates the report/source identity.
- [x] **No implicit delivery**: comments and attention metadata do not start an Agent or send data.
- [x] **Progressive disclosure**: review controls complement rather than replace the existing evidence hierarchy.
- [x] **Browser evidence**: execute the Phase 5 E2E matrix with a compatible preinstalled browser without launching the user's normal Chrome profile.

There are no unresolved Phase 5 Must items in this checklist. The exact-SHA Browser/Nix job passed the review-state E2E with pinned Chromium.

## 15. Phase 6 feedback rules

1. “Ask the current Agent” is a labeled checkbox inside the comment composer. Its help text states that selection alone does not submit or create a conversation.
2. The sticky footer shows only the selected-item count and unread-answer count until the reviewer opens the preview.
3. Preview lists every question and anchor, then separates shared evidence from excluded data and states context bytes, redactions, binding, and delivery mode.
4. Static mode labels the action `Prepare review request` and exports an `export-only` batch. Interactive mode labels it `Return to current conversation` and stores the batch before exposing handoff text.
5. No provider, model, Agent, session, permission, command, cwd, or path selector appears in the feedback surface.
6. A response appears under its original thread without moving keyboard focus. Unread state uses text and count, not color alone.
7. Viewed, human judgment, Agent attention, answer, and resolution controls remain independent. Only the human can resolve a thread or mark a change reviewed.
8. Stale and orphaned items are not presented as ready feedback. A changed screenshot fingerprint keeps the prior answer but marks its visual anchor stale.
9. Interactive import and re-anchor controls remain disabled because the fixed-run server exposes no import API. Review export comes from the server event journal.
10. Copying handoff text is an explicit user action. Clipboard failure remains visible and never triggers an alternate delivery route.

## 16. Phase 6 verification matrix

| Evidence       | Condition                               | Expected result                                                                                      | Location                                                        |
| -------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Unit           | Checkbox, preview, context, idempotency | Selection creates no Context Pack; preview is bounded/redacted; duplicate storage returns one batch. | `packages/review-inbox/src/review-inbox.test.ts`                |
| Security       | Localhost capability API                | Missing token, cross-origin, arbitrary destination, and non-loopback binding fail closed.            | `tests/security/localhost.test.ts`                              |
| E2E            | Static feedback compose/export          | Literal provider text persists; preview has no selector; export contains batch and contexts.         | `tests/e2e/feedback-compose.spec.ts`                            |
| E2E            | Interactive three-item workflow         | Count, preview, storage, handoff, event export, and immutable report boundary persist.               | `tests/e2e/interactive-review.spec.ts`                          |
| E2E            | Codex and Claude Code return-to-session | One answer per item returns to each thread without review or resolution changes.                     | `tests/e2e/return-to-session.spec.ts`                           |
| E2E            | Re-anchor and unsupported direct bridge | Exact/probable/changed/missing remain distinct; fallback creates no session.                         | `tests/e2e/reanchor.spec.ts`, `tests/e2e/direct-bridge.spec.ts` |
| Fixture ledger | All design §46.25 cases                 | Every named fixture points to executable assertion evidence.                                         | `fixtures/origin-session-feedback/cases.json`                   |

Browser-backed E2E execution uses only a compatible preinstalled Playwright-managed browser or an explicitly configured test executable. It never launches the user's normal Chrome profile.

## 17. Phase 6 Must checklist

- [x] **Selection boundary**: checkbox selection alone creates no batch, Context Pack, clipboard write, process, or session.
- [x] **Preview clarity**: items, anchors, shared/excluded evidence, redaction, size, binding, and delivery mode are visible before storage/export.
- [x] **Destination safety**: UI and API expose no provider/model/session/path/command destination controls.
- [x] **State separation**: Agent answers do not change viewed, human judgment, or resolution.
- [x] **Failure fallback**: unsupported direct delivery remains `return-to-session` and creates no session.
- [x] **Interactive security**: loopback, capability, exact Origin for mutations, same-origin Fetch Metadata for read-only GET, exact Referer validation when present, report binding, and exact schema are required.
- [x] **Browser evidence**: execute the Phase 6 static and interactive Playwright projects with a compatible managed browser and retain the result.

There are no unresolved Phase 6 Must items in this checklist. The exact-SHA Browser/Nix job passed all 18 Playwright tests, including static and interactive feedback, both return-to-session hosts, re-anchoring, fallback, and axe.
