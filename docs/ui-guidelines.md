# Utsuri report UI guidelines

- **Status**: Phase 1 implemented baseline
- **Scope**: static code-only report UI
- **Reference date**: 2026-08-07
- **Normative accessibility baseline**: WCAG 2.2 Level AA

## 1. Product direction

The report uses a **diff ledger** direction: editorial hierarchy, compact evidence records, and a dark structured-patch surface. The memorable element is a persistent three-state review rail paired with one focused change. Decoration must never compete with evidence.

The primary path is fixed:

```text
decision summary → review queue → focused change → evidence → structured diff
```

At every depth, a reviewer can return to the prior focus target. The report does not use an external font, Apple artwork, or a platform-specific asset.

## 2. Information hierarchy

| Level | Content                               | Rule                                                                                                                                      |
| ----- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Overall status and decision statement | Appears before counts; `UNCOVERED` and verification gaps remain visible.                                                                  |
| 2     | Three-state review queue              | Uses `Action required`, `Needs confirmation`, and `No issue found`; rows show at most risk and gap badges in addition to the queue state. |
| 3     | Focused Semantic Change               | Shows one change at a time in the fixed explanation order.                                                                                |
| 4     | Evidence and code diff                | Shows three evidence records before progressive disclosure; diff text comes only from structured line data.                               |
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
| Keyboard conventions          | [HIG keyboards](https://developer.apple.com/design/human-interface-guidelines/keyboards)                      | Adopt        | Links, buttons, search, and disclosure widgets retain native keyboard behavior. No custom shortcut is required for the primary path.                                               | Keyboard-only E2E with Enter and Tab-compatible controls.                    |
| Dark appearance               | [HIG Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode)                      | Adopt        | Light and dark values are semantic variants, not direct color inversion.                                                                                                           | Japanese dark-mode screenshot and state-label assertions.                    |
| Color                         | [HIG color](https://developer.apple.com/design/human-interface-guidelines/color)                              | Adopt        | Queue and risk colors always include text, border, or line-sign cues.                                                                                                              | DOM assertions and manual screenshot review.                                 |
| Lists                         | [HIG lists and tables](https://developer.apple.com/design/human-interface-guidelines/lists-and-tables)        | Adapt        | The queue uses a stable list hierarchy; code diff uses table roles only for line-grid semantics.                                                                                   | Screen-reader role inspection in E2E.                                        |
| Liquid Glass and Apple assets | [HIG materials](https://developer.apple.com/design/human-interface-guidelines/materials)                      | Do not adopt | The portable static report avoids Apple-only material and artwork. A restrained local surface system keeps evidence primary and works offline.                                     | Release layout contains no font, remote image, or Apple asset.               |

## 5. WCAG 2.2 mapping

| Criterion                           | Requirement                                                  | Phase 1 evidence                                                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1.3.1 Info and Relationships        | Structure is programmatic, not visual-only.                  | `header`, `nav`, `main`, ordered lists, headings, definition list, articles, and labeled sections.                                               |
| 1.4.3 Contrast (Minimum)            | Normal text reaches 4.5:1; large text reaches 3:1.           | Semantic light/dark palettes are reviewed before the documentation gate; automated contrast coverage is added in Phase 3.                        |
| 1.4.4 Resize Text                   | 200% text sizing loses no content or function.               | 512 CSS px with device scale factor 2 exercises the 1024 physical-pixel equivalent without page-level overflow.                                  |
| 1.4.10 Reflow                       | Ordinary content does not require two-dimensional scrolling. | Layout becomes one column below 760 CSS px; only the code-diff region may scroll horizontally because two-dimensional alignment carries meaning. |
| 1.4.11 Non-text Contrast            | Focus and state boundaries remain perceivable.               | Three-pixel focus outline, borders, line signs, and queue labels.                                                                                |
| 2.1.1 Keyboard                      | Every primary action works from a keyboard.                  | Queue, change, hunk, context, mode, evidence, and return controls use native interactive elements.                                               |
| 2.4.3 Focus Order                   | Focus follows the task sequence.                             | Automated focus record covers the complete primary path.                                                                                         |
| 2.4.7 Focus Visible                 | Keyboard focus is visible.                                   | Global `:focus-visible` token and active-hunk ring.                                                                                              |
| 2.4.11 Focus Not Obscured (Minimum) | Sticky content does not fully hide focus.                    | Focus targets scroll into view and the fixed header height is accounted for by the page layout.                                                  |
| 2.5.8 Target Size (Minimum)         | Small targets have sufficient size or spacing.               | Header anchor buttons have a 32 CSS px minimum; text links and compact controls retain surrounding spacing.                                      |
| 4.1.2 Name, Role, Value             | Custom state is exposed.                                     | `aria-current`, `aria-pressed`, labeled navigation, labeled diff table, and native disclosure state.                                             |

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

There are no unresolved Phase 1 Must items in this checklist. Human review remains required before the Phase 1 documentation gate can pass.
