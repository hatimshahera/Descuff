import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createPublishOrder,
  readPublicPackages,
  renderPublishOrder,
  validateReleaseGraph
} from "./release-graph.mjs";
import { renderRegistryIssues, validateRegistryState } from "./registry-check.mjs";

export function validatePublishRequest(input) {
  const issues = [];

  if (!/^\d+\.\d+\.\d+$/.test(input.version)) {
    issues.push({
      code: "PUBLISH_VERSION_INVALID",
      packageName: "workspace",
      message: `Publish version must be a concrete semver version, got ${input.version}.`
    });
  }

  for (const pkg of input.packages) {
    if (pkg.version !== input.version) {
      issues.push({
        code: "PUBLISH_VERSION_MISMATCH",
        packageName: pkg.name,
        message: `${pkg.name} is ${pkg.version}; expected ${input.version}.`
      });
    }
  }

  return {
    passed: issues.length === 0,
    issues
  };
}

export function renderPublishRequestIssues(issues) {
  return [
    "Release publish request failed:",
    ...issues.map((issue) => `- [${issue.code}] ${issue.packageName}: ${issue.message}`)
  ].join("\n");
}

export async function validatePublishedPackageSet(input) {
  const packuments = {};
  const distTags = {};
  const tarballs = {};

  for (const pkg of input.packages) {
    packuments[pkg.name] = await input.readPackument(pkg.name, input.version);
    distTags[pkg.name] = await input.readDistTags(pkg.name);

    const tarball = packuments[pkg.name]?.dist?.tarball;
    if (typeof tarball === "string") {
      tarballs[tarball] = await input.isTarballReachable(tarball);
    }
  }

  return validateRegistryState({
    packages: input.packages,
    version: input.version,
    packuments,
    distTags,
    tarballs
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const version = args.find((arg) => !arg.startsWith("--"));

  if (version === undefined) {
    throw new Error("Usage: node scripts/release-publish.mjs <version> [--dry-run]");
  }

  const packages = readPublicPackages();
  const graph = validateReleaseGraph({
    packages,
    vitestConfigText: readFileSync("vitest.config.ts", "utf8"),
    lockfileText: readFileSync("pnpm-lock.yaml", "utf8")
  });

  if (!graph.passed) {
    throw new Error(
      [
        "Release package graph check failed:",
        ...graph.issues.map((issue) => `- [${issue.code}] ${issue.packageName}: ${issue.message}`)
      ].join("\n")
    );
  }

  const request = validatePublishRequest({ packages, version });
  if (!request.passed) {
    throw new Error(renderPublishRequestIssues(request.issues));
  }

  const publishOrder = createPublishOrder(packages);
  console.log("Dependency-first publish order:");
  console.log(renderPublishOrder(packages));

  for (const pkg of publishOrder) {
    if (!dryRun) {
      const dependencyPackages = internalDependencyPackages(pkg, packages);
      if (dependencyPackages.length > 0) {
        await waitForPublishedPackageSet(
          dependencyPackages,
          version,
          `dependencies for ${pkg.name}`
        );
      }
    }

    const commandArgs = ["publish", "--access", "public"];
    if (dryRun) {
      commandArgs.push("--dry-run");
    }

    console.log(`$ npm ${commandArgs.join(" ")} # ${pkg.name}@${version}`);
    if (!dryRun) {
      run("npm", commandArgs, { cwd: pkg.packageDir, timeout: 120_000 });
      await waitForPublishedPackageSet([pkg], version, pkg.name);
    }
  }

  console.log(
    dryRun
      ? `Release publish dry-run passed for ${version}.`
      : `Release publish completed for ${version}.`
  );
}

async function waitForPublishedPackageSet(packages, version, label, attempts = 12) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = await validatePublishedPackageSet({
      packages,
      version,
      readPackument: async (packageName, packageVersion) =>
        npmJsonOrUndefined(["view", `${packageName}@${packageVersion}`, "--json"]),
      readDistTags: async (packageName) =>
        npmJsonOrUndefined(["view", packageName, "dist-tags", "--json"]),
      isTarballReachable
    });

    if (result.passed) {
      console.log(`npm registry check passed for ${label}.`);
      return;
    }

    if (attempt < attempts) {
      await sleep(5_000);
      continue;
    }

    throw new Error(
      [
        `Refusing to continue before ${label} is publicly installable.`,
        renderRegistryIssues(result.issues)
      ].join("\n")
    );
  }
}

function internalDependencyPackages(pkg, packages) {
  const byName = new Map(packages.map((candidate) => [candidate.name, candidate]));
  const dependencies = [];

  for (const field of ["dependencies", "peerDependencies", "optionalDependencies"]) {
    for (const dependencyName of Object.keys(pkg.manifest[field] ?? {})) {
      const dependency = byName.get(dependencyName);
      if (dependency !== undefined) {
        dependencies.push(dependency);
      }
    }
  }

  return [...new Map(dependencies.map((dependency) => [dependency.name, dependency])).values()];
}

function npmJsonOrUndefined(args) {
  const result = spawnSync("npm", args, {
    encoding: "utf8",
    stdio: "pipe"
  });

  if (result.status !== 0) {
    return undefined;
  }

  return JSON.parse(result.stdout);
}

async function isTarballReachable(url) {
  const response = await globalThis.fetch(url, { method: "HEAD" });
  return response.ok;
}

function run(command, args, options) {
  const result = spawnSync(command, args, {
    ...options,
    encoding: "utf8",
    stdio: "inherit"
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}.`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}
