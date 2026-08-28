import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  publicPackageJsonPaths,
  readPublicPackages,
  renderPublishOrder,
  validateReleaseGraph
} from "./release-graph.mjs";

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

const packRoot = mkdtempSync(join(tmpdir(), "descuff-release-check-"));

try {
  for (const packageJsonPath of publicPackageJsonPaths) {
    const packageDir = dirname(packageJsonPath);
    const manifest = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    const packagePackDir = join(packRoot, manifest.name.replaceAll("/", "__"));
    mkdirSync(packagePackDir, { recursive: true });

    const pack = spawnSync("npm", ["pack", "--pack-destination", packagePackDir, "--json"], {
      cwd: packageDir,
      env: {
        ...process.env,
        npm_config_cache: join(packRoot, "npm-cache")
      },
      encoding: "utf8"
    });

    if (pack.status !== 0) {
      throw new Error(`npm pack failed for ${manifest.name}\n${pack.stderr}`);
    }

    const tarball = readdirSync(packagePackDir).find((file) => file.endsWith(".tgz"));
    if (tarball === undefined) {
      throw new Error(`pnpm pack did not create a tarball for ${manifest.name}`);
    }

    const extract = spawnSync(
      "tar",
      ["-xOf", join(packagePackDir, tarball), "package/package.json"],
      {
        encoding: "utf8"
      }
    );

    if (extract.status !== 0) {
      throw new Error(`Could not inspect packed manifest for ${manifest.name}\n${extract.stderr}`);
    }

    const packedManifest = JSON.parse(extract.stdout);
    assertNoWorkspaceRanges(packedManifest, manifest.name);

    if (manifest.name === "descuff" && packedManifest.bin?.descuff !== "dist/index.js") {
      throw new Error("Packed descuff CLI manifest is missing the descuff bin entry.");
    }
  }

  console.log(`Release package graph check passed for ${packages.length} packages.`);
  console.log("Dependency-first publish order:");
  console.log(renderPublishOrder(packages));
  console.log(`Release pack check passed for ${publicPackageJsonPaths.length} packages.`);
} finally {
  rmSync(packRoot, { recursive: true, force: true });
}

function assertNoWorkspaceRanges(manifest, packageName) {
  for (const field of [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies"
  ]) {
    const dependencies = manifest[field] ?? {};
    for (const [name, range] of Object.entries(dependencies)) {
      if (typeof range === "string" && range.startsWith("workspace:")) {
        throw new Error(`${packageName} packed manifest contains ${field}.${name}: ${range}`);
      }
    }
  }
}
