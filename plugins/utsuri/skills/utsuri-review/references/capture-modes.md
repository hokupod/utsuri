# Capture modes

## Prerequisites

- Prefer an installed version-matched Playwright browser or headless Chromium. A normal macOS Chrome application is used only when the user explicitly authorizes its absolute executable with `UTSURI_BROWSER_EXECUTABLE`. Utsuri never downloads a browser.
- Create the run with `collect`, then pass that run and a validated configuration to `capture`.
- Use `init` only to produce a non-overwriting proposal. `proposedCommands` are never executed.

## Modes

| Mode              | Project command | Trust requirement | Current support  |
| ----------------- | --------------- | ----------------- | ---------------- |
| `dual-url`        | Never           | `configured`      | Available        |
| `static-fragment` | Never           | `untrusted`       | Available        |
| `worktree`        | Explicit argv   | `trusted`         | Available        |
| `container`       | Isolated argv   | `untrusted`       | Capability-gated |

`dual-url` is the default. Start both URLs yourself, declare both origins, and keep server commands out of the configuration.

`static-fragment` requires repository-relative `before` and `after` fragment paths on every target. JavaScript and HTTP requests are disabled, active markup is sanitized, and the evidence is marked synthetic.

`worktree` requires separate repository-contained `cwd` values and explicit argv arrays for both sides. It starts project code only when the user invokes:

```bash
npx -y --package=@utsu-ri/cli@0.3.2 utsuri capture \
  --run <run> \
  --config <config> \
  --allow-project-code \
  --json
```

Do not add install, on-demand package execution, shell, or browser-download commands. Child environments contain only a minimal baseline plus explicitly allowlisted non-secret names.

`container` requires explicit argv and contained working directories for both sides, plus an exact SHA-256 image digest already present in Docker or Podman. Utsuri never pulls it, and the image must provide Node 22 for the bounded request bridge. Fixed server controls enforce no network, a read-only root and project mount, no new privileges, no Linux capabilities, a non-root user, and bounded PID/CPU/memory/tmpfs/time/artifact resources. Requests pass only through a full-container-ID-bound, authenticated loopback proxy; external redirects revoke the proxy. Before Chromium can load untrusted content, a writable delegated Linux cgroup v2 must accept `memory.max` and the browser launcher must join it before `exec`. macOS and Linux hosts without that delegation fail capability probing before project code starts. Host environment allowlists, secret mounts, and host sockets are forbidden.

## Stabilization and actions

The order is ready selector, configured actions and assertions, font readiness, animation/caret suppression, then a bounded settle delay. Record time freezing and every mask in capture metadata.

Actions are schema-validated before browser or server startup. Allowed operations are `click`, `hover`, `focus`, `fill`, `press`, `selectOption`, `check`, `uncheck`, `waitFor`, `assertVisible`, and `assertText`. Prefer role plus accessible name, then label, test ID, text, and CSS.

```yaml
steps:
  - click:
      locator:
        by: role
        role: button
        name: Menu
  - assertVisible:
      locator:
        by: role
        role: dialog
        name: Navigation
```

## Evidence and failure

Each side uses a separate Browser Context with identical viewport, DPR, locale, timezone, color scheme, and reduced-motion settings. Full-page images, element crops, normalized DOM, ARIA, computed styles, axe output, console entries, network entries, and metadata are stored separately.

Initial HTTP requests, redirect destinations, and WebSocket handshakes use the same origin allowlist. External redirects are blocked before follow-up requests are sent. Persisted textual evidence removes URL credentials, queries, and fragments from absolute and relative URL forms.

External origins and mutation methods are blocked by default. A blocked request, failed side, exceeded diff/image/time/memory/artifact limit, or unavailable runtime capability makes the capture incomplete. Successful compatible sides may be reused only when the configuration/run binding, browser version, limits, and artifact digests still match.

After capture, run `discover --run <run> --config <config>` and then `compare --run <run>`. Discovery keeps known, verified, unknown, planned, succeeded, failed, and unmapped scope separate. Comparison validates every capture digest and classifies pixel, DOM, ARIA, style, axe, console/page, network, and overflow evidence as new, resolved, unchanged, or incomplete. Finalization independently validates both manifests, copies referenced capture/comparison evidence into the immutable report, and hashes it.
