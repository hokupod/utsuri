import { executeCli } from "./cli";

const result = await executeCli(process.argv.slice(2));
if (result.json) process.stdout.write(`${JSON.stringify(result.data)}\n`);
else process.stdout.write(result.human.endsWith("\n") ? result.human : `${result.human}\n`);
process.exitCode = result.exitCode;
