import { describe, expect, it } from "vitest";
import { validateRegistryState } from "./registry-check.mjs";

describe("registry checks", () => {
  it("passes readable packuments, matching latest tags, reachable tarballs, and internal ranges", () => {
    const packages = fixturePackages();
    const result = validateRegistryState({
      packages,
      version: "0.13.1",
      packuments: fixturePackuments(),
      distTags: {
        "@descuff/core": { latest: "0.13.1" },
        descuff: { latest: "0.13.1" }
      },
      tarballs: {
        "https://registry.npmjs.org/@descuff/core/-/core-0.13.1.tgz": true,
        "https://registry.npmjs.org/descuff/-/descuff-0.13.1.tgz": true
      }
    });

    expect(result).toEqual({ passed: true, issues: [] });
  });

  it("fails missing packuments", () => {
    const result = validateRegistryState({
      packages: fixturePackages(),
      version: "0.13.1",
      packuments: fixturePackuments({ descuff: undefined }),
      distTags: {
        "@descuff/core": { latest: "0.13.1" }
      },
      tarballs: {
        "https://registry.npmjs.org/@descuff/core/-/core-0.13.1.tgz": true
      }
    });

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "PACKUMENT_MISSING",
        packageName: "descuff"
      })
    );
  });

  it("fails latest dist-tags that do not point at the target version", () => {
    const result = validateRegistryState({
      packages: fixturePackages(),
      version: "0.13.1",
      packuments: fixturePackuments(),
      distTags: {
        "@descuff/core": { latest: "0.13.1" },
        descuff: { latest: "0.12.9" }
      },
      tarballs: {
        "https://registry.npmjs.org/@descuff/core/-/core-0.13.1.tgz": true,
        "https://registry.npmjs.org/descuff/-/descuff-0.13.1.tgz": true
      }
    });

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "LATEST_DIST_TAG_MISMATCH",
        packageName: "descuff"
      })
    );
  });

  it("fails unreachable tarballs and stale internal ranges", () => {
    const packuments = fixturePackuments({
      descuff: {
        name: "descuff",
        version: "0.13.1",
        dist: { tarball: "https://registry.npmjs.org/descuff/-/descuff-0.13.1.tgz" },
        dependencies: {
          "@descuff/core": "^0.12.9"
        }
      }
    });

    const result = validateRegistryState({
      packages: fixturePackages(),
      version: "0.13.1",
      packuments,
      distTags: {
        "@descuff/core": { latest: "0.13.1" },
        descuff: { latest: "0.13.1" }
      },
      tarballs: {
        "https://registry.npmjs.org/@descuff/core/-/core-0.13.1.tgz": true,
        "https://registry.npmjs.org/descuff/-/descuff-0.13.1.tgz": false
      }
    });

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "TARBALL_UNREACHABLE",
        packageName: "descuff"
      })
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "INTERNAL_DEPENDENCY_RANGE_MISMATCH",
        packageName: "descuff"
      })
    );
  });
});

function fixturePackages() {
  return [
    { name: "@descuff/core", version: "0.13.1", packageDir: "packages/core", manifest: {} },
    { name: "descuff", version: "0.13.1", packageDir: "packages/cli", manifest: {} }
  ];
}

function fixturePackuments(overrides: Record<string, unknown> = {}) {
  const packuments: Record<string, unknown> = {
    "@descuff/core": {
      name: "@descuff/core",
      version: "0.13.1",
      dist: { tarball: "https://registry.npmjs.org/@descuff/core/-/core-0.13.1.tgz" }
    },
    descuff: {
      name: "descuff",
      version: "0.13.1",
      dist: { tarball: "https://registry.npmjs.org/descuff/-/descuff-0.13.1.tgz" },
      dependencies: {
        "@descuff/core": "^0.13.1"
      }
    }
  };

  for (const [name, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete packuments[name];
    } else {
      packuments[name] = value;
    }
  }

  return packuments;
}
