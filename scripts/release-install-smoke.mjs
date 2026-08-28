import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createPublishOrder, readPublicPackages } from "./release-graph.mjs";

const rootDir = process.cwd();
const workDir = mkdtempSync(join(tmpdir(), "descuff-release-install-smoke-"));
const packDir = join(workDir, "packs");
const installDir = join(workDir, "install");
const fixtureDir = join(workDir, "fixture-ecommerce");
const npmCacheDir = join(workDir, "npm-cache");

try {
  mkdirSync(packDir, { recursive: true });
  mkdirSync(installDir, { recursive: true });

  const packages = createPublishOrder(readPublicPackages());
  const tarballs = new Map();

  for (const pkg of packages) {
    console.log(`Packing ${pkg.name}...`);
    const packagePackDir = join(packDir, pkg.name.replaceAll("/", "__"));
    mkdirSync(packagePackDir, { recursive: true });

    run("npm", ["pack", "--pack-destination", packagePackDir, "--json"], {
      cwd: join(rootDir, pkg.packageDir),
      env: releaseEnv()
    });

    const tarball = readdirSync(packagePackDir).find((file) => file.endsWith(".tgz"));
    if (tarball === undefined) {
      throw new Error(`npm pack did not create a tarball for ${pkg.name}.`);
    }

    tarballs.set(pkg.name, join(packagePackDir, tarball));
  }

  writeFileSync(
    join(installDir, "package.json"),
    JSON.stringify(
      {
        private: true,
        type: "module",
        dependencies: Object.fromEntries(
          packages.map((pkg) => [pkg.name, `file:${tarballs.get(pkg.name)}`])
        )
      },
      null,
      2
    ) + "\n"
  );

  run("npm", ["install", "--ignore-scripts", "--package-lock=false", "--no-audit", "--no-fund"], {
    cwd: installDir,
    env: releaseEnv(),
    timeout: 120_000
  });

  console.log("Running packed CLI help...");
  run("npx", ["descuff", "--help"], { cwd: installDir, env: releaseEnv(), timeout: 30_000 });

  console.log("Running packed CLI start/finish fixture smoke...");
  cpSync(resolve(rootDir, "fixtures/ecommerce"), fixtureDir, { recursive: true });
  run("npx", ["descuff", "start", fixtureDir], {
    cwd: installDir,
    env: releaseEnv(),
    timeout: 60_000
  });
  run("npx", ["descuff", "finish", fixtureDir], {
    cwd: installDir,
    env: releaseEnv(),
    timeout: 60_000
  });

  const cliManifest = JSON.parse(readFileSync(join(rootDir, "packages/cli/package.json"), "utf8"));
  console.log(`Packed install smoke passed for descuff@${cliManifest.version}.`);
} finally {
  rmSync(workDir, { recursive: true, force: true });
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

  return result;
}

function releaseEnv() {
  return {
    ...process.env,
    npm_config_cache: npmCacheDir
  };
}
