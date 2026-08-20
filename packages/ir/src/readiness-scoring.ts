import type { ApplicationModel } from "./semantic-model.js";

export const readinessScoreSchemaVersion = "0.1.0";

export type ReadinessCategory =
  | "discoverability"
  | "structured-content"
  | "agent-actions"
  | "api-quality"
  | "semantic-metadata"
  | "security"
  | "runtime-correctness";

export interface ReadinessLossReason {
  category: ReadinessCategory;
  pointsLost: number;
  reason: string;
  evidenceIds: string[];
}

export interface ReadinessScore {
  schemaVersion: string;
  score: number;
  maxScore: number;
  categoryScores: Record<ReadinessCategory, number>;
  lostPoints: ReadinessLossReason[];
}

const weights: Record<ReadinessCategory, number> = {
  discoverability: 15,
  "structured-content": 15,
  "agent-actions": 20,
  "api-quality": 15,
  "semantic-metadata": 10,
  security: 10,
  "runtime-correctness": 15
};

export function scoreReadiness(model: ApplicationModel): ReadinessScore {
  const categoryScores = { ...weights };
  const lostPoints: ReadinessLossReason[] = [];

  loseIf(
    categoryScores,
    lostPoints,
    "discoverability",
    model.standards.length === 0,
    "No existing standards detected."
  );
  loseIf(
    categoryScores,
    lostPoints,
    "structured-content",
    model.entities.length === 0,
    "No entities identified."
  );
  loseIf(
    categoryScores,
    lostPoints,
    "agent-actions",
    model.capabilities.length === 0,
    "No capabilities identified."
  );
  loseIf(
    categoryScores,
    lostPoints,
    "api-quality",
    model.apis.length === 0,
    "No API operations identified."
  );
  loseIf(
    categoryScores,
    lostPoints,
    "semantic-metadata",
    !model.standards.some((standard) => standard.kind === "schema-org"),
    "No Schema.org JSON-LD detected."
  );
  loseIf(
    categoryScores,
    lostPoints,
    "security",
    model.capabilities.some((capability) => capability.risk === "HIGH_CONSEQUENCE"),
    "High-consequence capability requires explicit safety handling."
  );
  loseIf(
    categoryScores,
    lostPoints,
    "runtime-correctness",
    !model.routes.some((route) => route.runtimeObserved) &&
      !model.apis.some((api) => api.runtimeObserved),
    "No runtime evidence correlated with semantic model."
  );

  return {
    schemaVersion: readinessScoreSchemaVersion,
    score: Object.values(categoryScores).reduce((total, value) => total + value, 0),
    maxScore: 100,
    categoryScores,
    lostPoints
  };
}

function loseIf(
  categoryScores: Record<ReadinessCategory, number>,
  lostPoints: ReadinessLossReason[],
  category: ReadinessCategory,
  condition: boolean,
  reason: string
): void {
  if (!condition) {
    return;
  }

  lostPoints.push({
    category,
    pointsLost: categoryScores[category],
    reason,
    evidenceIds: []
  });
  categoryScores[category] = 0;
}
