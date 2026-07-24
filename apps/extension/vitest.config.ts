import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    coverage: {
      provider: "v8",
      include: [
        "src/parser.ts",
        "src/mode.ts",
        "src/service.ts",
        "src/storage.ts",
        "src/publication-assets.ts",
        "src/publication-runner.ts",
        "src/publication-service.ts",
        "src/publication-storage.ts",
        "src/publisher-dom.ts",
      ],
      thresholds: {
        branches: 85,
        functions: 85,
        lines: 85,
        statements: 85,
      },
    },
  },
});
