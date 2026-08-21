import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createProjectContext } from "@descuff/core";
import { NativeNextAnalyzer } from "@descuff/analyzer-nextjs";
import {
  assessApplicationType,
  classifyCapabilityRisk,
  createEmptyStructuralAnalysis,
  scoreReadiness,
  structuralAnalysisToApplicationModel,
  validateApplicationModel
} from "../src/index.js";

describe("semantic ApplicationModel", () => {
  it("classifies capability risk deterministically", () => {
    expect(classifyCapabilityRisk("GET", "/api/products")).toBe("PUBLIC_READ");
    expect(classifyCapabilityRisk("GET", "/api/orders")).toBe("AUTHENTICATED_READ");
    expect(classifyCapabilityRisk("GET", "/api/team")).toBe("AUTHENTICATED_READ");
    expect(classifyCapabilityRisk("GET", "/api/user")).toBe("AUTHENTICATED_READ");
    expect(classifyCapabilityRisk("POST", "/api/cart")).toBe("LOW_RISK_WRITE");
    expect(classifyCapabilityRisk("DELETE", "/api/account")).toBe("SENSITIVE_WRITE");
    expect(classifyCapabilityRisk("POST", "/api/checkout")).toBe("HIGH_CONSEQUENCE");
    expect(classifyCapabilityRisk("POST", "/api/stripe/webhook")).toBe("HIGH_CONSEQUENCE");
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

  it("classifies Pages Router post routes as content applications", () => {
    const analysis = createEmptyStructuralAnalysis("/blog");
    const evidence = {
      id: "source:pages/posts/[slug].js",
      kind: "source" as const,
      location: "pages/posts/[slug].js",
      confidence: "high" as const,
      summary: "Next.js page route discovered"
    };

    analysis.routes.push({
      id: "route:posts_slug",
      path: "/posts/{slug}",
      routerKind: "next-pages",
      sourceFile: "pages/posts/[slug].js",
      evidence: [evidence]
    });
    analysis.evidence.items.push(evidence);

    expect(assessApplicationType(analysis)).toMatchObject({
      type: "content",
      confidence: "medium"
    });
  });

  it("classifies SaaS applications ahead of isolated checkout signals", () => {
    const analysis = createEmptyStructuralAnalysis("/saas");
    const evidence = {
      id: "source:app/api/team/route.ts",
      kind: "source" as const,
      location: "app/api/team/route.ts",
      confidence: "high" as const,
      summary: "GET API operation discovered"
    };

    analysis.routes.push({
      id: "route:pricing",
      path: "/pricing",
      routerKind: "next-app",
      sourceFile: "app/(dashboard)/pricing/page.tsx",
      evidence: [evidence]
    });
    analysis.apiOperations.push(
      {
        id: "api:GET:/api/team",
        path: "/api/team",
        method: "GET",
        sourceFile: "app/api/team/route.ts",
        evidence: [evidence]
      },
      {
        id: "api:GET:/api/stripe/checkout",
        path: "/api/stripe/checkout",
        method: "GET",
        sourceFile: "app/api/stripe/checkout/route.ts",
        evidence: [evidence]
      }
    );
    analysis.evidence.items.push(evidence);

    expect(assessApplicationType(analysis)).toMatchObject({
      type: "saas",
      confidence: "medium"
    });
  });

  it("models file-level server actions as conservative capabilities", () => {
    const analysis = createEmptyStructuralAnalysis("/booking");
    const evidence = {
      id: "source:app/actions.ts",
      kind: "source" as const,
      location: "app/actions.ts",
      confidence: "high" as const,
      summary: "Source symbol detected"
    };

    analysis.symbols.push(
      {
        id: "symbol:app/actions.ts:server-action:fetchSlotsAction",
        name: "fetchSlotsAction",
        kind: "server-action",
        sourceFile: "app/actions.ts",
        evidence: [evidence]
      },
      {
        id: "symbol:app/actions.ts:server-action:createBookingAction",
        name: "createBookingAction",
        kind: "server-action",
        sourceFile: "app/actions.ts",
        evidence: [evidence]
      }
    );
    analysis.evidence.items.push(evidence);

    const model = structuralAnalysisToApplicationModel(analysis);

    expect(model.capabilities).toEqual([
      expect.objectContaining({
        id: "capability:action:app_actions_ts_fetchSlotsAction",
        name: "fetchSlotsAction",
        operationType: "read",
        risk: "PUBLIC_READ",
        visibility: "public",
        linkedApis: [],
        confidence: "medium"
      }),
      expect.objectContaining({
        id: "capability:action:app_actions_ts_createBookingAction",
        name: "createBookingAction",
        operationType: "write",
        risk: "HIGH_CONSEQUENCE",
        visibility: "unknown",
        linkedApis: [],
        confidence: "medium"
      })
    ]);
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
