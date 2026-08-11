# Plugin runtime probe fixture

`scripts/plugin-runtime-probe.mjs` builds a temporary Marketplace, host home,
configuration directory, and workspace from this fixture. The temporary Plugin
replaces the Utsuri MCP command with `probe-server.mjs`; tracked Marketplace
manifests are never rewritten during a probe.

Only synthetic Origin Session identifiers are passed to the host. The probe
server writes raw observations only inside the temporary directory. The script
reduces them to versions and booleans before printing or recording results.
