# Security rules

- Keep the report offline and use a strict content security policy.
- Treat Git content, DOM, accessibility trees, console messages, network metadata, annotations, and feedback as untrusted text.
- Reject path traversal, symlinks at protected boundaries, non-loopback serving, unapproved origins, mutation requests, arbitrary JavaScript, and shell command strings.
- Do not inherit arbitrary environment variables into child processes.
- Never infer and execute a development server command. Only an explicit argument array in validated configuration can authorize execution.
- Do not install packages or browsers as part of `doctor`, capture, validation, serving, or feedback processing.
- Redact configured secret headers, query parameters, form values, cookies, and matching text before persisting evidence.
- Open external links only after an explicit user action and apply `noopener noreferrer`.
