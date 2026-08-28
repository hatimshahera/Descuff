import { describe, expect, it } from "vitest";
import { validateChangelogText } from "./changelog-check.mjs";

describe("changelog checks", () => {
  it("passes unreleased plus release headings with dates and titles", () => {
    const result = validateChangelogText(
      [
        "# Changelog",
        "",
        "## Unreleased - Next Changes",
        "",
        "## 0.13.1 - 2026-08-28 - Release Automation Hardening"
      ].join("\n")
    );

    expect(result).toEqual({ passed: true, issues: [] });
  });

  it("fails release headings without a one-line title", () => {
    const result = validateChangelogText(
      ["# Changelog", "", "## Unreleased - Next Changes", "", "## 0.13.1 - 2026-08-28"].join("\n")
    );

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "RELEASE_HEADING_FORMAT_INVALID",
        lineNumber: 5
      })
    );
  });

  it("fails invalid release dates", () => {
    const result = validateChangelogText(
      [
        "# Changelog",
        "",
        "## Unreleased - Next Changes",
        "",
        "## 0.13.1 - 2026-02-31 - Release Automation Hardening"
      ].join("\n")
    );

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "RELEASE_HEADING_DATE_INVALID",
        lineNumber: 5
      })
    );
  });

  it("fails when the Unreleased section is missing", () => {
    const result = validateChangelogText(
      ["# Changelog", "", "## 0.13.1 - 2026-08-28 - Release Automation Hardening"].join("\n")
    );

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "UNRELEASED_SECTION_MISSING"
      })
    );
  });
});
