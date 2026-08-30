import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
const cliPath = "packages/cli/dist/index.js";
const commands = [
  "scan",
  "enrich",
  "report",
  "plan",
  "start",
  "finish",
  "diff",
  "check",
  "doctor",
  "fix",
  "install",
  "apply-safe",
  "validate"
];
const fixtureRoot = "fixtures/ecommerce";

if (!existsSync(cliPath)) {
  console.error(`Missing built CLI at ${cliPath}. Run pnpm build first.`);
  process.exit(1);
}

for (const command of commands) {
  if (command === "enrich") {
    copyFileSync(
      "fixtures/ecommerce/.descuff/semantic-enrichment-template.json",
      "fixtures/ecommerce/.descuff/semantic-enrichment.json"
    );
  }

  const args =
    command === "fix"
      ? [cliPath, command]
      : command === "install"
        ? [cliPath, command, "all", fixtureRoot]
        : [cliPath, command, fixtureRoot];
  const result = spawnSync(process.execPath, args, {
    encoding: "utf8",
    env:
      command === "diff" || command === "check"
        ? { ...process.env, DESCUFF_CHANGED_FILES: "README.md" }
        : process.env
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
            : command === "start"
              ? "descuff start completed"
              : command === "finish"
                ? "descuff finish passed"
                : command === "diff"
                  ? "descuff diff pass"
                  : command === "check"
                    ? "descuff check pass"
                    : command === "doctor"
                      ? "descuff doctor supported"
                      : command === "install"
                        ? "descuff install completed"
                        : command === "enrich"
                          ? "descuff enrich passed"
                          : command === "validate"
                            ? "descuff validate passed"
                            : "no automatic file writes are enabled";

  if (!result.stdout.includes(expectedOutput)) {
    console.error(`descuff ${command} produced unexpected output`);
    console.error(result.stdout);
    process.exit(1);
  }
}

console.log(`CLI smoke passed for ${commands.length} commands.`);
