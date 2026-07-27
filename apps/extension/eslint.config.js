import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "coverage"] },
  {
    extends: [eslint.configs.recommended, ...tseslint.configs.recommended],
    files: ["src/**/*.ts"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        ...globals.webextensions,
      },
    },
    rules: {
      // 测试替身按惯例用下划线前缀声明有意不用的参数。
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    extends: [eslint.configs.recommended],
    files: ["build.mjs", "eslint.config.js"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
  },
);
