import type { HttpMethod, StructuralForm, StructuralSymbol } from "@descuff/ir";
import { sourceEvidence } from "./evidence.js";

const httpMethods: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

export function extractHttpMethods(source: string): HttpMethod[] {
  return httpMethods.filter((method) =>
    new RegExp(
      `export\\s+(?:async\\s+)?function\\s+${method}\\b|export\\s+const\\s+${method}\\b`
    ).test(source)
  );
}

export function extractSymbols(
  rootDir: string,
  filePath: string,
  source: string
): StructuralSymbol[] {
  const symbols: StructuralSymbol[] = [];
  const evidence = sourceEvidence(rootDir, filePath, "Source symbol detected");
  const fileHasUseServerDirective = hasFileUseServerDirective(source);

  for (const match of source.matchAll(/import\s+[^;]+?\s+from\s+["'][^"']+["']/g)) {
    symbols.push({
      id: `symbol:${evidence.location}:import:${symbols.length}`,
      name: match[0],
      kind: "import",
      sourceFile: evidence.location,
      evidence: [evidence]
    });
  }

  for (const match of source.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/g)) {
    symbols.push(symbol(evidence.location, match[1] ?? "anonymous", "export", evidence));
    if (match[1]?.startsWith("use")) {
      symbols.push(symbol(evidence.location, match[1], "react-component", evidence));
    }
  }

  for (const match of source.matchAll(
    /(?:export\s+)?(?:async\s+)?function\s+([A-Z][A-Za-z0-9_]*)/g
  )) {
    symbols.push(symbol(evidence.location, match[1] ?? "Anonymous", "react-component", evidence));
  }

  for (const match of source.matchAll(/class\s+([A-Za-z0-9_]+)/g)) {
    symbols.push(symbol(evidence.location, match[1] ?? "AnonymousClass", "class", evidence));
  }

  for (const match of source.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/g)) {
    const name = match[1] ?? "anonymous";
    if (fileHasUseServerDirective || hasFunctionUseServerDirective(source, match.index ?? 0)) {
      symbols.push(symbol(evidence.location, name, "server-action", evidence));
    }
  }

  return symbols;
}

export function extractForms(rootDir: string, filePath: string, source: string): StructuralForm[] {
  const forms: StructuralForm[] = [];

  for (const match of source.matchAll(/<form\b([^>]*)>/g)) {
    const attributes = match[1] ?? "";
    const evidence = sourceEvidence(rootDir, filePath, "Form element detected");
    const form: StructuralForm = {
      id: `form:${evidence.location}:${forms.length}`,
      sourceFile: evidence.location,
      evidence: [evidence]
    };
    const action = getAttributeValue(attributes, "action");
    const method = getAttributeValue(attributes, "method");
    if (action !== undefined) {
      form.action = action;
    }
    if (method !== undefined) {
      form.method = method;
    }
    forms.push(form);
  }

  return forms;
}

function symbol(
  sourceFile: string,
  name: string,
  kind: StructuralSymbol["kind"],
  evidence: StructuralSymbol["evidence"][number]
): StructuralSymbol {
  return {
    id: `symbol:${sourceFile}:${kind}:${name}`,
    name,
    kind,
    sourceFile,
    evidence: [evidence]
  };
}

function hasFileUseServerDirective(source: string): boolean {
  return /^\s*["']use server["']\s*;?/.test(source);
}

function hasFunctionUseServerDirective(source: string, functionIndex: number): boolean {
  const bodyStart = source.indexOf("{", functionIndex);
  if (bodyStart === -1) {
    return false;
  }

  return source.slice(bodyStart, bodyStart + 120).includes('"use server"');
}

function getAttributeValue(attributes: string, name: string): string | undefined {
  const match = attributes.match(new RegExp(`${name}=["']([^"']+)["']`));
  return match?.[1];
}
