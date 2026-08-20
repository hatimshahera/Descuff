import { describe, expect, it } from "vitest";
import { createDryRunDiffs, standardAdapterLifecycle, type GeneratedChange } from "../src/index.js";

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
});
