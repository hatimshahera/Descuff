import { describe, expect, it } from "vitest";
import {
  validatePublishedPackageSet,
  validatePublishRequest,
  validateUnpublishedPackageSet
} from "./release-publish.mjs";

describe("release publish request checks", () => {
  it("passes when every public package matches the target version", () => {
    expect(
      validatePublishRequest({
        version: "0.13.1",
        packages: [
          { name: "@descuff/core", version: "0.13.1" },
          { name: "descuff", version: "0.13.1" }
        ]
      })
    ).toEqual({ passed: true, issues: [] });
  });

  it("fails invalid target versions", () => {
    const result = validatePublishRequest({
      version: "latest",
      packages: [{ name: "descuff", version: "0.13.1" }]
    });

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "PUBLISH_VERSION_INVALID",
        packageName: "workspace"
      })
    );
  });

  it("fails package versions that do not match the requested publish version", () => {
    const result = validatePublishRequest({
      version: "0.13.1",
      packages: [
        { name: "@descuff/core", version: "0.13.1" },
        { name: "descuff", version: "0.12.9" }
      ]
    });

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "PUBLISH_VERSION_MISMATCH",
        packageName: "descuff"
      })
    );
  });
});

describe("published package set validation", () => {
  it("passes when package packuments, latest tags, and tarballs are reachable", async () => {
    const result = await validatePublishedPackageSet({
      version: "0.13.1",
      packages: [
        {
          name: "@descuff/ir",
          version: "0.13.1",
          manifest: {},
          packageDir: "packages/ir"
        },
        {
          name: "@descuff/core",
          version: "0.13.1",
          manifest: {},
          packageDir: "packages/core"
        }
      ],
      readPackument: async (packageName: string) => ({
        name: packageName,
        version: "0.13.1",
        dist: {
          tarball: `https://registry.npmjs.org/${packageName}/-/package.tgz`
        }
      }),
      readDistTags: async () => ({ latest: "0.13.1" }),
      isTarballReachable: async () => true
    });

    expect(result).toEqual({ passed: true, issues: [] });
  });

  it("fails when a dependency package is not readable before CLI publish", async () => {
    const result = await validatePublishedPackageSet({
      version: "0.13.1",
      packages: [
        {
          name: "@descuff/core",
          version: "0.13.1",
          manifest: {},
          packageDir: "packages/core"
        }
      ],
      readPackument: async () => undefined,
      readDistTags: async () => ({ latest: "0.13.1" }),
      isTarballReachable: async () => true
    });

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "PACKUMENT_MISSING",
        packageName: "@descuff/core"
      })
    );
  });

  it("fails when a dependency tarball is not reachable before CLI publish", async () => {
    const result = await validatePublishedPackageSet({
      version: "0.13.1",
      packages: [
        {
          name: "@descuff/core",
          version: "0.13.1",
          manifest: {},
          packageDir: "packages/core"
        }
      ],
      readPackument: async () => ({
        name: "@descuff/core",
        version: "0.13.1",
        dist: {
          tarball: "https://registry.npmjs.org/@descuff/core/-/core.tgz"
        }
      }),
      readDistTags: async () => ({ latest: "0.13.1" }),
      isTarballReachable: async () => false
    });

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "TARBALL_UNREACHABLE",
        packageName: "@descuff/core"
      })
    );
  });
});

describe("unpublished package set validation", () => {
  it("passes when no package version is already readable from npm", async () => {
    await expect(
      validateUnpublishedPackageSet({
        version: "0.13.2",
        packages: [{ name: "descuff", version: "0.13.2" }],
        readPackument: async () => undefined
      })
    ).resolves.toEqual({ passed: true, issues: [] });
  });

  it("fails before publish when a package version already exists", async () => {
    const result = await validateUnpublishedPackageSet({
      version: "0.13.1",
      packages: [{ name: "@descuff/ir", version: "0.13.1" }],
      readPackument: async (packageName: string) => ({
        name: packageName,
        version: "0.13.1"
      })
    });

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "PUBLISH_VERSION_ALREADY_EXISTS",
        packageName: "@descuff/ir"
      })
    );
  });
});
