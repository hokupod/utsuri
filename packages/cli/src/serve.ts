import path from "node:path";
import {
  startInteractiveReportServer,
  startStaticReportServer,
  type StaticReportServer
} from "@utsu-ri/interactive-server";
import { parseBoundedJson, readContainedRegularFile } from "@utsu-ri/security";
import type { UtsuriReport } from "@utsu-ri/report-model";
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
  const reportDirectory = await resolveContainedPath(cwd, reportValue);
  let server: StaticReportServer;
  if (options.interactive) {
    const report = parseBoundedJson(
      (
        await readContainedRegularFile(reportDirectory, "report.json", {
          maximumBytes: 32 * 1024 * 1024
        })
      ).toString("utf8"),
      { label: "interactive report", maximumBytes: 32 * 1024 * 1024 }
    ) as UtsuriReport;
    server = await startInteractiveReportServer(reportDirectory, {
      openBrowser: options.openBrowser,
      originBinding: report.origin
    });
  } else {
    server = await startStaticReportServer(reportDirectory, {
      openBrowser: options.openBrowser
    });
  }
  activeServers.add(server);
  installSignalHandlers();
  const relative = path.relative(cwd, reportDirectory).replaceAll(path.sep, "/") || ".";
  return {
    data: {
      ok: true,
      command: "serve",
      mode: options.interactive ? "interactive" : "static",
      reportDirectory: relative,
      host: server.host,
      port: server.port,
      url: server.url,
      browserOpened: options.openBrowser
    },
    human: `Serving ${options.interactive ? "interactive" : "static"} report at ${server.url}`
  };
}
