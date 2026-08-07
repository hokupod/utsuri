import { writeFile } from "node:fs/promises";

const pidFile = process.argv[2];
if (pidFile) await writeFile(pidFile, `${process.pid}\n`, { flag: "wx" });
process.stderr.write("intentional before-server failure\n");
process.exit(17);
