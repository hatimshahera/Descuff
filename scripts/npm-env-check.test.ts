import { describe, expect, it } from "vitest";
import {
  createNpmEnvironmentDiagnostics,
  renderNpmEnvironmentDiagnostics
} from "./npm-env-check.mjs";

describe("npm environment diagnostics", () => {
  it("warns when pnpm-only config leaks into npm", () => {
    const result = createNpmEnvironmentDiagnostics({
      env: {
        npm_config_prefer_workspace_packages: "true"
      },
      uid: 501,
      rootOwnedCachePaths: []
    });

    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: "PNPM_CONFIG_VISIBLE_TO_NPM"
      })
    );
  });

  it("warns when a non-root user has root-owned npm cache entries", () => {
    const result = createNpmEnvironmentDiagnostics({
      env: {},
      uid: 501,
      rootOwnedCachePaths: ["/Users/example/.npm/_cacache"]
    });

    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: "ROOT_OWNED_NPM_CACHE_ENTRY"
      })
    );
  });

  it("does not warn about root-owned cache paths while running as root", () => {
    const result = createNpmEnvironmentDiagnostics({
      env: {},
      uid: 0,
      rootOwnedCachePaths: ["/root/.npm"]
    });

    expect(result.warnings).toEqual([]);
  });

  it("renders clean diagnostics", () => {
    expect(
      renderNpmEnvironmentDiagnostics({
        passed: true,
        warnings: []
      })
    ).toBe("npm environment diagnostics passed.");
  });
});
