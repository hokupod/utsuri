import path from "node:path";
import { ExitCode, UtsuriError } from "@utsu-ri/core";
import { startStaticReportServer, type StaticReportServer } from "@utsu-ri/interactive-server";
import { resolveContainedPath } from "@utsu-ri/security";

const activeServers = new Set<StaticReportServer>();
let signalHandlersInstalled = false;

function installSignalHandlers(): void {
  if (signalHandlersInstalled) return;
  signalHandlersInstalled = true;
  const close = async () => {
    const servers = [...activeServers];
    activeServers.clear();
    await Promise.allSettled(servers.map((server) => server.close()));
  };
  process.once("SIGINT", () => void close().finally(() => process.exit(130)));
  process.once("SIGTERM", () => void close().finally(() => process.exit(143)));
}

export async function serveReport(
  cwd: string,
  reportValue: string,
  options: { interactive: boolean; openBrowser: boolean }
): Promise<{ data: Record<string, unknown>; human: string }> {
  if (options.interactive) {
    throw new UtsuriError(
      "SERVE_INTERACTIVE_UNAVAILABLE",
      "Interactive review serving is unavailable until the feedback API is enabled",
      ExitCode.Arguments
    );
  }
  const reportDirectory = await resolveContainedPath(cwd, reportValue);
  const server = await startStaticReportServer(reportDirectory, {
    openBrowser: options.openBrowser
  });
  activeServers.add(server);
  installSignalHandlers();
  const relative = path.relative(cwd, reportDirectory).replaceAll(path.sep, "/") || ".";
  return {
    data: {
      ok: true,
      command: "serve",
      mode: "static",
      reportDirectory: relative,
      host: server.host,
      port: server.port,
      url: server.url,
      browserOpened: options.openBrowser
    },
    human: `Serving static report at ${server.url}`
  };
}
