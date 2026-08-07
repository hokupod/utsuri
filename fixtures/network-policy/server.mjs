import { createServer } from "node:http";

const port = Number(process.argv[2]);
const server = createServer((request, response) => {
  if (request.method === "POST") {
    response.writeHead(204).end();
    return;
  }
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(`<!doctype html>
    <html lang="en"><body>
      <main data-app-ready><h1>Network fixture</h1></main>
      <script>
        fetch("http://127.0.0.1:9/external").catch(() => {});
        fetch("/mutate", { method: "POST", body: "blocked" }).catch(() => {});
      </script>
    </body></html>`);
});
server.listen(port, "127.0.0.1");
const shutdown = () => server.close(() => process.exit(0));
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
