import type { CapabilityRisk, CapabilityVisibility } from "./semantic-model.js";
import type { HttpMethod } from "./structural-analysis.js";

export function classifyCapabilityRisk(
  method: HttpMethod,
  path: string,
  visibility: CapabilityVisibility = "public"
): CapabilityRisk {
  if (method === "HEAD" || method === "OPTIONS") {
    return visibility === "authenticated" ? "AUTHENTICATED_READ" : "PUBLIC_READ";
  }

  if (method === "GET") {
    if (isSensitivePath(path) || isHighConsequencePath(path)) {
      return "AUTHENTICATED_READ";
    }

    return visibility === "authenticated" ? "AUTHENTICATED_READ" : "PUBLIC_READ";
  }

  if (isHighConsequencePath(path)) {
    return "HIGH_CONSEQUENCE";
  }

  if (isSensitivePath(path)) {
    return "SENSITIVE_WRITE";
  }

  if (method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE") {
    return "LOW_RISK_WRITE";
  }

  return visibility === "authenticated" ? "AUTHENTICATED_READ" : "PUBLIC_READ";
}

function isHighConsequencePath(path: string): boolean {
  return /checkout|payment|stripe|webhook|subscription|delete-account|account\/delete|billing\/cancel/.test(
    path
  );
}

function isSensitivePath(path: string): boolean {
  return /orders|account|profile|admin|billing|team|user|session|2fa|password|security|settings|website|report|board|link|pixel|replay|share/.test(
    path
  );
}
