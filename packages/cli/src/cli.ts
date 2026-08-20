import { descuffCommands, isDescuffCommand, type CommandResult } from "@descuff/core";
import { renderFixCommandInstructions } from "@descuff/agent-workflow";

const helpText = `Descuff

Usage:
  descuff <command>

Commands:
  ${descuffCommands.join("\n  ")}
`;

export async function runCli(argv: string[]): Promise<CommandResult> {
  const command = argv[2];

  if (command === undefined || command === "--help" || command === "-h") {
    return { exitCode: 0, stdout: helpText, stderr: "" };
  }

  if (!isDescuffCommand(command)) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `Unknown command: ${command}\n\n${helpText}`
    };
  }

  if (command === "fix") {
    return {
      exitCode: 0,
      stdout: renderFixCommandInstructions(),
      stderr: ""
    };
  }

  return {
    exitCode: 0,
    stdout: `${command}: placeholder command shell\n`,
    stderr: ""
  };
}
