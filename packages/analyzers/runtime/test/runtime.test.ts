import { describe, expect, it } from "vitest";
import { createProjectContext } from "@descuff/core";
import {
  createEmptyStructuralAnalysis,
  type RuntimeApiObservation,
  type RuntimeRouteObservation,
  type StructuralApiOperation,
  type StructuralRoute,
  validateStructuralAnalysis
} from "@descuff/ir";
import {
  correlateRuntimeEvidence,
  createDocumentModelContextRuntime,
  RuntimeAnalyzer,
  sanitizeNetworkObservation
} from "../src/index.js";

describe("@descuff/analyzer-runtime", () => {
  it("implements the structural analyzer contract", async () => {
    const analysis = await new RuntimeAnalyzer().analyze(createProjectContext("/repo"));

    expect(analysis.projectRoot).toBe("/repo");
    expect(analysis.warnings).toContainEqual(
      expect.objectContaining({ code: "RUNTIME_CONFIG_MISSING" })
    );
  });

  it("observes configured runtime routes and read-only API operations", async () => {
    const analysis = await new RuntimeAnalyzer(async () => ({
      async get() {
        return { status: 200, headers: { "content-type": "text/html" } };
      },
      async fetch() {
        return { status: 200, headers: { "content-type": "application/json" } };
      },
      async dispose() {
        return undefined;
      }
    })).analyze({
      rootDir: "/repo",
      cwd: "/repo",
      runtime: {
        baseUrl: "http://example.test",
        routes: ["/"],
        apiOperations: [
          { method: "GET", path: "/api/products" },
          { method: "POST", path: "/api/products" }
        ]
      }
    });

    expect(analysis.runtimeRoutes).toContainEqual(
      expect.objectContaining({ path: "/", status: 200 })
    );
    expect(analysis.runtimeApiOperations).toContainEqual(
      expect.objectContaining({ path: "/api/products", method: "GET", status: 200 })
    );
    expect(analysis.warnings).toContainEqual(
      expect.objectContaining({ code: "RUNTIME_MUTATION_SKIPPED" })
    );
    expect(validateStructuralAnalysis(analysis).valid).toBe(true);
  });

  it("respects route limits for runtime observations", async () => {
    const analysis = await new RuntimeAnalyzer(async () => ({
      async get() {
        return { status: 200, headers: {} };
      },
      async fetch() {
        return { status: 200, headers: {} };
      },
      async dispose() {
        return undefined;
      }
    })).analyze({
      rootDir: "/repo",
      cwd: "/repo",
      runtime: {
        baseUrl: "http://example.test",
        routes: ["/one", "/two"],
        apiOperations: [],
        limits: {
          maxRoutes: 1
        }
      }
    });

    expect(analysis.runtimeRoutes.map((route) => route.path)).toEqual(["/one"]);
    expect(analysis.warnings).toContainEqual(
      expect.objectContaining({ code: "RUNTIME_ROUTE_LIMIT_REACHED" })
    );
  });

  it("captures browser page and WebMCP evidence through an injected browser client", async () => {
    const analysis = await new RuntimeAnalyzer(
      async () => ({
        async get() {
          return { status: 200, headers: { "content-type": "text/html" } };
        },
        async fetch() {
          return { status: 200, headers: {} };
        },
        async dispose() {
          return undefined;
        }
      }),
      async () => ({
        async visit() {
          return {
            url: "http://example.test/",
            status: 200,
            title: "Example",
            headings: ["Products"],
            formCount: 1,
            jsonLdCount: 1,
            origin: "http://example.test",
            network: [
              {
                url: "http://example.test/api/products?token=secret",
                method: "GET",
                status: 200,
                requestHeaders: {
                  authorization: "Bearer secret",
                  accept: "application/json"
                },
                responseHeaders: {
                  "content-type": "application/json",
                  "set-cookie": "sid=secret"
                },
                responseBody: '{"token":"secret","name":"Desk"}'
              }
            ],
            webMcpSupported: true,
            webMcpTools: [
              {
                name: "search_products",
                description: "Search products",
                inputSchema: { type: "object" },
                annotations: { readOnlyHint: true },
                origin: "http://example.test",
                frameUrl: "http://example.test/"
              }
            ]
          };
        },
        async dispose() {
          return undefined;
        }
      })
    ).analyze({
      rootDir: "/repo",
      cwd: "/repo",
      runtime: {
        baseUrl: "http://example.test",
        routes: ["/"],
        apiOperations: []
      }
    });

    expect(analysis.runtimePages).toContainEqual(
      expect.objectContaining({
        path: "/",
        title: "Example",
        headings: ["Products"],
        formCount: 1,
        jsonLdCount: 1,
        networkRequestCount: 1
      })
    );
    expect(analysis.runtimeWebMcpTools).toContainEqual(
      expect.objectContaining({
        name: "search_products",
        description: "Search products",
        origin: "http://example.test"
      })
    );
    expect(validateStructuralAnalysis(analysis).valid).toBe(true);
  });

  it("skips browser evidence for blocked origins", async () => {
    const analysis = await new RuntimeAnalyzer(
      async () => ({
        async get() {
          return { status: 200, headers: { "content-type": "text/html" } };
        },
        async fetch() {
          return { status: 200, headers: {} };
        },
        async dispose() {
          return undefined;
        }
      }),
      async () => ({
        async visit() {
          return {
            url: "https://blocked.test/",
            status: 200,
            headings: [],
            formCount: 0,
            jsonLdCount: 0,
            origin: "https://blocked.test",
            network: [],
            webMcpSupported: true,
            webMcpTools: [
              {
                name: "blocked_tool",
                description: "Blocked",
                inputSchema: { type: "object" },
                origin: "https://blocked.test",
                frameUrl: "https://blocked.test/"
              }
            ]
          };
        },
        async dispose() {
          return undefined;
        }
      })
    ).analyze({
      rootDir: "/repo",
      cwd: "/repo",
      runtime: {
        baseUrl: "http://example.test",
        routes: ["/"],
        apiOperations: [],
        limits: {
          allowedOrigins: ["http://example.test"]
        }
      }
    });

    expect(analysis.runtimePages).toEqual([]);
    expect(analysis.runtimeWebMcpTools).toEqual([]);
    expect(analysis.warnings).toContainEqual(
      expect.objectContaining({ code: "RUNTIME_ORIGIN_BLOCKED" })
    );
  });

  it("redacts sensitive runtime network evidence", () => {
    expect(
      sanitizeNetworkObservation(
        {
          url: "https://example.test/api?token=secret&query=desk",
          method: "GET",
          requestHeaders: {
            authorization: "Bearer secret",
            cookie: "sid=secret",
            accept: "application/json"
          },
          responseBody: '{"password":"secret","name":"Desk"}'
        },
        { maxResponseBodyBytes: 1_000 }
      )
    ).toEqual({
      url: "https://example.test/api?token=%5BREDACTED%5D&query=desk",
      method: "GET",
      requestHeaders: {
        authorization: "[REDACTED]",
        cookie: "[REDACTED]",
        accept: "application/json"
      },
      responseBody: '{"password":"[REDACTED]","name":"Desk"}'
    });
  });

  it("wraps document.modelContext behind the WebMCP runtime abstraction", async () => {
    const calls: Array<{ fn: string; arg?: unknown }> = [];
    const runtime = createDocumentModelContextRuntime({
      url() {
        return "https://example.test/";
      },
      async evaluate(pageFunction, arg) {
        calls.push({ fn: pageFunction.toString(), arg });
        if (pageFunction.toString().includes("executeTool")) {
          return "done";
        }
        if (pageFunction.toString().includes("getTools")) {
          return [
            {
              name: "search_products",
              description: "Search products",
              inputSchema: { type: "object" },
              annotations: { readOnlyHint: true },
              origin: "https://example.test",
              frameUrl: "https://example.test/"
            }
          ];
        }
        return true;
      }
    });

    await expect(runtime.isSupported()).resolves.toBe(true);
    await expect(runtime.listTools()).resolves.toEqual([
      expect.objectContaining({ name: "search_products" })
    ]);
    await expect(runtime.executeSafeTool("search_products", { q: "desk" })).resolves.toEqual({
      toolName: "search_products",
      result: "done"
    });
    expect(calls).toHaveLength(3);
  });

  it("correlates static and runtime evidence by route and API operation", () => {
    const analysis = createEmptyStructuralAnalysis("/repo");
    const routeEvidence = {
      id: "source:app/page.tsx",
      kind: "source" as const,
      location: "app/page.tsx",
      confidence: "high" as const,
      summary: "route"
    };
    const runtimeRouteEvidence = {
      id: "runtime:/",
      kind: "runtime" as const,
      location: "/",
      confidence: "high" as const,
      summary: "runtime route"
    };
    const apiEvidence = {
      id: "source:app/api/products/route.ts",
      kind: "source" as const,
      location: "app/api/products/route.ts",
      confidence: "high" as const,
      summary: "api"
    };
    const runtimeApiEvidence = {
      id: "runtime:GET:/api/products",
      kind: "runtime" as const,
      location: "GET:/api/products",
      confidence: "high" as const,
      summary: "runtime api"
    };

    analysis.routes.push({
      id: "route:next-app:/",
      path: "/",
      routerKind: "next-app",
      sourceFile: "app/page.tsx",
      evidence: [routeEvidence]
    } satisfies StructuralRoute);
    analysis.runtimeRoutes.push({
      id: "runtime-route:/",
      path: "/",
      status: 200,
      evidence: [runtimeRouteEvidence]
    } satisfies RuntimeRouteObservation);
    analysis.apiOperations.push({
      id: "api:GET:/api/products",
      path: "/api/products",
      method: "GET",
      sourceFile: "app/api/products/route.ts",
      evidence: [apiEvidence]
    } satisfies StructuralApiOperation);
    analysis.runtimeApiOperations.push({
      id: "runtime-api:GET:/api/products",
      path: "/api/products",
      method: "GET",
      status: 200,
      evidence: [runtimeApiEvidence]
    } satisfies RuntimeApiObservation);

    expect(correlateRuntimeEvidence(analysis).map((correlation) => correlation.subject)).toEqual([
      "route:/",
      "api:GET:/api/products"
    ]);
  });
});
