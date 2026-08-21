import { describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
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
  createPlaywrightBrowserClient,
  RuntimeAnalyzer,
  sanitizeNetworkObservation
} from "../src/index.js";

const browserIt = process.env.DESCUFF_BROWSER_TESTS === "1" ? it : it.skip;

describe("@descuff/analyzer-runtime", () => {
  it("implements the structural analyzer contract", async () => {
    const analysis = await new RuntimeAnalyzer().analyze(createProjectContext("/repo"));

    expect(analysis.projectRoot).toBe("/repo");
    expect(analysis.warnings).toContainEqual(
      expect.objectContaining({ code: "RUNTIME_CONFIG_MISSING" })
    );
  });

  it("observes configured runtime routes and read-only API operations", async () => {
    const analysis = await new RuntimeAnalyzer(
      async () => ({
        async get() {
          return { status: 200, headers: { "content-type": "text/html" } };
        },
        async fetch() {
          return { status: 200, headers: { "content-type": "application/json" } };
        },
        async dispose() {
          return undefined;
        }
      }),
      null
    ).analyze({
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
    const analysis = await new RuntimeAnalyzer(
      async () => ({
        async get() {
          return { status: 200, headers: {} };
        },
        async fetch() {
          return { status: 200, headers: {} };
        },
        async dispose() {
          return undefined;
        }
      }),
      null
    ).analyze({
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
            ],
            webMcpToolExecutions: [
              {
                toolName: "search_products",
                status: "executed",
                origin: "http://example.test",
                frameUrl: "http://example.test/",
                result: { products: [] }
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
    expect(analysis.runtimeWebMcpToolExecutions).toContainEqual(
      expect.objectContaining({
        toolName: "search_products",
        status: "executed",
        resultShape: "object"
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
            ],
            webMcpToolExecutions: [
              {
                toolName: "blocked_tool",
                status: "skipped",
                origin: "https://blocked.test",
                frameUrl: "https://blocked.test/",
                error: "Tool is not explicitly annotated read-only."
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
    expect(analysis.runtimeWebMcpToolExecutions).toEqual([]);
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
    await withModelContext(
      {
        async getTools() {
          return [
            {
              name: "search_products",
              description: "Search products",
              inputSchema: { type: "object" },
              annotations: { readOnlyHint: true },
              origin: "https://example.test",
              execute(input: unknown) {
                return { searched: (input as { q?: string }).q };
              }
            }
          ];
        },
        async executeTool(tool, input) {
          return tool.execute(JSON.parse(input));
        }
      },
      async () => {
        const runtime = createDocumentModelContextRuntime(createEvaluatingPage());

        await expect(runtime.isSupported()).resolves.toBe(true);
        await expect(runtime.listTools()).resolves.toEqual([
          expect.objectContaining({ name: "search_products" })
        ]);
        await expect(runtime.executeSafeTool("search_products", { q: "desk" })).resolves.toEqual({
          toolName: "search_products",
          result: { searched: "desk" }
        });
      }
    );
  });

  it("refuses to execute WebMCP tools that are not explicitly read-only", async () => {
    await withModelContext(
      {
        async getTools() {
          return [
            {
              name: "delete_product",
              description: "Delete product",
              inputSchema: { type: "object" },
              annotations: { readOnlyHint: false },
              execute() {
                return "deleted";
              }
            }
          ];
        },
        async executeTool(tool, input) {
          return tool.execute(JSON.parse(input));
        }
      },
      async () => {
        const runtime = createDocumentModelContextRuntime(createEvaluatingPage());

        await expect(runtime.executeSafeTool("delete_product", { id: "desk" })).rejects.toThrow(
          "not marked read-only"
        );
      }
    );
  });

  it("refuses to execute WebMCP tools with missing safety annotations", async () => {
    await withModelContext(
      {
        async getTools() {
          return [
            {
              name: "ambiguous_tool",
              description: "Ambiguous",
              inputSchema: { type: "object" },
              execute() {
                return "done";
              }
            }
          ];
        },
        async executeTool(tool, input) {
          return tool.execute(JSON.parse(input));
        }
      },
      async () => {
        const runtime = createDocumentModelContextRuntime(createEvaluatingPage());

        await expect(runtime.executeSafeTool("ambiguous_tool", {})).rejects.toThrow(
          "not marked read-only"
        );
      }
    );
  });

  browserIt("observes rendered page evidence and WebMCP tools with Playwright", async () => {
    const server = await startFixtureServer();
    try {
      const baseUrl = `http://127.0.0.1:${server.port}`;
      const browser = await createPlaywrightBrowserClient(baseUrl, {
        maxRoutes: 5,
        maxPageLoadMs: 5_000,
        maxNetworkRequests: 20,
        maxResponseBodyBytes: 2_048,
        maxRedirects: 3,
        allowedOrigins: [baseUrl],
        blockedOrigins: []
      });

      try {
        const page = await browser.visit("/", {
          maxRoutes: 5,
          maxPageLoadMs: 5_000,
          maxNetworkRequests: 20,
          maxResponseBodyBytes: 2_048,
          maxRedirects: 3,
          allowedOrigins: [baseUrl],
          blockedOrigins: []
        });

        expect(page).toMatchObject({
          status: 200,
          title: "Runtime Fixture",
          headings: ["Runtime Fixture"],
          formCount: 1,
          jsonLdCount: 1,
          webMcpSupported: true
        });
        expect(page.webMcpTools).toContainEqual(
          expect.objectContaining({
            name: "search_products",
            description: "Search products",
            annotations: { readOnlyHint: true },
            origin: baseUrl
          })
        );
        expect(page.webMcpToolExecutions).toContainEqual(
          expect.objectContaining({
            toolName: "search_products",
            status: "executed",
            origin: baseUrl
          })
        );
        expect(page.network.some((request) => request.url.endsWith("/api/products"))).toBe(true);
      } finally {
        await browser.dispose();
      }
    } finally {
      await server.close();
    }
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

interface TestWebMcpTool {
  name: string;
  description: string;
  inputSchema: unknown;
  annotations?: Record<string, unknown>;
  origin?: string;
  execute(input: unknown): unknown;
}

interface TestModelContext {
  getTools(): Promise<TestWebMcpTool[]>;
  executeTool(tool: TestWebMcpTool, input: string): Promise<unknown>;
}

function createEvaluatingPage() {
  return {
    url() {
      return "https://example.test/";
    },
    async evaluate<T, A = unknown>(pageFunction: (arg: A) => T | Promise<T>, arg?: A): Promise<T> {
      return pageFunction(arg as A);
    }
  };
}

async function withModelContext<T>(
  modelContext: TestModelContext,
  callback: () => Promise<T>
): Promise<T> {
  const globalRecord = globalThis as Record<string, unknown>;
  const hadDocument = Object.prototype.hasOwnProperty.call(globalRecord, "document");
  const hadLocation = Object.prototype.hasOwnProperty.call(globalRecord, "location");
  const previousDocument = globalRecord.document;
  const previousLocation = globalRecord.location;

  globalRecord.document = { modelContext };
  globalRecord.location = {
    origin: "https://example.test",
    href: "https://example.test/"
  };

  try {
    return await callback();
  } finally {
    if (hadDocument) {
      globalRecord.document = previousDocument;
    } else {
      delete globalRecord.document;
    }

    if (hadLocation) {
      globalRecord.location = previousLocation;
    } else {
      delete globalRecord.location;
    }
  }
}

interface FixtureServer {
  port: number;
  close(): Promise<void>;
}

function startFixtureServer(): Promise<FixtureServer> {
  const server: Server = createServer((request, response) => {
    if (request.url === "/api/products") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ products: [{ id: "desk", name: "Desk" }] }));
      return;
    }

    response.writeHead(200, { "content-type": "text/html" });
    response.end(`<!doctype html>
      <html>
        <head>
          <title>Runtime Fixture</title>
          <script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"Runtime Fixture"}</script>
        </head>
        <body>
          <h1>Runtime Fixture</h1>
          <form action="/api/products" method="get"><input name="q" /></form>
          <script>
            const tools = [];
            document.modelContext = {
              async registerTool(tool) {
                tools.push({ ...tool, origin: window.location.origin });
              },
              async getTools() {
                return tools;
              },
              async executeTool(tool, input) {
                return tool.execute(JSON.parse(input));
              }
            };
            document.modelContext.registerTool({
              name: "search_products",
              description: "Search products",
              inputSchema: { type: "object", properties: { q: { type: "string" } } },
              annotations: { readOnlyHint: true },
              execute: async ({ q }) => {
                const result = await fetch("/api/products?q=" + encodeURIComponent(q || ""));
                return result.text();
              }
            });
            fetch("/api/products");
          </script>
        </body>
      </html>`);
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("Fixture server did not bind to a TCP port."));
        return;
      }
      resolve({
        port: address.port,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            server.close((error) => (error === undefined ? closeResolve() : closeReject(error)));
          })
      });
    });
  });
}
