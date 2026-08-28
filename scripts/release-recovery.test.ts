import { describe, expect, it } from "vitest";
import { createRecoveryPlan, renderRecoveryPlan } from "./release-recovery.mjs";

describe("release recovery drill", () => {
  it("passes verified releases without recovery actions", () => {
    const plan = createRecoveryPlan({
      version: "0.13.1",
      issues: []
    });

    expect(plan).toEqual({
      status: "verified",
      actions: [
        {
          code: "NO_RECOVERY_NEEDED",
          message: "0.13.1 is verified. No recovery action is needed."
        }
      ]
    });
  });

  it("recommends waiting only for likely npm tarball propagation", () => {
    const plan = createRecoveryPlan({
      version: "0.13.1",
      issues: [
        {
          code: "TARBALL_UNREACHABLE",
          packageName: "@descuff/core",
          message: "Tarball is not reachable."
        }
      ]
    });

    expect(plan.actions.map((action) => action.code)).toEqual([
      "WAIT_FOR_PROPAGATION",
      "RECORD_CHANGELOG_RECOVERY_NOTE"
    ]);
  });

  it("recommends patching and deprecating when an internal package is missing", () => {
    const plan = createRecoveryPlan({
      version: "0.13.1",
      issues: [
        {
          code: "INTERNAL_DEPENDENCY_PACKUMENT_MISSING",
          packageName: "descuff",
          message: "@descuff/drift-core is not readable from npm."
        }
      ]
    });

    expect(plan.actions.map((action) => action.code)).toEqual([
      "PUBLISH_PATCH_VERSION",
      "RECORD_CHANGELOG_RECOVERY_NOTE",
      "DEPRECATE_BROKEN_VERSION"
    ]);
  });

  it("recommends repairing latest when the dist tag points at the wrong version", () => {
    const plan = createRecoveryPlan({
      version: "0.13.1",
      issues: [
        {
          code: "LATEST_DIST_TAG_MISMATCH",
          packageName: "descuff",
          message: "latest is 0.12.9; expected 0.13.1."
        }
      ]
    });

    expect(plan.actions.map((action) => action.code)).toEqual([
      "REPAIR_LATEST_DIST_TAG",
      "RECORD_CHANGELOG_RECOVERY_NOTE"
    ]);
  });

  it("renders an actionable simulated recovery plan", () => {
    const output = renderRecoveryPlan(
      createRecoveryPlan({
        version: "0.13.1",
        issues: [
          {
            code: "INTERNAL_DEPENDENCY_RANGE_MISMATCH",
            packageName: "descuff",
            message: "@descuff/core range is stale."
          }
        ]
      })
    );

    expect(output).toContain("Release recovery status: recovery-required");
    expect(output).toContain("PUBLISH_PATCH_VERSION");
    expect(output).toContain("DEPRECATE_BROKEN_VERSION");
  });
});
