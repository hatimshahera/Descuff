import { describe, expect, it } from "vitest";
import {
  createEmptyStructuralAnalysis,
  type ApplicationModel,
  type EvidenceRef
} from "@descuff/ir";
import type { StandardAdapter } from "@descuff/standard-core";
import {
  createEmptyValidationSummary,
  createRepositoryValidationCommands,
  createValidationSummary,
  createValidationReadinessReport,
  mergeValidationSummaries,
  recordExistingTestBaseline,
  runValidationCommands,
  runStandardValidation,
  validateCommandResults,
  validateRuntimeConfig,
  validateRuntimeObservations,
  validateSecurityModel,
  validateStaticGeneratedChanges,
  validateStaticStandardResults,
  validateUiRegression
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

  it("merges validation summaries without turning warnings into blockers", () => {
    expect(
      mergeValidationSummaries([
        createValidationSummary([
          {
            code: "STATIC_WARNING",
            level: "static",
            severity: "warning",
            message: "Optional metadata is missing.",
            source: "llms-txt",
            evidence: [evidence],
            suggestedAction: "Add optional metadata."
          }
        ]),
        createEmptyValidationSummary()
      ])
    ).toEqual({
      passed: true,
      failures: [],
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

  it("integrates readiness scoring with validation blockers", () => {
    const report = createValidationReadinessReport(createReadyApplicationModel(), [
      createValidationSummary([
        {
          code: "OPENAPI_OPERATION_MISSING",
          level: "static",
          severity: "error",
          message: "OpenAPI document is missing GET /api/products.",
          source: "openapi",
          evidence: [evidence],
          suggestedAction: "Regenerate OpenAPI output."
        }
      ])
    ]);

    expect(report.ready).toBe(false);
    expect(report.readiness.score).toBe(100);
    expect(report.blockers).toMatchObject([
      {
        code: "OPENAPI_OPERATION_MISSING",
        severity: "error"
      }
    ]);
  });

  it("marks readiness report ready only when score is complete and validation passes", () => {
    expect(createValidationReadinessReport(createReadyApplicationModel(), [])).toMatchObject({
      schemaVersion: "0.1.0",
      ready: true,
      readiness: {
        score: 100,
        maxScore: 100
      },
      validation: {
        passed: true,
        failures: [],
        warnings: []
      },
      blockers: []
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

  it("runs standard-specific validation adapters and aggregates typed failures", async () => {
    const adapter: StandardAdapter = {
      id: "llms-txt",
      async assess() {
        throw new Error("unused");
      },
      async generate() {
        throw new Error("unused");
      },
      async validate() {
        return {
          standardId: "llms-txt",
          valid: false,
          issues: [
            {
              code: "LLMS_TXT_ROUTE_MISSING",
              severity: "error",
              message: "llms.txt does not reference route /products.",
              path: "public/llms.txt",
              evidence: [evidence]
            }
          ]
        };
      }
    };

    await expect(
      runStandardValidation([adapter], {
        model: createApplicationModel(),
        generatedChanges: []
      })
    ).resolves.toMatchObject({
      passed: false,
      failures: [
        {
          code: "LLMS_TXT_ROUTE_MISSING",
          level: "static",
          severity: "error",
          source: "llms-txt",
          suggestedAction: "Repair llms-txt output and rerun descuff validate."
        }
      ],
      warnings: []
    });
  });

  it("converts standard validation runner exceptions into actionable failures", async () => {
    const adapter: StandardAdapter = {
      id: "openapi",
      async assess() {
        throw new Error("unused");
      },
      async generate() {
        throw new Error("unused");
      },
      async validate() {
        throw new Error("invalid parser state");
      }
    };

    await expect(
      runStandardValidation([adapter], {
        model: createApplicationModel(),
        generatedChanges: []
      })
    ).resolves.toMatchObject({
      passed: false,
      failures: [
        {
          code: "STANDARD_VALIDATION_RUNNER_FAILED",
          level: "static",
          severity: "error",
          message: "openapi validation runner failed: invalid parser state",
          source: "openapi"
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

  it("fails runtime validation when semantic routes and APIs are not observed", () => {
    expect(
      validateRuntimeObservations(
        createReadyApplicationModel(),
        createEmptyStructuralAnalysis("/repo")
      )
    ).toMatchObject({
      passed: false,
      failures: [
        {
          code: "RUNTIME_ROUTE_NOT_OBSERVED",
          level: "runtime",
          severity: "error",
          source: "route:/"
        },
        {
          code: "RUNTIME_API_NOT_OBSERVED",
          level: "runtime",
          severity: "error",
          source: "api:GET:/api/products"
        }
      ],
      warnings: []
    });
  });

  it("fails runtime validation when observed routes and APIs return failed statuses", () => {
    const analysis = createEmptyStructuralAnalysis("/repo");
    analysis.runtimeRoutes.push({
      id: "runtime-route:/",
      path: "/",
      status: 500,
      evidence: [evidence]
    });
    analysis.runtimeApiOperations.push({
      id: "runtime-api:GET:/api/products",
      method: "GET",
      path: "/api/products",
      status: 404,
      evidence: [evidence]
    });

    expect(validateRuntimeObservations(createReadyApplicationModel(), analysis)).toMatchObject({
      passed: false,
      failures: [
        {
          code: "RUNTIME_ROUTE_STATUS_FAILED",
          level: "runtime",
          severity: "error",
          source: "route:/"
        },
        {
          code: "RUNTIME_API_STATUS_FAILED",
          level: "runtime",
          severity: "error",
          source: "api:GET:/api/products"
        }
      ],
      warnings: []
    });
  });

  it("passes runtime validation when semantic routes and read APIs are observed successfully", () => {
    const analysis = createEmptyStructuralAnalysis("/repo");
    analysis.runtimeRoutes.push({
      id: "runtime-route:/",
      path: "/",
      status: 200,
      evidence: [evidence]
    });
    analysis.runtimeApiOperations.push({
      id: "runtime-api:GET:/api/products",
      method: "GET",
      path: "/api/products",
      status: 200,
      evidence: [evidence]
    });

    expect(validateRuntimeObservations(createReadyApplicationModel(), analysis)).toEqual({
      passed: true,
      failures: [],
      warnings: []
    });
  });

  it("fails security validation when authenticated capabilities have no auth boundary", () => {
    expect(
      validateSecurityModel({
        ...createApplicationModel(),
        capabilities: [
          {
            id: "capability:orders",
            name: "View orders",
            operationType: "read",
            risk: "AUTHENTICATED_READ",
            visibility: "authenticated",
            inputs: [],
            outputs: [],
            linkedRoutes: ["/orders"],
            linkedApis: [],
            evidence: [evidence],
            confidence: "high"
          }
        ]
      })
    ).toMatchObject({
      passed: false,
      failures: [
        {
          code: "SECURITY_AUTH_BOUNDARY_MISSING",
          level: "security",
          severity: "error",
          source: "capability:orders"
        }
      ],
      warnings: []
    });
  });

  it("fails security validation when authenticated-read capabilities are marked public", () => {
    expect(
      validateSecurityModel({
        ...createApplicationModel(),
        capabilities: [
          {
            id: "capability:profile",
            name: "View profile",
            operationType: "read",
            risk: "AUTHENTICATED_READ",
            visibility: "public",
            inputs: [],
            outputs: [],
            linkedRoutes: ["/profile"],
            linkedApis: [],
            evidence: [evidence],
            confidence: "high"
          }
        ]
      })
    ).toMatchObject({
      passed: false,
      failures: [
        {
          code: "SECURITY_AUTHENTICATED_READ_EXPOSED_PUBLICLY",
          level: "security",
          severity: "error",
          source: "capability:profile"
        }
      ],
      warnings: []
    });
  });

  it("fails security validation when sensitive capabilities are public", () => {
    expect(
      validateSecurityModel({
        ...createApplicationModel(),
        capabilities: [
          {
            id: "capability:checkout",
            name: "Checkout",
            operationType: "write",
            risk: "HIGH_CONSEQUENCE",
            visibility: "public",
            inputs: [],
            outputs: [],
            linkedRoutes: [],
            linkedApis: ["/api/checkout"],
            evidence: [evidence],
            confidence: "high"
          }
        ]
      })
    ).toMatchObject({
      passed: false,
      failures: [
        {
          code: "SECURITY_SENSITIVE_CAPABILITY_PUBLIC",
          level: "security",
          severity: "error",
          source: "capability:checkout"
        }
      ],
      warnings: []
    });
  });

  it("passes security validation for authenticated capabilities with auth evidence", () => {
    expect(
      validateSecurityModel({
        ...createApplicationModel(),
        capabilities: [
          {
            id: "capability:orders",
            name: "View orders",
            operationType: "read",
            risk: "AUTHENTICATED_READ",
            visibility: "authenticated",
            inputs: [],
            outputs: [],
            linkedRoutes: ["/orders"],
            linkedApis: [],
            evidence: [evidence],
            confidence: "high"
          }
        ],
        authentication: {
          boundaries: [
            {
              id: "auth:middleware",
              kind: "middleware",
              sourceFile: "middleware.ts",
              evidence: [evidence]
            }
          ],
          evidence: [evidence]
        }
      })
    ).toEqual({
      passed: true,
      failures: [],
      warnings: []
    });
  });

  it("detects missing routes during UI regression validation", () => {
    expect(
      validateUiRegression(
        {
          schemaVersion: "0.1.0",
          recordedAt: "2026-08-20T00:00:00.000Z",
          routes: [
            {
              route: "/",
              title: "Store",
              headings: ["Products"],
              evidence: [evidence]
            }
          ]
        },
        []
      )
    ).toMatchObject({
      passed: false,
      failures: [
        {
          code: "UI_REGRESSION_ROUTE_MISSING",
          level: "regression",
          severity: "error",
          source: "/"
        }
      ],
      warnings: []
    });
  });

  it("detects title and heading UI regressions", () => {
    expect(
      validateUiRegression(
        {
          schemaVersion: "0.1.0",
          recordedAt: "2026-08-20T00:00:00.000Z",
          routes: [
            {
              route: "/",
              title: "Store",
              headings: ["Products"],
              evidence: [evidence]
            }
          ]
        },
        [
          {
            route: "/",
            title: "Catalog",
            headings: ["Featured"],
            evidence: [evidence]
          }
        ]
      )
    ).toMatchObject({
      passed: false,
      failures: [
        {
          code: "UI_REGRESSION_TITLE_CHANGED",
          level: "regression",
          severity: "error",
          source: "/"
        },
        {
          code: "UI_REGRESSION_HEADING_MISSING",
          level: "regression",
          severity: "error",
          source: "/"
        }
      ],
      warnings: []
    });
  });

  it("reports accessibility landmark changes as UI regression warnings", () => {
    expect(
      validateUiRegression(
        {
          schemaVersion: "0.1.0",
          recordedAt: "2026-08-20T00:00:00.000Z",
          routes: [
            {
              route: "/",
              title: "Store",
              headings: ["Products"],
              landmarkCount: 4,
              evidence: [evidence]
            }
          ]
        },
        [
          {
            route: "/",
            title: "Store",
            headings: ["Products"],
            landmarkCount: 3,
            evidence: [evidence]
          }
        ]
      )
    ).toMatchObject({
      passed: true,
      failures: [],
      warnings: [
        {
          code: "UI_REGRESSION_LANDMARK_COUNT_CHANGED",
          level: "regression",
          severity: "warning",
          source: "/"
        }
      ]
    });
  });

  it("passes UI regression validation when route invariants are unchanged", () => {
    expect(
      validateUiRegression(
        {
          schemaVersion: "0.1.0",
          recordedAt: "2026-08-20T00:00:00.000Z",
          routes: [
            {
              route: "/",
              title: "Store",
              headings: ["Products"],
              landmarkCount: 4,
              evidence: [evidence]
            }
          ]
        },
        [
          {
            route: "/",
            title: "Store",
            headings: ["Products"],
            landmarkCount: 4,
            evidence: [evidence]
          }
        ]
      )
    ).toEqual({
      passed: true,
      failures: [],
      warnings: []
    });
  });
});

function createApplicationModel(): ApplicationModel {
  return {
    schemaVersion: "0.1.0",
    project: {
      rootDir: "/repo",
      framework: "nextjs",
      evidence: [evidence]
    },
    applicationType: {
      type: "ecommerce",
      confidence: "high",
      evidence: [evidence]
    },
    entities: [],
    capabilities: [],
    routes: [],
    apis: [],
    authentication: {
      boundaries: [],
      evidence: []
    },
    integrations: [],
    standards: [],
    evidence: {
      items: [evidence]
    }
  };
}

function createReadyApplicationModel(): ApplicationModel {
  return {
    ...createApplicationModel(),
    entities: [
      {
        id: "entity:product",
        name: "Product",
        kind: "catalog",
        properties: [],
        relationships: [],
        evidence: [evidence]
      }
    ],
    capabilities: [
      {
        id: "capability:search",
        name: "Search products",
        operationType: "read",
        risk: "PUBLIC_READ",
        visibility: "public",
        inputs: [],
        outputs: [],
        linkedRoutes: ["/"],
        linkedApis: ["api:GET:/api/products"],
        evidence: [evidence],
        confidence: "high"
      }
    ],
    routes: [
      {
        id: "route:/",
        path: "/",
        routerKind: "next-app",
        sourceFile: "app/page.tsx",
        runtimeObserved: true,
        evidence: [evidence]
      }
    ],
    apis: [
      {
        id: "api:GET:/api/products",
        path: "/api/products",
        method: "GET",
        sourceFile: "app/api/products/route.ts",
        runtimeObserved: true,
        sideEffect: "read",
        evidence: [evidence]
      }
    ],
    standards: [
      {
        id: "standard:llms-txt",
        kind: "llms-txt",
        sourceFile: "public/llms.txt",
        evidence: [evidence]
      },
      {
        id: "standard:schema-org",
        kind: "schema-org",
        sourceFile: "app/page.tsx",
        evidence: [evidence]
      }
    ]
  };
}
