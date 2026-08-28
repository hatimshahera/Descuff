import { readFileSync } from "node:fs";
import { dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const publicPackageJsonPaths = [
  "packages/agent-workflow/package.json",
  "packages/analyzers/graphify/package.json",
  "packages/analyzers/nextjs/package.json",
  "packages/analyzers/runtime/package.json",
  "packages/cli/package.json",
  "packages/config/package.json",
  "packages/core/package.json",
  "packages/drift/package.json",
  "packages/ir/package.json",
  "packages/reporter/package.json",
  "packages/standards/api-catalog/package.json",
  "packages/standards/core/package.json",
  "packages/standards/llms-txt/package.json",
  "packages/standards/openapi/package.json",
  "packages/standards/schema-org/package.json",
  "packages/standards/webmcp/package.json",
  "packages/validator/package.json"
];

const runtimeDependencyFields = ["dependencies", "peerDependencies", "optionalDependencies"];

export function readPublicPackages() {
  return publicPackageJsonPaths.map((packageJsonPath) => {
    const manifest = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    return {
      name: manifest.name,
      version: manifest.version,
      packageJsonPath,
      packageDir: dirname(packageJsonPath),
      manifest
    };
  });
}

export function validateReleaseGraph(input) {
  const packages = [...input.packages].sort((a, b) => a.name.localeCompare(b.name));
  const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
  const issues = [];

  for (const pkg of packages) {
    if (pkg.manifest.private === true) {
      issues.push(
        issue("PUBLIC_PACKAGE_MARKED_PRIVATE", pkg.name, "Public release package is private.")
      );
    }

    for (const field of runtimeDependencyFields) {
      const dependencies = pkg.manifest[field] ?? {};
      for (const [dependencyName, range] of Object.entries(dependencies)) {
        if (typeof range === "string" && range.startsWith("workspace:")) {
          issues.push(
            issue(
              "WORKSPACE_RANGE_IN_RUNTIME_DEPENDENCY",
              pkg.name,
              `${field}.${dependencyName} uses ${range}.`
            )
          );
        }

        if (!isDescuffPackageName(dependencyName)) {
          continue;
        }

        const dependency = byName.get(dependencyName);
        if (dependency === undefined) {
          issues.push(
            issue(
              "INTERNAL_DEPENDENCY_MISSING_WORKSPACE_PACKAGE",
              pkg.name,
              `${field}.${dependencyName} has no public workspace package.`
            )
          );
          continue;
        }

        const expectedRange = `^${dependency.version}`;
        if (range !== expectedRange) {
          issues.push(
            issue(
              "INTERNAL_DEPENDENCY_RANGE_MISMATCH",
              pkg.name,
              `${field}.${dependencyName} is ${range}; expected ${expectedRange}.`
            )
          );
        }
      }
    }
  }

  if (input.vitestConfigText !== undefined) {
    for (const pkg of packages) {
      if (!hasVitestAlias(input.vitestConfigText, pkg.name)) {
        issues.push(
          issue("VITEST_ALIAS_MISSING", pkg.name, `${pkg.name} is missing from vitest aliases.`)
        );
      }
    }
  }

  if (input.lockfileText !== undefined) {
    for (const pkg of packages) {
      if (!input.lockfileText.includes(`${pkg.packageDir}:`)) {
        issues.push(
          issue(
            "LOCKFILE_IMPORTER_MISSING",
            pkg.name,
            `${pkg.packageDir} is missing from pnpm-lock.yaml importers.`
          )
        );
      }
    }

    for (const pkg of packages) {
      for (const dependencyName of internalRuntimeDependencies(pkg, byName)) {
        if (!hasLockfileDependencyKey(input.lockfileText, dependencyName)) {
          issues.push(
            issue(
              "LOCKFILE_INTERNAL_DEPENDENCY_MISSING",
              pkg.name,
              `${dependencyName} is missing from pnpm-lock.yaml.`
            )
          );
        }
      }
    }
  }

  const publishOrder = createPublishOrder(packages);
  if (publishOrder.at(-1)?.name !== "descuff") {
    issues.push(issue("CLI_NOT_LAST_IN_PUBLISH_ORDER", "descuff", "The CLI must publish last."));
  }

  return {
    passed: issues.length === 0,
    issues,
    publishOrder
  };
}

export function createPublishOrder(packages) {
  const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
  const visited = new Set();
  const visiting = new Set();
  const order = [];

  for (const pkg of [...packages].sort((a, b) => a.name.localeCompare(b.name))) {
    visit(pkg, byName, visited, visiting, order);
  }

  return order;
}

export function renderPublishOrder(packages) {
  return createPublishOrder(packages)
    .map((pkg, index) => `${index + 1}. ${pkg.name}@${pkg.version} (${pkg.packageDir})`)
    .join("\n");
}

function visit(pkg, byName, visited, visiting, order) {
  if (visited.has(pkg.name)) {
    return;
  }
  if (visiting.has(pkg.name)) {
    throw new Error(`Release package graph has a cycle at ${pkg.name}.`);
  }

  visiting.add(pkg.name);
  for (const dependencyName of internalRuntimeDependencies(pkg, byName).sort()) {
    visit(byName.get(dependencyName), byName, visited, visiting, order);
  }
  visiting.delete(pkg.name);
  visited.add(pkg.name);
  order.push(pkg);
}

function internalRuntimeDependencies(pkg, byName) {
  const dependencies = [];
  for (const field of runtimeDependencyFields) {
    for (const dependencyName of Object.keys(pkg.manifest[field] ?? {})) {
      if (byName.has(dependencyName)) {
        dependencies.push(dependencyName);
      }
    }
  }
  return [...new Set(dependencies)];
}

function isDescuffPackageName(name) {
  return name === "descuff" || name.startsWith("@descuff/");
}

function hasVitestAlias(configText, packageName) {
  if (configText.includes(`"${packageName}"`) || configText.includes(`'${packageName}'`)) {
    return true;
  }
  return packageName === "descuff" && /\bdescuff\s*:/.test(configText);
}

function hasLockfileDependencyKey(lockfileText, packageName) {
  return lockfileText.includes(`"${packageName}":`) || lockfileText.includes(`'${packageName}':`);
}

function issue(code, packageName, message) {
  return { code, packageName, message };
}

export function relativePackageDir(fromDir, toPackage) {
  return relative(fromDir, toPackage.packageDir);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const packages = readPublicPackages();
  const result = validateReleaseGraph({
    packages,
    vitestConfigText: readFileSync("vitest.config.ts", "utf8"),
    lockfileText: readFileSync("pnpm-lock.yaml", "utf8")
  });

  if (!result.passed) {
    console.error("Release package graph check failed:");
    for (const item of result.issues) {
      console.error(`- [${item.code}] ${item.packageName}: ${item.message}`);
    }
    process.exitCode = 1;
  } else {
    console.log(`Release package graph check passed for ${packages.length} packages.`);
    console.log("Dependency-first publish order:");
    console.log(renderPublishOrder(packages));
  }
}
