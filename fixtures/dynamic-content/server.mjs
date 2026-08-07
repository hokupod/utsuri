import { writeFile } from "node:fs/promises";
import { createServer } from "node:http";

const port = Number(process.argv[2]);
const pidFile = process.argv[3];
const variant = process.argv[4] ?? "fixture";

if (!Number.isInteger(port) || port < 1) process.exit(2);
if (pidFile) await writeFile(pidFile, `${process.pid}\n`, { flag: "wx" });

const server = createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(204).end();
    return;
  }
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(`<!doctype html>
    <html lang="en">
      <head>
        <style>
          @keyframes pulse { from { opacity: .5 } to { opacity: 1 } }
          .pulse { animation: pulse 20ms infinite alternate; }
        </style>
      </head>
      <body>
        <main data-app-ready data-testid="root" class="pulse">
          <h1>${variant}</h1>
          <time data-dynamic></time>
          <button type="button">Menu</button>
          <dialog aria-label="Navigation"><p data-testid="status">Ready</p></dialog>
        </main>
        <script>
          document.querySelector("time").textContent = new Date().toISOString();
          document.querySelector("button").addEventListener("click", () => {
            document.querySelector("dialog").showModal();
          });
        </script>
      </body>
    </html>`);
});

server.listen(port, "127.0.0.1");
const shutdown = () => server.close(() => process.exit(0));
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
