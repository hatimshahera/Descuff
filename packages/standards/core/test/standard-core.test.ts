import { describe, expect, it } from "vitest";
import {
  checkGeneratedChangeIdempotency,
  createDryRunDiffs,
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
