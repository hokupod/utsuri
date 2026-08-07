# Utsuri Phase 4 threat model

This document is the operational security index for the Phase 4 implementation. The canonical product requirements remain in [the detailed design](./design.md#29-runtime-threat-model).

## Trust boundaries

| Input or actor                                    | Trust                     | Boundary                                                                                            |
| ------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------- |
| Repository files, diffs, HTML, SVG, captured text | Untrusted                 | Parse with bounded schemas, sanitize or render as text, and never execute inferred commands         |
| `dual-url` endpoint                               | Configured                | Utsuri starts no project command; browser requests remain origin- and method-constrained            |
| `static-fragment` content                         | Untrusted                 | JavaScript and network disabled; sanitized document rendered as synthetic evidence                  |
| `worktree` command                                | Trusted only              | Explicit argv, contained cwd, minimal environment, and `--allow-project-code` consent               |
| `container` command                               | Untrusted                 | Fixed server container, authenticated identity-bound proxy, and hard browser-memory capability gate |
| Local process with the same UID                   | Trusted operator boundary | Utsuri does not claim protection after the operator account itself is compromised                   |
| Docker/Podman daemon and host kernel              | Trusted computing base    | Missing or unverifiable capability produces `INCOMPLETE`, never PASS                                |

## Release-blocking threats and controls

| Threat                                      | Control                                                                                                            | Negative evidence                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Report XSS or active SVG                    | Offline static CSP, text rendering, allowlist sanitizer, empty iframe sandbox, decoded PNG-only images             | `tests/security/report-security.test.ts`, `fixtures/malicious-{html,svg}/`          |
| Report asset replacement                    | Exact inventory and SHA-256 manifest; strict validation recomputes every digest                                    | `tests/security/report-security.test.ts`                                            |
| Parent-directory symlink swap               | Pinned root identity, native `O_NOFOLLOW` reopen, component-wise `openat`, and final regular-file `fstat`          | `packages/security/src/security.test.ts` race test                                  |
| Publication replacement                     | Protected ancestors, retained directory identity, and native atomic no-replace rename                              | `packages/report-builder/src/report-builder.test.ts`                                |
| Archive traversal                           | Bounded normalized inventory; duplicate, traversal, symlink, and special entries rejected                          | `tests/security/runtime-security.test.ts`                                           |
| Container host-decoy or removal failure     | Full immutable ID for inspect/exec/removal, authenticated proxy, and engine-verified absence after cleanup         | `tests/integration/container-runtime.test.ts`                                       |
| Container external redirect                 | Manual in-container redirect handling; non-internal `Location` revokes the proxy before browser delivery           | `tests/integration/container-runtime.test.ts`                                       |
| Untrusted browser memory denial of service  | Chromium joins a private delegated cgroup v2 before `exec`; `memory.max` covers its descendant tree                | Fail-closed capability test in `tests/security/runtime-security.test.ts`            |
| Browser process leak or ownership ambiguity | Random launch token, exact executable/pipe match, bounded termination, global rescan, and exhaustive cleanup steps | `packages/capture/src/browser-process.test.ts`, runtime security tests              |
| Oversized, malformed, or stalled evidence   | Shared diff schema, byte/pixel/line limits, per-side capture deadline, and bounded native contained reads          | `tests/integration/container-runtime.test.ts`, security and capture lifecycle tests |
| Bundle or manifest substitution             | Fresh independent esbuild result and source/dependency inventory are byte-compared with the artifact               | `tests/integration/release-layout.test.ts`                                          |
| Dependency/license drift                    | Reviewed input baseline, lockfile SHA-512, installed-package verification codes, deterministic SPDX 2.3            | `tests/integration/{release-layout,sbom}.test.ts`                                   |

## Container request chain

1. Probe the local engine and exact digest-pinned image without pulling.
2. Require writable delegated cgroup v2 browser memory controls before either project server starts.
3. Create the server container with fixed no-network, read-only, non-root, no-capability, PID/CPU/memory/tmpfs controls.
4. Retain the full 64-hex container ID returned by `create`; never resolve the mutable name for transport.
5. Bind readiness and browser traffic to a random 256-bit capability and exact loopback `Host`.
6. Inspect the same ID before and after every bounded in-container bridge request.
7. Retry connection refusal only before the first bounded readiness response. Remap same-origin URLs; revoke the proxy on identity, malformed response, post-readiness bridge, or redirect-policy failure.
8. Stop and remove by immutable ID; require a responsive engine to prove that ID absent, while running every remaining cleanup step after any failure.

The pinned image must already contain Node 22 for the request bridge. Utsuri does not install it. Container capture is unavailable on macOS and on Linux hosts without writable delegated cgroup v2; this is an intentional fail-closed capability result.

## Filesystem and archive scope

Phase 4 reads untrusted path components through the native descriptor boundary. Report publication writes only into a process-owned `0700` staging root and publishes by descriptor-bound atomic rename. Phase 4 validates archive entry inventories but does not extract archives. Future extraction must keep every create, write, rename, and delete operation relative to a verified root descriptor.

## Residual risk

- cgroup v2 `memory.max` is the Linux hard boundary; the kernel can temporarily exceed it while reclaim and in-cgroup OOM handling run. See the [Linux kernel cgroup v2 memory documentation](https://docs.kernel.org/admin-guide/cgroup-v2.html#memory-interface-files).
- Browser and container-engine vulnerabilities remain inside the trusted host/kernel boundary; Utsuri reduces exposure but is not a VM boundary.
- A malicious same-UID host process can interfere with operator-owned files and processes and is outside this model.
- The dependency baseline is a reviewed trust root generated only after an explicit frozen install; ordinary builds verify it but never refresh it.
