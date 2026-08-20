import type { EvidenceRef } from "@descuff/ir";
import type { GeneratedChange, StandardValidationResult } from "@descuff/standard-core";

export type ValidationLevel =
  "static" | "build" | "existing-tests" | "runtime" | "security" | "regression";
export type ValidationSeverity = "error" | "warning";

export interface ValidationFailure {
  code: string;
  level: ValidationLevel;
  severity: ValidationSeverity;
  message: string;
  source: string;
  path?: string;
  evidence: EvidenceRef[];
  suggestedAction: string;
}

export interface ValidationSummary {
  passed: boolean;
  failures: ValidationFailure[];
  warnings: ValidationFailure[];
}

export interface ValidationCommand {
  id: string;
  level: "build" | "existing-tests";
  command: string;
  args: string[];
  cwd: string;
  evidence: EvidenceRef[];
}

export interface ValidationCommandResult {
  commandId: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type ValidationCommandRunner = (
  command: ValidationCommand
) => Promise<ValidationCommandResult>;

export function createEmptyValidationSummary(): ValidationSummary {
  return {
    passed: true,
    failures: [],
    warnings: []
  };
}

export function createValidationSummary(issues: ValidationFailure[]): ValidationSummary {
  const failures = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");

  return {
    passed: failures.length === 0,
    failures,
    warnings
  };
}

export function validateStaticStandardResults(
  results: StandardValidationResult[]
): ValidationSummary {
  const issues: ValidationFailure[] = [];

  for (const result of results) {
    for (const issue of result.issues) {
      issues.push({
        code: issue.code,
        level: "static",
        severity: issue.severity,
        message: issue.message,
        source: result.standardId,
        ...(issue.path === undefined ? {} : { path: issue.path }),
        evidence: issue.evidence,
        suggestedAction: `Repair ${result.standardId} output and rerun descuff validate.`
      });

      if (issue.code.length === 0 || issue.message.length === 0) {
        issues.push({
          code: "VALIDATION_FAILURE_UNTYPED",
          level: "static",
          severity: "error",
          message: "Validation failures must include a typed code and actionable message.",
          source: result.standardId,
          ...(issue.path === undefined ? {} : { path: issue.path }),
          evidence: issue.evidence,
          suggestedAction: "Return typed validation failures from the standard adapter."
        });
      }
    }
  }

  return createValidationSummary(issues);
}

export function createRepositoryValidationCommands(
  projectRoot: string,
  packageJson: { scripts?: Record<string, string> },
  evidence: EvidenceRef[] = []
): ValidationCommand[] {
  const scripts = packageJson.scripts ?? {};
  const commands: ValidationCommand[] = [];

  for (const scriptName of ["typecheck", "lint", "build"]) {
    if (scripts[scriptName] !== undefined) {
      commands.push({
        id: `script:${scriptName}`,
        level: "build",
        command: "pnpm",
        args: ["run", scriptName],
        cwd: projectRoot,
        evidence
      });
    }
  }

  if (scripts.test !== undefined) {
    commands.push({
      id: "script:test",
      level: "existing-tests",
      command: "pnpm",
      args: ["run", "test"],
      cwd: projectRoot,
      evidence
    });
  }

  return commands;
}

export async function runValidationCommands(
  commands: ValidationCommand[],
  runner: ValidationCommandRunner
): Promise<ValidationCommandResult[]> {
  const results: ValidationCommandResult[] = [];

  for (const command of commands) {
    const result = await runner(command);
    results.push(result);
  }

  return results;
}

export function validateCommandResults(
  commands: ValidationCommand[],
  results: ValidationCommandResult[]
): ValidationSummary {
  const commandsById = new Map(commands.map((command) => [command.id, command]));
  const issues: ValidationFailure[] = [];

  for (const result of results) {
    const command = commandsById.get(result.commandId);

    if (command === undefined) {
      issues.push({
        code: "VALIDATION_COMMAND_RESULT_UNKNOWN",
        level: "build",
        severity: "error",
        message: `Validation command result ${result.commandId} did not match a configured command.`,
        source: result.commandId,
        evidence: [],
        suggestedAction: "Ensure validation command results are keyed by configured command id."
      });
      continue;
    }

    if (result.exitCode !== 0) {
      issues.push({
        code:
          command.level === "existing-tests"
            ? "EXISTING_TEST_COMMAND_FAILED"
            : "BUILD_VALIDATION_COMMAND_FAILED",
        level: command.level,
        severity: "error",
        message: `${command.command} ${command.args.join(" ")} exited with ${result.exitCode}.`,
        source: command.id,
        evidence: command.evidence,
        suggestedAction:
          command.level === "existing-tests"
            ? "Fix the failing test or compare it against an explicit scan baseline."
            : "Fix the failing build validation command before marking validation successful."
      });
    }
  }

  for (const command of commands) {
    if (!results.some((result) => result.commandId === command.id)) {
      issues.push({
        code: "VALIDATION_COMMAND_RESULT_MISSING",
        level: command.level,
        severity: "error",
        message: `Validation command ${command.id} did not produce a result.`,
        source: command.id,
        evidence: command.evidence,
        suggestedAction: "Run every configured validation command and collect its result."
      });
    }
  }

  return createValidationSummary(issues);
}

export function validateStaticGeneratedChanges(changes: GeneratedChange[]): ValidationSummary {
  const issues: ValidationFailure[] = [];

  for (const change of changes) {
    if (change.path.trim().length === 0) {
      issues.push({
        code: "STATIC_GENERATED_CHANGE_PATH_MISSING",
        level: "static",
        severity: "error",
        message: "Generated change must include a target path.",
        source: change.standardId,
        evidence: change.evidence,
        suggestedAction: "Regenerate the standard change with a deterministic target path."
      });
    }

    if (change.evidence.length === 0) {
      issues.push({
        code: "STATIC_GENERATED_CHANGE_EVIDENCE_MISSING",
        level: "static",
        severity: "error",
        message: "Generated change must include evidence before it can be validated.",
        source: change.standardId,
        path: change.path,
        evidence: [],
        suggestedAction: "Attach source or runtime evidence to the generated change."
      });
    }

    if (change.safety === "automatic" && !change.deterministic) {
      issues.push({
        code: "STATIC_GENERATED_CHANGE_UNSAFE_AUTOMATIC",
        level: "static",
        severity: "error",
        message: "Automatic generated changes must be deterministic.",
        source: change.standardId,
        path: change.path,
        evidence: change.evidence,
        suggestedAction: "Mark the change approval-required or make generation deterministic."
      });
    }
  }

  return createValidationSummary(issues);
}
