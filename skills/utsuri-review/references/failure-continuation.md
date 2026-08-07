# Failure continuation

Utsuri preserves successful evidence and makes missing coverage explicit.

When a stage fails:

1. Record the stage, target, typed error, and retry decision.
2. Retry only a transient navigation or screenshot failure, at most once.
3. Do not retry configuration or security failures.
4. Continue independent targets when doing so is safe.
5. Finalize a partial report with `INCOMPLETE`, `FAILED`, `SKIPPED`, or `UNCOVERED` status as appropriate.
6. Never convert an absent before/after capture, unknown denominator, or blocked request into `PASS` or “no difference.”
7. Return the report path plus the exact next action needed to close each gap.

Unknown discovery scope remains `UNCOVERED`; a failed target, missing side, malformed axe/runtime evidence, or missing comparison artifact remains `INCOMPLETE`. A pixel difference is measured evidence, not sufficient proof of `REGRESSION`.
