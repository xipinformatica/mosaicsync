import fs from "node:fs";

export function readBackgroundSource(browser, { built = true } = {}) {
  const name = browser === "chrome" ? "chrome" : "firefox";
  const adapterPath = built
    ? `dist/${name}/background/background-adapter.js`
    : `src/${name}/background/background-adapter.js`;
  const corePath = built
    ? `dist/${name}/background/background-core.js`
    : "src/shared/background/background-core.js";
  const entryPath = built
    ? `dist/${name}/background/background.js`
    : `src/${name}/background/background.js`;
  // Platform source first preserves historical extraction tests for browser-only
  // primitives; canonical shared semantics follow from the one background core.
  return [adapterPath, corePath, entryPath]
    .map(path => fs.readFileSync(path, "utf8"))
    .join("\n\n");
}
