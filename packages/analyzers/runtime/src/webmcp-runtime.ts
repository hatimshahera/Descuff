export interface DiscoveredWebMcpTool {
  name: string;
  description: string;
  inputSchema: unknown;
  annotations?: Record<string, unknown>;
  origin: string;
  frameUrl: string;
}

export interface WebMcpToolResult {
  toolName: string;
  result: unknown;
}

export interface WebMcpRuntime {
  isSupported(): Promise<boolean>;
  listTools(): Promise<DiscoveredWebMcpTool[]>;
  executeSafeTool(toolName: string, input: unknown): Promise<WebMcpToolResult>;
}

interface BrowserLikePage {
  url(): string;
  evaluate<T, A = unknown>(pageFunction: (arg: A) => T | Promise<T>, arg?: A): Promise<T>;
}

interface RawWebMcpTool {
  name?: unknown;
  description?: unknown;
  inputSchema?: unknown;
  annotations?: unknown;
  origin?: unknown;
}

interface BrowserGlobal {
  document?: {
    modelContext?: {
      getTools?: () => Promise<RawWebMcpTool[]>;
      executeTool?: (tool: RawWebMcpTool, input: string) => Promise<unknown>;
    };
  };
  location?: {
    origin: string;
    href: string;
  };
}

export function createDocumentModelContextRuntime(page: BrowserLikePage): WebMcpRuntime {
  return {
    async isSupported() {
      return page.evaluate(() => {
        const doc = (globalThis as BrowserGlobal).document;
        return typeof doc?.modelContext === "object" && doc.modelContext !== null;
      });
    },
    async listTools() {
      return page.evaluate(() => {
        const browserGlobal = globalThis as BrowserGlobal;
        const doc = browserGlobal.document;
        const isBrowserRecord = (value: unknown): value is Record<string, unknown> =>
          typeof value === "object" && value !== null && !Array.isArray(value);

        if (typeof doc?.modelContext?.getTools !== "function") {
          return [];
        }

        return doc.modelContext.getTools().then((tools) =>
          tools.map((tool): DiscoveredWebMcpTool => {
            const discovered: DiscoveredWebMcpTool = {
              name: typeof tool.name === "string" ? tool.name : "",
              description: typeof tool.description === "string" ? tool.description : "",
              inputSchema: tool.inputSchema ?? null,
              origin:
                typeof tool.origin === "string"
                  ? tool.origin
                  : (browserGlobal.location?.origin ?? ""),
              frameUrl: browserGlobal.location?.href ?? ""
            };

            if (isBrowserRecord(tool.annotations)) {
              discovered.annotations = tool.annotations;
            }

            return discovered;
          })
        );
      });
    },
    async executeSafeTool(toolName, input) {
      return page
        .evaluate(
          ({ name, jsonInput }) => {
            const doc = (globalThis as BrowserGlobal).document;

            if (
              typeof doc?.modelContext?.getTools !== "function" ||
              typeof doc.modelContext.executeTool !== "function"
            ) {
              throw new Error("WebMCP modelContext execution is not supported.");
            }

            return doc.modelContext.getTools().then(async (tools) => {
              const tool = tools.find((candidate) => candidate.name === name);
              if (tool === undefined) {
                throw new Error(`WebMCP tool not found: ${name}`);
              }

              return doc.modelContext?.executeTool?.(tool, jsonInput);
            });
          },
          { name: toolName, jsonInput: JSON.stringify(input) }
        )
        .then((result) => ({ toolName, result }));
    }
  };
}
