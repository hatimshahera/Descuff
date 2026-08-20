import { describe, expect, it } from "vitest";
import {
  checkGeneratedChangeIdempotency,
  createDryRunDiffs,
  createSensitiveCapabilityApprovalGates,
  generatedChangeSafetyForApprovalGates,
  planGeneratedChangeApplications,
  standardAdapterLifecycle,
  type GeneratedChange
} from "../src/index.js";

describe("@descuff/standard-core", () => {
  it("defines the standard adapter lifecycle order", () => {
    expect(standardAdapterLifecycle).toEqual([
      "assess",
      "generate",
      "plan",
      "apply-safe",
      "coding-agent",
      "validate"
    ]);
  });

  it("creates dry-run diffs without mutating files", () => {
    const changes: GeneratedChange[] = [
      {
        standardId: "llms-txt",
        id: "llms-txt:create",
        kind: "create-file",
        path: "public/llms.txt",
        content: "# App\n\n> Generated",
        deterministic: true,
        safety: "automatic",
        conflictPolicy: "approval-required",
        evidence: []
      }
    ];

    expect(createDryRunDiffs(changes, new Map([["public/llms.txt", "# Existing"]]))).toEqual([
      {
        changeId: "llms-txt:create",
        path: "public/llms.txt",
        before: "# Existing",
        after: "# App\n\n> Generated",
        conflictPolicy: "approval-required"
      }
    ]);
  });

  it("plans existing-file conflicts without writing files", () => {
    const [change] = changes({ conflictPolicy: "approval-required" });

    expect(
      planGeneratedChangeApplications([change], new Map([["public/llms.txt", "# Existing"]]))
    ).toEqual([
      {
        change,
        status: "requires-approval",
        existingContent: "# Existing",
        reason: "Existing file differs and requires explicit approval before replacement."
      }
    ]);
  });

  it("treats already-applied generated content as idempotent", () => {
    const [change] = changes({ conflictPolicy: "approval-required" });

    expect(
      planGeneratedChangeApplications([change], new Map([["public/llms.txt", change.content]]))
    ).toEqual([
      {
        change,
        status: "already-applied",
        existingContent: change.content,
        reason: "Existing file already matches the generated change."
      }
    ]);
  });

  it("checks generated changes for deterministic idempotency", () => {
    const first = changes({ conflictPolicy: "approval-required" });
    const second = changes({ conflictPolicy: "approval-required" });

    expect(checkGeneratedChangeIdempotency(first, second)).toEqual({
      idempotent: true,
      issues: []
    });
    expect(
      checkGeneratedChangeIdempotency(first, [
        {
          ...second[0],
          content: "# Different"
        }
      ])
    ).toEqual({
      idempotent: false,
      issues: [
        {
          changeId: "llms-txt:create",
          path: "public/llms.txt",
          message: "Generated change differed between generation passes."
        }
      ]
    });
  });

  it("creates approval gates for sensitive and high-consequence capabilities", () => {
    const gates = createSensitiveCapabilityApprovalGates([
      capability("capability:get:products", "PUBLIC_READ"),
      capability("capability:delete:account", "SENSITIVE_WRITE"),
      capability("capability:post:checkout", "HIGH_CONSEQUENCE")
    ]);

    expect(gates).toEqual([
      {
        id: "approval:capability:delete:account",
        kind: "sensitive-capability",
        capabilityId: "capability:delete:account",
        risk: "SENSITIVE_WRITE",
        message: "SENSITIVE_WRITE capability requires explicit developer approval before exposure.",
        evidence: []
      },
      {
        id: "approval:capability:post:checkout",
        kind: "high-consequence-capability",
        capabilityId: "capability:post:checkout",
        risk: "HIGH_CONSEQUENCE",
        message:
          "HIGH_CONSEQUENCE capability requires explicit developer approval before exposure.",
        evidence: []
      }
    ]);
    expect(generatedChangeSafetyForApprovalGates(gates)).toBe("approval-required");
    expect(generatedChangeSafetyForApprovalGates([])).toBe("automatic");
  });
});

function changes(options: {
  conflictPolicy: GeneratedChange["conflictPolicy"];
}): GeneratedChange[] {
  return [
    {
      standardId: "llms-txt",
      id: "llms-txt:create",
      kind: "create-file",
      path: "public/llms.txt",
      content: "# App\n\n> Generated",
      deterministic: true,
      safety: "automatic",
      conflictPolicy: options.conflictPolicy,
      evidence: []
    }
  ];
}

function capability(id: string, risk: "PUBLIC_READ" | "SENSITIVE_WRITE" | "HIGH_CONSEQUENCE") {
  return {
    id,
    name: id,
    operationType: risk === "PUBLIC_READ" ? ("read" as const) : ("write" as const),
    risk,
    visibility: "public" as const,
    inputs: [],
    outputs: [],
    linkedRoutes: [],
    linkedApis: [],
    evidence: [],
    confidence: "high" as const
  };
}
