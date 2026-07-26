import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    coverage: {
      provider: "v8",
      // 新增源文件默认纳入覆盖率统计；排除项必须逐个列明原因。
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        // 测试辅助与夹具，不属于产品代码。
        "src/browser-page-test-helpers.ts",
        "src/browser-task-test-helpers.ts",
        "src/publication-test-fixtures.ts",
        // 纯类型声明与再导出，没有可执行语句。
        "src/env.d.ts",
        "src/types.ts",
        "src/publication-types.ts",
        "src/browser-action-errors.ts",
        // 入口引导脚本在导入时产生副作用，无法在 jsdom 中独立测试。
        "src/background.ts",
        "src/content.ts",
        "src/panel.ts",
        "src/publisher.ts",
        "src/publisher-main.ts",
        "src/browser-page.ts",
        "src/browser-page-main.ts",
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
