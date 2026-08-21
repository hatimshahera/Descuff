import type { EvidenceRef } from "@descuff/ir";
import { createValidationSummary } from "./summary.js";
import type {
  ExistingTestBaseline,
  ExistingTestBaselineEntry,
  ValidationCommand,
  ValidationCommandResult,
  ValidationCommandRunner,
  ValidationFailure,
  ValidationSummary
} from "./types.js";

export function recordExistingTestBaseline(
  recordedAt: string,
  commands: ValidationCommand[],
  results: ValidationCommandResult[]
): ExistingTestBaseline {
  const commandsById = new Map(commands.map((command) => [command.id, command]));

  return {
    schemaVersion: "0.1.0",
    recordedAt,
    entries: results
      .filter((result) => {
        const command = commandsById.get(result.commandId);
        return command?.level === "existing-tests";
      })
      .map((result) => {
        const command = commandsById.get(result.commandId);
        if (command === undefined) {
          throw new Error(`Cannot record baseline for unknown command: ${result.commandId}`);
        }

        return {
          commandId: result.commandId,
          command: command.command,
          args: [...command.args],
          exitCode: result.exitCode,
          failingIdentifiers: [...(result.failingIdentifiers ?? [])].sort(),
          evidence: command.evidence
        };
      })
  };
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
  results: ValidationCommandResult[],
  baseline?: ExistingTestBaseline
): ValidationSummary {
  const commandsById = new Map(commands.map((command) => [command.id, command]));
  const baselineById = new Map(
    baseline?.entries.map((entry) => [entry.commandId, entry] as const) ?? []
  );
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

    if (command.level === "existing-tests") {
      const baselineEntry = baselineById.get(command.id);
      issues.push(...compareExistingTestResultToBaseline(command, result, baselineEntry));
      continue;
    }

    if (result.exitCode !== 0) {
      issues.push({
        code: "BUILD_VALIDATION_COMMAND_FAILED",
        level: command.level,
        severity: "error",
        message: `${command.command} ${command.args.join(" ")} exited with ${result.exitCode}.`,
        source: command.id,
        evidence: command.evidence,
        suggestedAction:
          "Fix the failing build validation command before marking validation successful."
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

function compareExistingTestResultToBaseline(
  command: ValidationCommand,
  result: ValidationCommandResult,
  baselineEntry: ExistingTestBaselineEntry | undefined
): ValidationFailure[] {
  const issues: ValidationFailure[] = [];
  const currentFailures = new Set(result.failingIdentifiers ?? []);
  const baselineFailures = new Set(baselineEntry?.failingIdentifiers ?? []);

  if (result.exitCode === 0) {
    return issues;
  }

  if (baselineEntry === undefined) {
    issues.push({
      code: "EXISTING_TEST_COMMAND_FAILED",
      level: "existing-tests",
      severity: "error",
      message: `${command.command} ${command.args.join(" ")} exited with ${result.exitCode}.`,
      source: command.id,
      evidence: command.evidence,
      suggestedAction: "Fix the failing test or record an explicit scan baseline with evidence."
    });
    return issues;
  }

  if (baselineEntry.evidence.length === 0) {
    issues.push({
      code: "EXISTING_TEST_BASELINE_EVIDENCE_MISSING",
      level: "existing-tests",
      severity: "error",
      message: `Baseline exception for ${command.id} must include evidence.`,
      source: command.id,
      evidence: [],
      suggestedAction:
        "Record baseline evidence during scan before accepting pre-existing failures."
    });
  }

  for (const failure of currentFailures) {
    if (!baselineFailures.has(failure)) {
      issues.push({
        code: "EXISTING_TEST_NEW_FAILURE",
        level: "existing-tests",
        severity: "error",
        message: `Existing test command produced new failure ${failure}.`,
        source: command.id,
        evidence: command.evidence,
        suggestedAction: "Fix the new failing test before marking validation successful."
      });
    }
  }

  if (currentFailures.size === 0) {
    issues.push({
      code: "EXISTING_TEST_FAILURE_IDENTIFIERS_MISSING",
      level: "existing-tests",
      severity: "error",
      message:
        "Failing existing test command must report failing identifiers for baseline comparison.",
      source: command.id,
      evidence: command.evidence,
      suggestedAction: "Capture failing test identifiers from the configured test runner."
    });
  }

  return issues;
}
