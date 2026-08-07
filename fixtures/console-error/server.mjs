import { createServer } from "node:http";

const port = Number(process.argv[2]);
const variant = process.argv[3] ?? "before";
const server = createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(`<!doctype html><html lang="en"><body><main data-app-ready data-testid="root">
    <h1>Runtime fixture</h1>${variant === "after" ? '<script>setTimeout(() => { throw new Error("Checkout failed"); }, 0)</script>' : ""}
  </main></body></html>`);
});
server.listen(port, "127.0.0.1");

const stop = () => server.close(() => process.exit(0));
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
