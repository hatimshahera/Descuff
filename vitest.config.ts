import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const fromRoot = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@descuff/agent-workflow": fromRoot("./packages/agent-workflow/src/index.ts"),
      "@descuff/analyzer-graphify": fromRoot("./packages/analyzers/graphify/src/index.ts"),
      "@descuff/analyzer-nextjs": fromRoot("./packages/analyzers/nextjs/src/index.ts"),
      "@descuff/analyzer-runtime": fromRoot("./packages/analyzers/runtime/src/index.ts"),
      "@descuff/config": fromRoot("./packages/config/src/index.ts"),
      "@descuff/core": fromRoot("./packages/core/src/index.ts"),
      "@descuff/drift-core": fromRoot("./packages/drift/src/index.ts"),
      "@descuff/ir": fromRoot("./packages/ir/src/index.ts"),
      "@descuff/reporter": fromRoot("./packages/reporter/src/index.ts"),
      "@descuff/standard-api-catalog": fromRoot("./packages/standards/api-catalog/src/index.ts"),
      "@descuff/standard-llms-txt": fromRoot("./packages/standards/llms-txt/src/index.ts"),
      "@descuff/standard-openapi": fromRoot("./packages/standards/openapi/src/index.ts"),
      "@descuff/standard-schema-org": fromRoot("./packages/standards/schema-org/src/index.ts"),
      "@descuff/standard-webmcp": fromRoot("./packages/standards/webmcp/src/index.ts"),
      "@descuff/validator": fromRoot("./packages/validator/src/index.ts"),
      descuff: fromRoot("./packages/cli/src/index.ts")
    }
  },
  test: {
    include: ["packages/**/*.test.ts", "scripts/**/*.test.ts"],
    globals: false
  }
});
