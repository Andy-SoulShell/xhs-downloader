# 受管浏览器页面资源

`managed_page_adapter.js` 由 `apps/extension/src/managed-page-adapter.ts` 及其依赖生成，
用于在受管 Chromium 的页面主世界复用扩展解析能力。

请运行 `pnpm --filter xhs-downloader-extension build` 更新产物，不要直接修改生成的
JavaScript 文件。
