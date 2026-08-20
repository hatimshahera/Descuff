import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const cliPath = "packages/cli/dist/index.js";
const commands = ["scan", "report", "plan", "fix", "apply-safe", "validate"];

if (!existsSync(cliPath)) {
  console.error(`Missing built CLI at ${cliPath}. Run pnpm build first.`);
  process.exit(1);
}

for (const command of commands) {
  const result = spawnSync(process.execPath, [cliPath, command], {
    encoding: "utf8"
  });

  if (result.status !== 0) {
    console.error(`descuff ${command} failed`);
    console.error(result.stderr);
    process.exit(result.status ?? 1);
  }

  if (!result.stdout.includes(`${command}: placeholder command shell`)) {
    console.error(`descuff ${command} produced unexpected output`);
    console.error(result.stdout);
    process.exit(1);
  }
}

console.log(`CLI smoke passed for ${commands.length} commands.`);
