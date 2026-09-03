import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { listTestGroups, testFilesForGroup, testGroupCoverage } from "../tools/test-groups.mjs";

const EXPECTED_GROUPS = ["startup", "newtab", "sync", "recovery", "security", "browser", "core", "release"];

test("1.30.18.36 targeted test groups are deterministic, non-empty and cover every test file", () => {
  assert.deepEqual(listTestGroups().map(group => group.name), EXPECTED_GROUPS);
  for (const name of EXPECTED_GROUPS) {
    const first = testFilesForGroup(name);
    const second = testFilesForGroup(name);
    assert.ok(first.length > 0, `${name} must select at least one test file`);
    assert.deepEqual(first, second, `${name} membership must be deterministic`);
    assert.deepEqual(first, [...first].sort((a, b) => a.localeCompare(b)), `${name} membership must stay sorted`);
  }
  const coverage = testGroupCoverage();
  assert.equal(coverage.ungrouped.length, 0, `ungrouped tests: ${coverage.ungrouped.join(", ")}`);
});

test("1.30.18.36 package commands expose focused groups without weakening the authoritative full suite", () => {
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  assert.equal(pkg.scripts.test, "node tools/build.mjs && node --test tests/*.test.mjs");
  assert.equal(pkg.scripts["test:groups"], "node tools/run-test-group.mjs --list");
  for (const name of EXPECTED_GROUPS) {
    assert.equal(pkg.scripts[`test:${name}`], `node tools/run-test-group.mjs ${name}`);
  }
});
