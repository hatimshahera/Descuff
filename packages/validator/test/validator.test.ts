import { describe, expect, it } from "vitest";
import type { EvidenceRef } from "@descuff/ir";
import {
  createEmptyValidationSummary,
  createRepositoryValidationCommands,
  createValidationSummary,
  runValidationCommands,
  validateCommandResults,
  validateStaticGeneratedChanges,
  validateStaticStandardResults
} from "../src/index.js";

const evidence: EvidenceRef = {
  id: "source:route",
  kind: "source",
  location: "app/page.tsx",
  confidence: "high",
  summary: "Route source"
};

describe("@descuff/validator", () => {
  it("creates an empty passing validation summary", () => {
    expect(createEmptyValidationSummary()).toEqual({ passed: true, failures: [], warnings: [] });
  });

  it("separates typed validation failures from warnings", () => {
    expect(
      createValidationSummary([
        {
          code: "STATIC_WARNING",
          level: "static",
          severity: "warning",
          message: "Optional metadata is missing.",
          source: "llms-txt",
          evidence: [evidence],
          suggestedAction: "Add optional metadata."
        },
        {
          code: "STATIC_ERROR",
          level: "static",
          severity: "error",
          message: "Required metadata is missing.",
          source: "llms-txt",
          evidence: [evidence],
          suggestedAction: "Add required metadata."
        }
      ])
    ).toEqual({
      passed: false,
      failures: [
        {
          code: "STATIC_ERROR",
          level: "static",
          severity: "error",
          message: "Required metadata is missing.",
          source: "llms-txt",
          evidence: [evidence],
          suggestedAction: "Add required metadata."
        }
      ],
      warnings: [
        {
          code: "STATIC_WARNING",
          level: "static",
          severity: "warning",
          message: "Optional metadata is missing.",
          source: "llms-txt",
          evidence: [evidence],
          suggestedAction: "Add optional metadata."
        }
      ]
    });
  });

  it("adapts standard validation issues into actionable static failures", () => {
    expect(
      validateStaticStandardResults([
        {
          standardId: "llms-txt",
          valid: false,
          issues: [
            {
              code: "LLMS_TXT_ROUTE_MISSING",
              severity: "error",
              message: "Referenced route /products was not found.",
              path: "public/llms.txt",
              evidence: [evidence]
            }
          ]
        }
      ])
    ).toEqual({
      passed: false,
      failures: [
        {
          code: "LLMS_TXT_ROUTE_MISSING",
          level: "static",
          severity: "error",
          message: "Referenced route /products was not found.",
          source: "llms-txt",
          path: "public/llms.txt",
          evidence: [evidence],
          suggestedAction: "Repair llms-txt output and rerun descuff validate."
        }
      ],
      warnings: []
    });
  });

  it("rejects untyped standard validation issues", () => {
    expect(
      validateStaticStandardResults([
        {
          standardId: "webmcp",
          valid: false,
          issues: [
            {
              code: "",
              severity: "warning",
              message: "",
              evidence: [evidence]
            }
          ]
        }
      ])
    ).toEqual({
      passed: false,
      failures: [
        {
          code: "VALIDATION_FAILURE_UNTYPED",
          level: "static",
          severity: "error",
          message: "Validation failures must include a typed code and actionable message.",
          source: "webmcp",
          evidence: [evidence],
          suggestedAction: "Return typed validation failures from the standard adapter."
        }
      ],
      warnings: [
        {
          code: "",
          level: "static",
          severity: "warning",
          message: "",
          source: "webmcp",
          evidence: [evidence],
          suggestedAction: "Repair webmcp output and rerun descuff validate."
        }
      ]
    });
  });

  it("catches unsafe or unevidenced generated changes during static validation", () => {
    expect(
      validateStaticGeneratedChanges([
        {
          standardId: "openapi",
          id: "openapi:spec",
          kind: "create-file",
          path: "",
          content: "{}",
          deterministic: false,
          safety: "automatic",
          conflictPolicy: "approval-required",
          evidence: []
        }
      ])
    ).toEqual({
      passed: false,
      failures: [
        {
          code: "STATIC_GENERATED_CHANGE_PATH_MISSING",
          level: "static",
          severity: "error",
          message: "Generated change must include a target path.",
          source: "openapi",
          evidence: [],
          suggestedAction: "Regenerate the standard change with a deterministic target path."
        },
        {
          code: "STATIC_GENERATED_CHANGE_EVIDENCE_MISSING",
          level: "static",
          severity: "error",
          message: "Generated change must include evidence before it can be validated.",
          source: "openapi",
          path: "",
          evidence: [],
          suggestedAction: "Attach source or runtime evidence to the generated change."
        },
        {
          code: "STATIC_GENERATED_CHANGE_UNSAFE_AUTOMATIC",
          level: "static",
          severity: "error",
          message: "Automatic generated changes must be deterministic.",
          source: "openapi",
          path: "",
          evidence: [],
          suggestedAction: "Mark the change approval-required or make generation deterministic."
        }
      ],
      warnings: []
    });
  });

  it("discovers build and existing test commands from package scripts", () => {
    expect(
      createRepositoryValidationCommands(
        "/repo",
        {
          scripts: {
            build: "next build",
            lint: "eslint .",
            test: "vitest run",
            typecheck: "tsc -b",
            dev: "next dev"
          }
        },
        [evidence]
      )
    ).toEqual([
      {
        id: "script:typecheck",
        level: "build",
        command: "pnpm",
        args: ["run", "typecheck"],
        cwd: "/repo",
        evidence: [evidence]
      },
      {
        id: "script:lint",
        level: "build",
        command: "pnpm",
        args: ["run", "lint"],
        cwd: "/repo",
        evidence: [evidence]
      },
      {
        id: "script:build",
        level: "build",
        command: "pnpm",
        args: ["run", "build"],
        cwd: "/repo",
        evidence: [evidence]
      },
      {
        id: "script:test",
        level: "existing-tests",
        command: "pnpm",
        args: ["run", "test"],
        cwd: "/repo",
        evidence: [evidence]
      }
    ]);
  });

  it("runs validation commands through an injected command runner", async () => {
    const commands = createRepositoryValidationCommands("/repo", {
      scripts: {
        build: "next build",
        test: "vitest run"
      }
    });

    await expect(
      runValidationCommands(commands, async (command) => ({
        commandId: command.id,
        exitCode: 0,
        stdout: `${command.id} ok`,
        stderr: ""
      }))
    ).resolves.toEqual([
      {
        commandId: "script:build",
        exitCode: 0,
        stdout: "script:build ok",
        stderr: ""
      },
      {
        commandId: "script:test",
        exitCode: 0,
        stdout: "script:test ok",
        stderr: ""
      }
    ]);
  });

  it("fails build validation when a build command exits nonzero", () => {
    const commands = createRepositoryValidationCommands("/repo", {
      scripts: {
        build: "next build"
      }
    });

    expect(
      validateCommandResults(commands, [
        {
          commandId: "script:build",
          exitCode: 1,
          stdout: "",
          stderr: "build failed"
        }
      ])
    ).toMatchObject({
      passed: false,
      failures: [
        {
          code: "BUILD_VALIDATION_COMMAND_FAILED",
          level: "build",
          severity: "error",
          source: "script:build"
        }
      ],
      warnings: []
    });
  });

  it("fails existing test validation without treating failures as pre-existing", () => {
    const commands = createRepositoryValidationCommands("/repo", {
      scripts: {
        test: "vitest run"
      }
    });

    expect(
      validateCommandResults(commands, [
        {
          commandId: "script:test",
          exitCode: 1,
          stdout: "1 failed",
          stderr: ""
        }
      ])
    ).toMatchObject({
      passed: false,
      failures: [
        {
          code: "EXISTING_TEST_COMMAND_FAILED",
          level: "existing-tests",
          severity: "error",
          suggestedAction: "Fix the failing test or compare it against an explicit scan baseline."
        }
      ],
      warnings: []
    });
  });

  it("fails validation when a configured command produces no result", () => {
    const commands = createRepositoryValidationCommands("/repo", {
      scripts: {
        typecheck: "tsc -b"
      }
    });

    expect(validateCommandResults(commands, [])).toMatchObject({
      passed: false,
      failures: [
        {
          code: "VALIDATION_COMMAND_RESULT_MISSING",
          level: "build",
          severity: "error",
          source: "script:typecheck"
        }
      ],
      warnings: []
    });
  });
});
