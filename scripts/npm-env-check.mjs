import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const pnpmOnlyNpmConfigs = new Set([
  "_jsr-registry",
  "link-workspace-packages",
  "npm-globalconfig",
  "prefer-workspace-packages",
  "verify-deps-before-run"
]);

export function createNpmEnvironmentDiagnostics(input) {
  const warnings = [];

  for (const key of Object.keys(input.env)) {
    if (!key.toLowerCase().startsWith("npm_config_")) {
      continue;
    }

    const configName = normalizeNpmConfigName(key.slice("npm_config_".length));
    if (pnpmOnlyNpmConfigs.has(configName)) {
      warnings.push({
        code: "PNPM_CONFIG_VISIBLE_TO_NPM",
        message: `npm sees pnpm-only config "${configName}", which can produce npm warning noise during release checks.`,
        remediation:
          "Run release checks from a clean shell if npm warning noise becomes confusing. This is usually not a package failure."
      });
    }
  }

  if (input.uid !== 0) {
    for (const path of input.rootOwnedCachePaths) {
      warnings.push({
        code: "ROOT_OWNED_NPM_CACHE_ENTRY",
        message: `npm cache contains a root-owned path: ${path}`,
        remediation:
          "Repair npm cache ownership manually only if installs fail with EACCES. Do not let Descuff mutate global npm state automatically."
      });
    }
  }

  return {
    passed: true,
    warnings
  };
}

export function findRootOwnedCachePaths(cacheDir, limit = 200) {
  if (!existsSync(cacheDir)) {
    return [];
  }

  const rootOwned = [];
  const pending = [cacheDir];
  let visited = 0;

  while (pending.length > 0 && visited < limit) {
    const current = pending.pop();
    if (current === undefined) {
      break;
    }

    visited += 1;
    let stat;
    try {
      stat = statSync(current);
    } catch {
      continue;
    }

    if (stat.uid === 0) {
      rootOwned.push(current);
      if (rootOwned.length >= 5) {
        break;
      }
    }

    if (!stat.isDirectory()) {
      continue;
    }

    let entries;
    try {
      entries = readdirSync(current);
    } catch {
      continue;
    }

    for (const entry of entries) {
      pending.push(join(current, entry));
    }
  }

  return rootOwned;
}

export function renderNpmEnvironmentDiagnostics(result) {
  if (result.warnings.length === 0) {
    return "npm environment diagnostics passed.";
  }

  return [
    `npm environment diagnostics completed with ${result.warnings.length} warning(s):`,
    ...result.warnings.map(
      (warning) => `- [${warning.code}] ${warning.message}\n  ${warning.remediation}`
    )
  ].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cacheDir = process.env.npm_config_cache ?? join(homedir(), ".npm");
  const result = createNpmEnvironmentDiagnostics({
    env: process.env,
    uid: process.getuid?.() ?? 0,
    rootOwnedCachePaths: findRootOwnedCachePaths(cacheDir)
  });

  console.log(renderNpmEnvironmentDiagnostics(result));
}

function normalizeNpmConfigName(name) {
  return name.replaceAll("_", "-").toLowerCase();
}
