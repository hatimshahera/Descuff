import { describe, expect, it } from "vitest";
import type { EvidenceRef } from "@descuff/ir";
import {
  createEmptyValidationSummary,
  createRepositoryValidationCommands,
  createValidationSummary,
  recordExistingTestBaseline,
  runValidationCommands,
  validateCommandResults,
  validateRuntimeConfig,
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
          suggestedAction: "Fix the failing test or record an explicit scan baseline with evidence."
        }
      ],
      warnings: []
    });
  });

  it("records existing test baselines with command, exit code, failing identifiers, and evidence", () => {
    const commands = createRepositoryValidationCommands(
      "/repo",
      {
        scripts: {
          build: "next build",
          test: "vitest run"
        }
      },
      [evidence]
    );

    expect(
      recordExistingTestBaseline("2026-08-20T00:00:00.000Z", commands, [
        {
          commandId: "script:build",
          exitCode: 0,
          stdout: "",
          stderr: ""
        },
        {
          commandId: "script:test",
          exitCode: 1,
          stdout: "checkout.test.ts failed",
          stderr: "",
          failingIdentifiers: ["checkout.test.ts > saves cart", "checkout.test.ts > loads cart"]
        }
      ])
    ).toEqual({
      schemaVersion: "0.1.0",
      recordedAt: "2026-08-20T00:00:00.000Z",
      entries: [
        {
          commandId: "script:test",
          command: "pnpm",
          args: ["run", "test"],
          exitCode: 1,
          failingIdentifiers: ["checkout.test.ts > loads cart", "checkout.test.ts > saves cart"],
          evidence: [evidence]
        }
      ]
    });
  });

  it("allows existing test failures that exactly match an evidenced baseline", () => {
    const commands = createRepositoryValidationCommands(
      "/repo",
      {
        scripts: {
          test: "vitest run"
        }
      },
      [evidence]
    );
    const baseline = recordExistingTestBaseline("2026-08-20T00:00:00.000Z", commands, [
      {
        commandId: "script:test",
        exitCode: 1,
        stdout: "",
        stderr: "",
        failingIdentifiers: ["checkout.test.ts > loads cart"]
      }
    ]);

    expect(
      validateCommandResults(
        commands,
        [
          {
            commandId: "script:test",
            exitCode: 1,
            stdout: "",
            stderr: "",
            failingIdentifiers: ["checkout.test.ts > loads cart"]
          }
        ],
        baseline
      )
    ).toEqual({
      passed: true,
      failures: [],
      warnings: []
    });
  });

  it("blocks new failures that do not match the existing test baseline", () => {
    const commands = createRepositoryValidationCommands(
      "/repo",
      {
        scripts: {
          test: "vitest run"
        }
      },
      [evidence]
    );
    const baseline = recordExistingTestBaseline("2026-08-20T00:00:00.000Z", commands, [
      {
        commandId: "script:test",
        exitCode: 1,
        stdout: "",
        stderr: "",
        failingIdentifiers: ["checkout.test.ts > loads cart"]
      }
    ]);

    expect(
      validateCommandResults(
        commands,
        [
          {
            commandId: "script:test",
            exitCode: 1,
            stdout: "",
            stderr: "",
            failingIdentifiers: ["checkout.test.ts > loads cart", "checkout.test.ts > saves cart"]
          }
        ],
        baseline
      )
    ).toMatchObject({
      passed: false,
      failures: [
        {
          code: "EXISTING_TEST_NEW_FAILURE",
          level: "existing-tests",
          severity: "error",
          message: "Existing test command produced new failure checkout.test.ts > saves cart."
        }
      ],
      warnings: []
    });
  });

  it("rejects baseline exceptions without evidence", () => {
    const commands = createRepositoryValidationCommands("/repo", {
      scripts: {
        test: "vitest run"
      }
    });

    expect(
      validateCommandResults(
        commands,
        [
          {
            commandId: "script:test",
            exitCode: 1,
            stdout: "",
            stderr: "",
            failingIdentifiers: ["checkout.test.ts > loads cart"]
          }
        ],
        {
          schemaVersion: "0.1.0",
          recordedAt: "2026-08-20T00:00:00.000Z",
          entries: [
            {
              commandId: "script:test",
              command: "pnpm",
              args: ["run", "test"],
              exitCode: 1,
              failingIdentifiers: ["checkout.test.ts > loads cart"],
              evidence: []
            }
          ]
        }
      )
    ).toMatchObject({
      passed: false,
      failures: [
        {
          code: "EXISTING_TEST_BASELINE_EVIDENCE_MISSING",
          level: "existing-tests",
          severity: "error",
          source: "script:test"
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

  it("accepts read-only runtime validation config without mutating scenarios", () => {
    expect(
      validateRuntimeConfig({
        baseUrl: "http://localhost:3000",
        readinessUrl: "/",
        routes: ["/"],
        apiOperations: [{ method: "GET", path: "/api/products" }],
        envVarNames: ["DATABASE_URL"],
        scenarios: []
      })
    ).toEqual({
      passed: true,
      failures: [],
      warnings: []
    });
  });

  it("rejects runtime config that embeds secret values", () => {
    expect(
      validateRuntimeConfig({
        baseUrl: "http://localhost:3000",
        routes: [],
        apiOperations: [],
        envVarNames: ["API_KEY=secret"],
        scenarios: []
      })
    ).toMatchObject({
      passed: false,
      failures: [
        {
          code: "RUNTIME_CONFIG_SECRET_VALUE_EMBEDDED",
          level: "runtime",
          severity: "error",
          source: "runtime-config"
        }
      ],
      warnings: []
    });
  });

  it("requires explicit validation scenarios for mutating runtime operations", () => {
    expect(
      validateRuntimeConfig({
        baseUrl: "http://localhost:3000",
        routes: [],
        apiOperations: [{ method: "POST", path: "/api/products" }],
        envVarNames: [],
        scenarios: []
      })
    ).toMatchObject({
      passed: false,
      failures: [
        {
          code: "RUNTIME_MUTATION_SCENARIO_MISSING",
          level: "runtime",
          severity: "error",
          message: "POST /api/products requires an explicit validation scenario before invocation."
        }
      ],
      warnings: []
    });
  });

  it("rejects incomplete mutating validation scenarios", () => {
    expect(
      validateRuntimeConfig({
        baseUrl: "http://localhost:3000",
        routes: [],
        apiOperations: [{ method: "POST", path: "/api/products" }],
        envVarNames: [],
        scenarios: [
          {
            id: "scenario:create-product",
            method: "POST",
            path: "/api/products",
            setup: "",
            expectedSideEffects: [],
            verification: "Fetch product list.",
            cleanup: "Delete fixture product.",
            evidence: [evidence]
          }
        ]
      })
    ).toMatchObject({
      passed: false,
      failures: [
        {
          code: "RUNTIME_MUTATION_SCENARIO_INCOMPLETE",
          level: "runtime",
          severity: "error",
          source: "scenario:create-product"
        }
      ],
      warnings: []
    });
  });

  it("requires a safe test environment for high-consequence runtime operations", () => {
    expect(
      validateRuntimeConfig({
        baseUrl: "http://localhost:3000",
        routes: [],
        apiOperations: [{ method: "POST", path: "/api/checkout" }],
        envVarNames: [],
        scenarios: [
          {
            id: "scenario:checkout",
            method: "POST",
            path: "/api/checkout",
            setup: "Create test cart.",
            expectedSideEffects: ["Creates test order."],
            verification: "Fetch order status.",
            cleanup: "Delete test order.",
            evidence: [evidence]
          }
        ]
      })
    ).toMatchObject({
      passed: false,
      failures: [
        {
          code: "RUNTIME_HIGH_CONSEQUENCE_ENVIRONMENT_MISSING",
          level: "runtime",
          severity: "error",
          source: "scenario:checkout"
        }
      ],
      warnings: []
    });
  });

  it("accepts complete mutating scenarios in an explicit safe test environment", () => {
    expect(
      validateRuntimeConfig({
        baseUrl: "http://localhost:3000",
        routes: [],
        apiOperations: [{ method: "POST", path: "/api/checkout" }],
        envVarNames: [],
        scenarios: [
          {
            id: "scenario:checkout",
            method: "POST",
            path: "/api/checkout",
            setup: "Create test cart.",
            expectedSideEffects: ["Creates test order."],
            verification: "Fetch order status.",
            cleanup: "Delete test order.",
            safeTestEnvironment: true,
            evidence: [evidence]
          }
        ]
      })
    ).toEqual({
      passed: true,
      failures: [],
      warnings: []
    });
  });
});
