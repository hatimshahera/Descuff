export const descuffCommands = [
  "scan",
  "report",
  "plan",
  "start",
  "finish",
  "diff",
  "check",
  "scenarios",
  "recon",
  "doctor",
  "fix",
  "install",
  "enrich",
  "apply-safe",
  "validate"
] as const;

export type DescuffCommand = (typeof descuffCommands)[number];

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export function isDescuffCommand(value: string): value is DescuffCommand {
  return descuffCommands.includes(value as DescuffCommand);
}
