import { fileURLToPath } from "node:url";

const propagationIssueCodes = new Set(["TARBALL_UNREACHABLE"]);
const patchIssueCodes = new Set([
  "INTERNAL_DEPENDENCY_PACKUMENT_MISSING",
  "INTERNAL_DEPENDENCY_RANGE_MISMATCH",
  "INTERNAL_DEPENDENCY_VERSION_UNAVAILABLE",
  "PACKUMENT_MISSING",
  "PACKUMENT_VERSION_MISMATCH"
]);

export function createRecoveryPlan(input) {
  const actions = [];
  const issueCodes = new Set(input.issues.map((issue) => issue.code));

  if (input.issues.length === 0) {
    return {
      status: "verified",
      actions: [
        {
          code: "NO_RECOVERY_NEEDED",
          message: `${input.version} is verified. No recovery action is needed.`
        }
      ]
    };
  }

  if ([...issueCodes].some((code) => propagationIssueCodes.has(code))) {
    actions.push({
      code: "WAIT_FOR_PROPAGATION",
      message:
        "Wait briefly and rerun registry verification when packuments exist but tarballs are not reachable yet."
    });
  }

  if ([...issueCodes].some((code) => patchIssueCodes.has(code))) {
    actions.push({
      code: "PUBLISH_PATCH_VERSION",
      message:
        "Publish a new patch version with corrected internal package availability and dependency ranges. Do not try to rewrite the broken version."
    });
  }

  if (issueCodes.has("LATEST_DIST_TAG_MISMATCH")) {
    actions.push({
      code: "REPAIR_LATEST_DIST_TAG",
      message:
        "Move latest to the last verified version or forward to a verified patch after the replacement publish passes."
    });
  }

  actions.push({
    code: "RECORD_CHANGELOG_RECOVERY_NOTE",
    message: "Record the broken version and replacement guidance in CHANGELOG.md."
  });

  if (actions.some((action) => action.code === "PUBLISH_PATCH_VERSION")) {
    actions.push({
      code: "DEPRECATE_BROKEN_VERSION",
      message:
        "Deprecate the broken version with a concise installability reason once a working replacement exists."
    });
  }

  return {
    status: "recovery-required",
    actions: dedupeActions(actions)
  };
}

export function renderRecoveryPlan(plan) {
  return [
    `Release recovery status: ${plan.status}`,
    ...plan.actions.map((action) => `- [${action.code}] ${action.message}`)
  ].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const plan = createRecoveryPlan({
    version: "0.13.1",
    issues: [
      {
        code: "INTERNAL_DEPENDENCY_PACKUMENT_MISSING",
        packageName: "descuff",
        message: "@descuff/drift-core is not readable from npm."
      },
      {
        code: "LATEST_DIST_TAG_MISMATCH",
        packageName: "descuff",
        message: "latest points at the broken version."
      }
    ]
  });

  console.log(renderRecoveryPlan(plan));
}

function dedupeActions(actions) {
  return [...new Map(actions.map((action) => [action.code, action])).values()];
}
