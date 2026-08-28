import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const releaseHeadingPattern =
  /^## (?<version>\d+\.\d+\.\d+) - (?<date>\d{4}-\d{2}-\d{2}) - (?<title>.+)$/;

export function validateChangelogText(text) {
  const issues = [];
  const headings = text
    .split(/\r?\n/)
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .filter(({ line }) => line.startsWith("## "));

  if (!headings.some(({ line }) => line.startsWith("## Unreleased"))) {
    issues.push({
      code: "UNRELEASED_SECTION_MISSING",
      lineNumber: 1,
      message: "CHANGELOG.md must keep an Unreleased section."
    });
  }

  for (const heading of headings) {
    if (heading.line.startsWith("## Unreleased")) {
      continue;
    }

    const match = releaseHeadingPattern.exec(heading.line);
    if (match === null || match.groups === undefined) {
      issues.push({
        code: "RELEASE_HEADING_FORMAT_INVALID",
        lineNumber: heading.lineNumber,
        message: "Release headings must use: ## <version> - <YYYY-MM-DD> - <one-line heading>."
      });
      continue;
    }

    if (!isValidIsoDate(match.groups.date)) {
      issues.push({
        code: "RELEASE_HEADING_DATE_INVALID",
        lineNumber: heading.lineNumber,
        message: `Release heading date is not a real ISO date: ${match.groups.date}.`
      });
    }

    if (match.groups.title.trim().length === 0) {
      issues.push({
        code: "RELEASE_HEADING_TITLE_MISSING",
        lineNumber: heading.lineNumber,
        message: "Release heading must include a one-line title after the date."
      });
    }
  }

  return {
    passed: issues.length === 0,
    issues
  };
}

export function renderChangelogIssues(issues) {
  return [
    "Changelog check failed:",
    ...issues.map((issue) => `- [${issue.code}] line ${issue.lineNumber}: ${issue.message}`)
  ].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = validateChangelogText(readFileSync("CHANGELOG.md", "utf8"));
  if (!result.passed) {
    throw new Error(renderChangelogIssues(result.issues));
  }

  console.log("Changelog check passed.");
}

function isValidIsoDate(date) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date;
}
