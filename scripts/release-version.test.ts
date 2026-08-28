import { describe, expect, it } from "vitest";
import { validateReleaseVersionRequest } from "./release-version.mjs";

describe("release version request checks", () => {
  it("passes a concrete semver version with a date and title", () => {
    expect(
      validateReleaseVersionRequest({
        version: "0.13.1",
        date: "2026-08-28",
        title: "Release Automation And Installability Hardening"
      })
    ).toEqual({ passed: true, issues: [] });
  });

  it("fails invalid versions", () => {
    const result = validateReleaseVersionRequest({
      version: "latest",
      date: "2026-08-28",
      title: "Release Automation"
    });

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "RELEASE_VERSION_INVALID"
      })
    );
  });

  it("fails missing titles", () => {
    const result = validateReleaseVersionRequest({
      version: "0.13.1",
      date: "2026-08-28",
      title: " "
    });

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "RELEASE_TITLE_MISSING"
      })
    );
  });

  it("fails invalid dates", () => {
    const result = validateReleaseVersionRequest({
      version: "0.13.1",
      date: "2026-02-31",
      title: "Release Automation"
    });

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "RELEASE_DATE_INVALID"
      })
    );
  });
});
