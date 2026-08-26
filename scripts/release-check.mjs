import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const packageJsonPaths = [
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

const packRoot = mkdtempSync(join(tmpdir(), "descuff-release-check-"));

try {
  for (const packageJsonPath of packageJsonPaths) {
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

  console.log(`Release pack check passed for ${packageJsonPaths.length} packages.`);
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
