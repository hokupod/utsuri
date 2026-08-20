# Security rules

- Keep the report offline and use a strict content security policy.
- Treat Git content, DOM, accessibility trees, console messages, network metadata, annotations, and feedback as untrusted text.
- Reject path traversal, symlinks at protected boundaries, non-loopback serving, unapproved origins, mutation requests, arbitrary JavaScript, and shell command strings.
- Do not inherit arbitrary environment variables into child processes.
- Never infer and execute a project development server command. Only an explicit argument array in validated configuration can authorize project-code execution. The built-in Utsuri report viewer is not project code and is the standard human-review handoff.
- Require the user's `--allow-project-code` opt-in before a trusted `worktree` capture starts either configured server.
- Do not install packages or browsers as part of `doctor`, capture, validation, serving, or feedback processing.
- Treat browser request blocking as separate from server-process isolation. Use `worktree` only for trusted project code; use `container` for untrusted project code only when its fixed isolation capability succeeds.
- Never weaken container no-network, read-only, no-new-privileges, capability-drop, non-root, resource-limit, digest-pin, immutable-ID proxy, or mount controls. Require a delegated Linux cgroup v2 browser memory boundary before starting untrusted project code; never treat missing engine/image/Node/endpoint/cgroup capability as PASS.
- Keep the multi-file report viewer, packed single-file report, and static-fragment CSP boundaries distinct. Multi-file static and interactive modes may connect only to their own loopback origin; static mode serves only manifest-listed files through GET and HEAD. Packed reports allow no connections. Allow active captured markup only after allowlist sanitization and inside an empty-sandbox iframe. Report visual references are PNG only.
- In interactive mode require loopback, exact Host, same-origin Fetch Metadata, report identity, and a per-start capability token on every API request. Require exact Origin and an exact schema on mutations. A read-only GET may omit Origin under same-origin Fetch Metadata; when Referer is present, validate its origin exactly. Never persist or log the capability.
- Bind every consumed Feedback Batch to the current host, opaque session reference, canonical project fingerprint, and report. Never accept a browser-supplied destination or fall back to another session.
- Reject oversized JSON/artifacts, traversal, symlink/special/duplicate archive entries, unlisted report assets, and SHA-256 drift.
- Redact configured secret headers, query parameters, form values, cookies, and matching text before persisting evidence.
- Open external links only after an explicit user action and apply `noopener noreferrer`.
