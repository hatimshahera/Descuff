import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createProjectContext } from "@descuff/core";
import { NativeNextAnalyzer } from "@descuff/analyzer-nextjs";
import {
  assessApplicationType,
  classifyCapabilityRisk,
  scoreReadiness,
  structuralAnalysisToApplicationModel,
  validateApplicationModel
} from "../src/index.js";

describe("semantic ApplicationModel", () => {
  it("classifies capability risk deterministically", () => {
    expect(classifyCapabilityRisk("GET", "/api/products")).toBe("PUBLIC_READ");
    expect(classifyCapabilityRisk("GET", "/api/orders")).toBe("AUTHENTICATED_READ");
    expect(classifyCapabilityRisk("POST", "/api/cart")).toBe("LOW_RISK_WRITE");
    expect(classifyCapabilityRisk("DELETE", "/api/account")).toBe("SENSITIVE_WRITE");
    expect(classifyCapabilityRisk("POST", "/api/checkout")).toBe("HIGH_CONSEQUENCE");
  });

  it("assesses application type from structural evidence", async () => {
    const analysis = await new NativeNextAnalyzer().analyze(
      createProjectContext("fixtures/ecommerce")
    );

    expect(assessApplicationType(analysis)).toMatchObject({
      type: "ecommerce",
      confidence: "high"
    });
  });

  it("transforms ecommerce structural analysis into the golden semantic model", async () => {
    const analysis = await new NativeNextAnalyzer().analyze(
      createProjectContext("fixtures/ecommerce")
    );
    const model = structuralAnalysisToApplicationModel(analysis);
    const golden = JSON.parse(
      await readFile("fixtures/ecommerce/expected/semantic-model.json", "utf8")
    ) as {
      schemaVersion: string;
      applicationType: string;
      entities: string[];
      capabilities: Array<{ id: string; risk: string }>;
      standards: string[];
    };

    expect(validateApplicationModel(model).valid).toBe(true);
    expect({
      schemaVersion: model.schemaVersion,
      applicationType: model.applicationType.type,
      entities: model.entities.map((entity) => entity.name),
      capabilities: model.capabilities.map((capability) => ({
        id: capability.id,
        risk: capability.risk
      })),
      standards: model.standards.map((standard) => standard.kind).sort()
    }).toEqual(golden);
  });

  it("rejects unexplained semantic conclusions", async () => {
    const analysis = await new NativeNextAnalyzer().analyze(
      createProjectContext("fixtures/ecommerce")
    );
    const model = structuralAnalysisToApplicationModel(analysis);
    model.capabilities[0] = {
      ...model.capabilities[0],
      evidence: []
    };

    expect(validateApplicationModel(model)).toEqual({
      valid: false,
      issues: [
        {
          code: "CAPABILITY_EVIDENCE_MISSING",
          message: "Capability capability:get:api_search must include evidence."
        }
      ]
    });
  });

  it("scores readiness deterministically with lost-point reasons", async () => {
    const analysis = await new NativeNextAnalyzer().analyze(
      createProjectContext("fixtures/ecommerce")
    );
    const model = structuralAnalysisToApplicationModel(analysis);
    const score = scoreReadiness(model);

    expect(score.schemaVersion).toBe("0.1.0");
    expect(score.maxScore).toBe(100);
    expect(score.score).toBe(85);
    expect(score.lostPoints).toEqual([
      {
        category: "runtime-correctness",
        pointsLost: 15,
        reason: "No runtime evidence correlated with semantic model.",
        evidenceIds: []
      }
    ]);
  });
});
