import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

const cliPath = "packages/cli/dist/index.js";
const commands = ["scan", "report", "plan", "fix", "apply-safe", "validate"];
const fixtureRoot = "fixtures/ecommerce";

if (!existsSync(cliPath)) {
  console.error(`Missing built CLI at ${cliPath}. Run pnpm build first.`);
  process.exit(1);
}

for (const command of commands) {
  const args = command === "fix" ? [cliPath, command] : [cliPath, command, fixtureRoot];
  const result = spawnSync(process.execPath, args, {
    encoding: "utf8"
  });

  if (result.status !== 0) {
    console.error(`descuff ${command} failed`);
    console.error(result.stderr);
    process.exit(result.status ?? 1);
  }

  const expectedOutput =
    command === "fix"
      ? "does not invoke an LLM"
      : command === "scan"
        ? "descuff scan completed"
        : command === "report"
          ? "Descuff Report"
          : command === "plan"
            ? "descuff plan wrote"
            : command === "validate"
              ? "descuff validate passed"
              : "no automatic file writes are enabled";

  if (!result.stdout.includes(expectedOutput)) {
    console.error(`descuff ${command} produced unexpected output`);
    console.error(result.stdout);
    process.exit(1);
  }
}

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
if (packageJson.scripts?.["graph:refresh"] !== "graphify . --update --no-viz") {
  console.error("Missing expected graph:refresh script.");
  process.exit(1);
}

const agentInstructions = await readFile("AGENTS.md", "utf8");
for (const expectedInstruction of [
  "Treat Graphify as optional developer infrastructure",
  "Refresh the local repository graph with `pnpm graph:refresh`",
  "Query `graphify-out/graph.json` for repository-navigation questions"
]) {
  if (!agentInstructions.includes(expectedInstruction)) {
    console.error(`Missing Graphify agent instruction: ${expectedInstruction}`);
    process.exit(1);
  }
}

console.log(`CLI smoke passed for ${commands.length} commands.`);
