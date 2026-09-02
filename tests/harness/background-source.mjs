import fs from "node:fs";

export function readBackgroundSource(browser, { built = true } = {}) {
  const name = browser === "chrome" ? "chrome" : "firefox";
  const adapterPath = built
    ? `dist/${name}/background/background-adapter.js`
    : `src/${name}/background/background-adapter.js`;
  const recoveryGenerationFormatPath = built
    ? `dist/${name}/background/recovery-generation-format.js`
    : "src/shared/background/recovery-generation-format.js";
  const recoveryGenerationStorePath = built
    ? `dist/${name}/background/recovery-generation-store.js`
    : "src/shared/background/recovery-generation-store.js";
  const corePath = built
    ? `dist/${name}/background/background-core.js`
    : "src/shared/background/background-core.js";
  const entryPath = built
    ? `dist/${name}/background/background.js`
    : "src/shared/background/background.js";
  // Platform source first preserves historical extraction tests for browser-only
  // primitives; canonical shared semantics follow from the one background core.
  return [adapterPath, recoveryGenerationFormatPath, recoveryGenerationStorePath, corePath, entryPath]
    .map(path => fs.readFileSync(path, "utf8"))
    .join("\n\n");
}
