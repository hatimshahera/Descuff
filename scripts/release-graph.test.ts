import { describe, expect, it } from "vitest";
import { createPublishOrder, renderPublishOrder, validateReleaseGraph } from "./release-graph.mjs";

describe("release graph checks", () => {
  it("orders internal dependencies before dependents and keeps the CLI last", () => {
    const order = createPublishOrder(fixturePackages()).map((pkg) => pkg.name);

    expect(order.indexOf("@descuff/ir")).toBeLessThan(order.indexOf("@descuff/core"));
    expect(order.indexOf("@descuff/core")).toBeLessThan(order.indexOf("descuff"));
    expect(order.at(-1)).toBe("descuff");
  });

  it("renders a dependency-first publish plan", () => {
    expect(renderPublishOrder(fixturePackages())).toContain("1. @descuff/ir@0.13.1");
    expect(renderPublishOrder(fixturePackages())).toContain("3. descuff@0.13.1");
  });

  it("fails public packages without readmes when file checks are enabled", () => {
    const result = validateReleaseGraph({
      packages: fixturePackages(),
      fileExists: () => false
    });

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "PUBLIC_PACKAGE_README_MISSING",
        packageName: "@descuff/ir"
      })
    );
  });

  it("fails public packages without provenance-compatible repository metadata", () => {
    const packages = fixturePackages();
    packages[0]!.manifest.repository = { type: "git", url: "", directory: "packages/ir" };

    const result = validateReleaseGraph({ packages });

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "PUBLIC_PACKAGE_REPOSITORY_URL_MISMATCH",
        packageName: "@descuff/ir"
      })
    );
  });

  it("passes a valid public package graph", () => {
    const packages = fixturePackages();
    const result = validateReleaseGraph({
      packages,
      vitestConfigText: aliasText(packages),
      lockfileText: lockfileText(packages)
    });

    expect(result).toMatchObject({ passed: true, issues: [] });
  });

  it("fails when an internal runtime dependency has no public workspace package", () => {
    const result = validateReleaseGraph({
      packages: [
        packageInfo("descuff", "packages/cli", {
          dependencies: {
            "@descuff/missing": "^0.13.1"
          }
        })
      ]
    });

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "INTERNAL_DEPENDENCY_MISSING_WORKSPACE_PACKAGE",
        packageName: "descuff"
      })
    );
  });

  it("fails stale internal runtime dependency ranges", () => {
    const packages = fixturePackages();
    packages[1]!.manifest.dependencies["@descuff/ir"] = "^0.12.9";

    const result = validateReleaseGraph({ packages });

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "INTERNAL_DEPENDENCY_RANGE_MISMATCH",
        packageName: "@descuff/core"
      })
    );
  });

  it("fails workspace ranges in runtime dependencies", () => {
    const packages = fixturePackages();
    packages[1]!.manifest.dependencies["@descuff/ir"] = "workspace:*";

    const result = validateReleaseGraph({ packages });

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "WORKSPACE_RANGE_IN_RUNTIME_DEPENDENCY",
        packageName: "@descuff/core"
      })
    );
  });

  it("fails missing Vitest aliases for public packages", () => {
    const packages = fixturePackages();
    const result = validateReleaseGraph({
      packages,
      vitestConfigText: aliasText(packages.filter((pkg) => pkg.name !== "@descuff/core"))
    });

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "VITEST_ALIAS_MISSING",
        packageName: "@descuff/core"
      })
    );
  });

  it("fails missing lockfile importers and internal dependencies", () => {
    const packages = fixturePackages();
    const result = validateReleaseGraph({
      packages,
      lockfileText: [
        "importers:",
        "  packages/ir: {}",
        "  packages/cli:",
        "    dependencies:",
        '      "@descuff/core":'
      ].join("\n")
    });

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "LOCKFILE_IMPORTER_MISSING",
        packageName: "@descuff/core"
      })
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "LOCKFILE_INTERNAL_DEPENDENCY_MISSING",
        packageName: "@descuff/core"
      })
    );
  });

  it("accepts single-quoted dependency keys in pnpm lockfiles", () => {
    const packages = fixturePackages();
    const result = validateReleaseGraph({
      packages,
      lockfileText: [
        "importers:",
        "  packages/ir: {}",
        "  packages/core:",
        "    dependencies:",
        "      '@descuff/ir':",
        "  packages/cli:",
        "    dependencies:",
        "      '@descuff/core':",
        "      '@descuff/ir':"
      ].join("\n")
    });

    expect(result.issues).not.toContainEqual(
      expect.objectContaining({
        code: "LOCKFILE_INTERNAL_DEPENDENCY_MISSING"
      })
    );
  });
});

function fixturePackages() {
  return [
    packageInfo("@descuff/ir", "packages/ir"),
    packageInfo("@descuff/core", "packages/core", {
      dependencies: {
        "@descuff/ir": "^0.13.1"
      }
    }),
    packageInfo("descuff", "packages/cli", {
      dependencies: {
        "@descuff/core": "^0.13.1",
        "@descuff/ir": "^0.13.1"
      }
    })
  ];
}

function packageInfo(name: string, packageDir: string, manifest: Record<string, unknown> = {}) {
  return {
    name,
    version: "0.13.1",
    packageJsonPath: `${packageDir}/package.json`,
    packageDir,
    manifest: {
      name,
      version: "0.13.1",
      repository: {
        type: "git",
        url: "https://github.com/hatimshahera/Descuff",
        directory: packageDir
      },
      ...manifest
    }
  };
}

function aliasText(packages: Array<{ name: string }>) {
  return packages.map((pkg) => `"${pkg.name}"`).join("\n");
}

function lockfileText(
  packages: Array<{
    name: string;
    packageDir: string;
    manifest: { dependencies?: Record<string, string> };
  }>
) {
  return [
    "importers:",
    ...packages.flatMap((pkg) => [
      `  ${pkg.packageDir}:`,
      "    dependencies:",
      ...Object.keys(pkg.manifest.dependencies ?? {}).map((name) => `      "${name}":`)
    ])
  ].join("\n");
}
