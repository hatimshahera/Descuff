import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { publicPackageJsonPaths } from "./release-graph.mjs";

export function validateReleaseVersionRequest(input) {
  const issues = [];

  if (!/^\d+\.\d+\.\d+$/.test(input.version)) {
    issues.push({
      code: "RELEASE_VERSION_INVALID",
      message: `Release version must be a concrete semver version, got ${input.version}.`
    });
  }

  if (input.title.trim().length === 0) {
    issues.push({
      code: "RELEASE_TITLE_MISSING",
      message: "Release title is required."
    });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !isValidIsoDate(input.date)) {
    issues.push({
      code: "RELEASE_DATE_INVALID",
      message: `Release date must be a real ISO date, got ${input.date}.`
    });
  }

  return {
    passed: issues.length === 0,
    issues
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [version, ...titleParts] = process.argv.slice(2).filter((arg) => arg !== "--");
  const title = titleParts.join(" ");
  const date = process.env.DESCUFF_RELEASE_DATE ?? new Date().toISOString().slice(0, 10);

  const request = validateReleaseVersionRequest({ version, title, date });
  if (!request.passed) {
    throw new Error(
      [
        "Release version request failed:",
        ...request.issues.map((issue) => `- [${issue.code}] ${issue.message}`)
      ].join("\n")
    );
  }

  updateRootManifest(version);
  for (const packageJsonPath of publicPackageJsonPaths) {
    updatePackageManifest(packageJsonPath, version);
  }
  updateReadme(version);
  updateChangelog(version, date, title);

  console.log(`Prepared release ${version} - ${date} - ${title}`);
}

function updateRootManifest(version) {
  const manifest = readJson("package.json");
  manifest.version = version;
  writeJson("package.json", manifest);
}

function updatePackageManifest(packageJsonPath, version) {
  const manifest = readJson(packageJsonPath);
  manifest.version = version;

  for (const field of [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies"
  ]) {
    const dependencies = manifest[field] ?? {};
    for (const dependencyName of Object.keys(dependencies)) {
      if (dependencyName === "descuff" || dependencyName.startsWith("@descuff/")) {
        dependencies[dependencyName] = `^${version}`;
      }
    }
  }

  writeJson(packageJsonPath, manifest);
}

function updateReadme(version) {
  const readme = readFileSync("README.md", "utf8");
  writeFileSync(
    "README.md",
    readme.replace(/Current release: `descuff@[^`]+`/, `Current release: \`descuff@${version}\``),
    "utf8"
  );
}

function updateChangelog(version, date, title) {
  const changelog = readFileSync("CHANGELOG.md", "utf8");
  const unreleasedHeading = "## Unreleased - Next Changes";
  const releaseHeading = `## ${version} - ${date} - ${title}`;

  if (changelog.includes(releaseHeading)) {
    return;
  }

  if (!changelog.includes(unreleasedHeading)) {
    throw new Error("CHANGELOG.md is missing the Unreleased section.");
  }

  writeFileSync(
    "CHANGELOG.md",
    changelog.replace(unreleasedHeading, `${unreleasedHeading}\n\n${releaseHeading}`),
    "utf8"
  );
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function isValidIsoDate(date) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date;
}
