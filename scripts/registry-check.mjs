import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readPublicPackages } from "./release-graph.mjs";

const runtimeDependencyFields = ["dependencies", "peerDependencies", "optionalDependencies"];

export function validateRegistryState(input) {
  const issues = [];
  const byName = new Map(input.packages.map((pkg) => [pkg.name, pkg]));

  for (const pkg of input.packages) {
    const packument = input.packuments[pkg.name];
    if (packument === undefined) {
      issues.push(issue("PACKUMENT_MISSING", pkg.name, `${pkg.name}@${input.version} is missing.`));
      continue;
    }

    if (packument.name !== pkg.name) {
      issues.push(
        issue("PACKUMENT_NAME_MISMATCH", pkg.name, `Packument name is ${packument.name}.`)
      );
    }

    if (packument.version !== input.version) {
      issues.push(
        issue(
          "PACKUMENT_VERSION_MISMATCH",
          pkg.name,
          `Packument version is ${packument.version}; expected ${input.version}.`
        )
      );
    }

    const distTag = input.distTags[pkg.name]?.latest;
    if (distTag !== input.version) {
      issues.push(
        issue(
          "LATEST_DIST_TAG_MISMATCH",
          pkg.name,
          `latest is ${distTag}; expected ${input.version}.`
        )
      );
    }

    const tarball = packument.dist?.tarball;
    if (typeof tarball !== "string" || tarball.length === 0) {
      issues.push(issue("TARBALL_URL_MISSING", pkg.name, "Packument is missing dist.tarball."));
    } else if (input.tarballs[tarball] !== true) {
      issues.push(issue("TARBALL_UNREACHABLE", pkg.name, `Tarball is not reachable: ${tarball}.`));
    }

    for (const field of runtimeDependencyFields) {
      const dependencies = packument[field] ?? {};
      for (const [dependencyName, range] of Object.entries(dependencies)) {
        if (!byName.has(dependencyName)) {
          continue;
        }

        const dependencyPackument = input.packuments[dependencyName];
        if (dependencyPackument === undefined) {
          issues.push(
            issue(
              "INTERNAL_DEPENDENCY_PACKUMENT_MISSING",
              pkg.name,
              `${field}.${dependencyName} points at a package with no readable packument.`
            )
          );
          continue;
        }

        if (range !== `^${input.version}`) {
          issues.push(
            issue(
              "INTERNAL_DEPENDENCY_RANGE_MISMATCH",
              pkg.name,
              `${field}.${dependencyName} is ${range}; expected ^${input.version}.`
            )
          );
        }

        if (dependencyPackument.version !== input.version) {
          issues.push(
            issue(
              "INTERNAL_DEPENDENCY_VERSION_UNAVAILABLE",
              pkg.name,
              `${dependencyName}@${input.version} is not readable from npm.`
            )
          );
        }
      }
    }
  }

  return {
    passed: issues.length === 0,
    issues
  };
}

export function renderRegistryIssues(issues) {
  return [
    "Post-publish registry check failed:",
    ...issues.map((item) => `- [${item.code}] ${item.packageName}: ${item.message}`)
  ].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const versionArg = args.find((arg) => !arg.startsWith("--"));
  const skipInstall = args.includes("--skip-install");
  const packages = readPublicPackages();
  const version = versionArg ?? readCliVersion();
  const packuments = {};
  const distTags = {};
  const tarballs = {};

  for (const pkg of packages) {
    console.log(`Verifying ${pkg.name}@${version}...`);
    packuments[pkg.name] = npmJson(["view", `${pkg.name}@${version}`, "--json"]);
    distTags[pkg.name] = npmJson(["view", pkg.name, "dist-tags", "--json"]);

    const tarball = packuments[pkg.name]?.dist?.tarball;
    if (typeof tarball === "string") {
      tarballs[tarball] = await isReachable(tarball);
    }
  }

  const result = validateRegistryState({ packages, version, packuments, distTags, tarballs });
  if (!result.passed) {
    throw new Error(renderRegistryIssues(result.issues));
  }

  if (!skipInstall) {
    runFreshInstallSmoke(version);
  }

  console.log(`Post-publish registry check passed for descuff@${version}.`);
}

function npmJson(args) {
  const result = spawnSync("npm", args, {
    encoding: "utf8",
    stdio: "pipe"
  });

  if (result.status !== 0) {
    throw new Error(
      [`npm ${args.join(" ")} failed.`, result.stderr.trim()].filter(Boolean).join("\n")
    );
  }

  return JSON.parse(result.stdout);
}

async function isReachable(url) {
  const response = await globalThis.fetch(url, { method: "HEAD" });
  return response.ok;
}

function runFreshInstallSmoke(version) {
  const workDir = mkdtempSync(join(tmpdir(), "descuff-registry-install-smoke-"));

  try {
    writeFileSync(
      join(workDir, "package.json"),
      `${JSON.stringify(
        {
          private: true,
          type: "module",
          dependencies: {
            descuff: version
          }
        },
        null,
        2
      )}\n`
    );

    run("npm", ["install", "--ignore-scripts", "--package-lock=false", "--no-audit", "--no-fund"], {
      cwd: workDir,
      timeout: 120_000
    });
    run("npx", ["descuff", "--help"], { cwd: workDir, timeout: 30_000 });
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

function run(command, args, options) {
  console.log(`$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    ...options,
    encoding: "utf8",
    stdio: "pipe"
  });

  if (result.status !== 0) {
    throw new Error(
      [
        `${command} ${args.join(" ")} failed with exit code ${result.status}.`,
        result.signal === null ? "" : `Terminated by signal ${result.signal}.`,
        result.error === undefined ? "" : result.error.message,
        result.stdout.trim(),
        result.stderr.trim()
      ]
        .filter(Boolean)
        .join("\n")
    );
  }
}

function readCliVersion() {
  return JSON.parse(readFileSync("packages/cli/package.json", "utf8")).version;
}

function issue(code, packageName, message) {
  return { code, packageName, message };
}
