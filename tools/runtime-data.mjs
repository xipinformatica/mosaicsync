import { createHash } from "node:crypto";

export function meaningfulPslRules(source) {
  return String(source || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith("//"));
}

export function summarizePslRules(source) {
  const rules = meaningfulPslRules(source);
  const duplicates = [];
  const seen = new Set();
  for (const rule of rules) {
    if (seen.has(rule)) duplicates.push(rule);
    else seen.add(rule);
  }
  const canonicalBytes = `${rules.join("\n")}\n`;
  return {
    rules,
    count: rules.length,
    wildcardCount: rules.filter(rule => rule.startsWith("*.")).length,
    exceptionCount: rules.filter(rule => rule.startsWith("!")).length,
    unicodeCount: rules.filter(rule => /[^\x00-\x7f]/.test(rule)).length,
    whitespaceRules: rules.filter(rule => /\s/.test(rule)),
    duplicates,
    sha256: createHash("sha256").update(canonicalBytes, "utf8").digest("hex")
  };
}

export function assertPslSourceSanity(summary) {
  if (!summary || !Array.isArray(summary.rules)) throw new Error("Invalid PSL summary.");
  if (summary.count < 8000) throw new Error(`Public Suffix List rule count is implausibly small: ${summary.count}`);
  if (summary.wildcardCount < 200) throw new Error(`Public Suffix List wildcard rule count is implausibly small: ${summary.wildcardCount}`);
  if (summary.exceptionCount < 5) throw new Error(`Public Suffix List exception rule count is implausibly small: ${summary.exceptionCount}`);
  if (summary.whitespaceRules.length) throw new Error(`Public Suffix List contains whitespace inside a rule: ${summary.whitespaceRules[0]}`);
  if (summary.duplicates.length) throw new Error(`Public Suffix List contains a duplicate rule: ${summary.duplicates[0]}`);
}

export function runtimePublicSuffixList(source) {
  const summary = summarizePslRules(source);
  assertPslSourceSanity(summary);
  const version = String(source || "").match(/^\/\/ VERSION:\s*(.+)$/m)?.[1]?.trim() || "unknown";
  const commit = String(source || "").match(/^\/\/ COMMIT:\s*(.+)$/m)?.[1]?.trim() || "unknown";
  return [
    "// Generated rules-only Public Suffix List for MosaicSync runtime.",
    "// Source Code Form: MPL-2.0 — https://mozilla.org/MPL/2.0/",
    `// Upstream VERSION: ${version}; COMMIT: ${commit}`,
    `// Rules: ${summary.count}; Wildcards: ${summary.wildcardCount}; Exceptions: ${summary.exceptionCount}; SHA-256: ${summary.sha256}`,
    ...summary.rules,
    ""
  ].join("\n");
}
