import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

const ADRS = [
  "ADR-001-authority-vs-startup-caches.md",
  "ADR-002-device-local-browser-derived-data.md",
  "ADR-003-shared-core-browser-adapters.md",
  "ADR-004-recovery-vs-normal-sync.md",
  "ADR-005-catastrophic-loss-confirmation.md",
  "ADR-006-intentional-reset-authority.md",
  "ADR-007-settings-appearance-isolation.md",
  "ADR-008-deterministic-release-certification.md",
  "ADR-009-refactor-freeze-policy.md"
];

test("1.30.18.35 permanent architecture map links the decision and regression knowledge bases", () => {
  const architecture = read("docs/ARCHITECTURE.md");
  assert.match(architecture, /Permanent maintenance map/);
  assert.match(architecture, /\(adr\/README\.md\)/);
  assert.match(architecture, /\(REGRESSION-CATALOG\.md\)/);
  assert.match(architecture, /## Plain-English map/);
});

test("1.30.18.35 ADR index is complete and every accepted record carries decision, rationale, guardrail and evidence", () => {
  const index = read("docs/adr/README.md");
  for (const name of ADRS) {
    assert.ok(exists(`docs/adr/${name}`), `${name} must exist`);
    assert.match(index, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const record = read(`docs/adr/${name}`);
    assert.match(record, /\*\*Status:\*\* Accepted \/ frozen/);
    assert.match(record, /## Decision/);
    assert.match(record, /## Why/);
    assert.match(record, /## Do not casually change/);
    assert.match(record, /## Evidence/);
  }
});

test("1.30.18.35 regression catalogue references only permanent test files that exist", () => {
  const catalog = read("docs/REGRESSION-CATALOG.md");
  const entries = [...catalog.matchAll(/^## R-(\d{3}) — /gm)];
  assert.ok(entries.length >= 10, "catalogue should preserve the major historical regression families");
  const refs = [...catalog.matchAll(/`(tests\/[^`]+\.test\.mjs)`/g)].map((m) => m[1]);
  assert.ok(refs.length >= entries.length, "each regression family should point to permanent tests");
  for (const rel of new Set(refs)) assert.ok(exists(rel), `${rel} must exist`);
});

test("1.30.18.35 architecture decisions describe frozen ownership without introducing a second runtime version source", () => {
  const docs = [read("docs/ARCHITECTURE.md"), read("docs/adr/README.md"), ...ADRS.map((n) => read(`docs/adr/${n}`)), read("docs/REGRESSION-CATALOG.md")].join("\n");
  assert.match(docs, /authoritative/i);
  assert.match(docs, /device-local/i);
  assert.match(docs, /Recovery/i);
  assert.match(docs, /deterministic/i);
  assert.doesNotMatch(docs, /export const VERSION|"version"\s*:/, "documentation must not become another technical version authority");
});
