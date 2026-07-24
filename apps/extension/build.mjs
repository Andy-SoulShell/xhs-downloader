import { cp, mkdir, rm } from "node:fs/promises";
import { build } from "esbuild";

const output = new URL("./dist/", import.meta.url);
await rm(output, { force: true, recursive: true });
await mkdir(output, { recursive: true });

await build({
  bundle: true,
  entryPoints: {
    background: "src/background.ts",
    content: "src/content.ts",
    publisher: "src/publisher.ts",
    "publisher-main": "src/publisher-main.ts",
  },
  format: "iife",
  loader: { ".css": "text" },
  minify: false,
  outdir: "dist",
  target: "chrome120",
});

await cp("manifest.json", "dist/manifest.json");
