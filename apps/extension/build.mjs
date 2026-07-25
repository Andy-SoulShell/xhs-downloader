import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const appDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(appDirectory, "../..");
const output = resolve(appDirectory, "dist");
const browserAssets = resolve(
  repositoryRoot,
  "packages/xhs-adapters/src/xhs_adapters/browser_assets",
);
const generatedHeader =
  "/* 由 apps/extension/build.mjs 生成，请勿手工修改。 */";

await rm(output, { force: true, recursive: true });
await mkdir(output, { recursive: true });
await mkdir(browserAssets, { recursive: true });

await build({
  absWorkingDir: appDirectory,
  banner: { js: generatedHeader },
  bundle: true,
  entryPoints: {
    background: "src/background.ts",
    "browser-page": "src/browser-page.ts",
    "browser-page-main": "src/browser-page-main.ts",
    content: "src/content.ts",
    "managed-page-adapter": "src/managed-page-adapter.ts",
    publisher: "src/publisher.ts",
    "publisher-main": "src/publisher-main.ts",
  },
  format: "iife",
  loader: { ".css": "text" },
  minify: false,
  outdir: output,
  target: "chrome120",
});

await cp(resolve(appDirectory, "manifest.json"), resolve(output, "manifest.json"));
await cp(
  resolve(output, "managed-page-adapter.js"),
  resolve(browserAssets, "managed_page_adapter.js"),
);
