import { renameSync, writeFileSync } from "node:fs";

const outputPath = process.argv[2];
if (!outputPath) throw new Error("probe output path is required");

const observedKeys = [
  "CODEX_THREAD_ID",
  "CLAUDE_PROJECT_DIR",
  "CLAUDE_CODE_SESSION_ID",
  "UTSURI_PROBE_DENIED_SENTINEL"
];

const observation = {
  cwd: process.cwd(),
  env: Object.fromEntries(observedKeys.map((key) => [key, process.env[key] ?? null])),
  methods: []
};

persistObservation();

process.stdin.setEncoding("utf8");
let buffer = "";
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  for (;;) {
    const newline = buffer.indexOf("\n");
    if (newline === -1) return;
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    handle(JSON.parse(line));
  }
});

function handle(request) {
  if (request.id === undefined) return;
  if (typeof request.method === "string" && !observation.methods.includes(request.method)) {
    observation.methods.push(request.method);
    persistObservation();
  }
  if (request.method === "initialize") {
    respond(request.id, {
      protocolVersion: request.params?.protocolVersion ?? "2025-06-18",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "utsuri-plugin-runtime-probe", version: "1.0.0" }
    });
    return;
  }
  if (request.method === "ping") {
    respond(request.id, {});
    return;
  }
  if (request.method === "tools/list") {
    respond(request.id, {
      tools: [
        {
          name: "probe_environment",
          description: "Return a sanitized plugin runtime probe result.",
          inputSchema: { type: "object", additionalProperties: false }
        }
      ]
    });
    return;
  }
  if (request.method === "tools/call") {
    respond(request.id, {
      content: [{ type: "text", text: "probe ready" }],
      structuredContent: { ready: true },
      isError: false
    });
    return;
  }
  if (request.method === "resources/list") {
    respond(request.id, { resources: [] });
    return;
  }
  if (request.method === "resources/templates/list") {
    respond(request.id, { resourceTemplates: [] });
    return;
  }
  if (request.method === "prompts/list") {
    respond(request.id, { prompts: [] });
    return;
  }
  process.stdout.write(
    `${JSON.stringify({
      jsonrpc: "2.0",
      id: request.id,
      error: { code: -32601, message: "Method not found" }
    })}\n`
  );
}

function persistObservation() {
  const temporary = `${outputPath}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(observation)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
  renameSync(temporary, outputPath);
}

function respond(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}
