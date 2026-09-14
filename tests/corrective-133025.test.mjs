import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { testFilesForGroup } from "../tools/test-groups.mjs";
import {
  FIRST_PAINT_GEOMETRY_OWNERSHIP,
  FIRST_PAINT_PARITY_PROBES,
  assertOwnershipComplete,
  assertParityValues
} from "./helpers/first-paint-geometry-contract.mjs";

function ownershipWithValueProbe() {
  return Object.freeze({
    ...FIRST_PAINT_GEOMETRY_OWNERSHIP,
    PARITY_REQUIRED: Object.freeze([
      ...FIRST_PAINT_GEOMETRY_OWNERSHIP.PARITY_REQUIRED,
      FIRST_PAINT_PARITY_PROBES.VALUE_MISMATCH
    ])
  });
}

test("1.33.0.25 completeness and value parity consume one shared geometry ownership contract", () => {
  const valueParitySource = fs.readFileSync("tests/corrective-133023.test.mjs", "utf8");
  const completenessSource = fs.readFileSync("tests/corrective-133024.test.mjs", "utf8");

  assert.match(valueParitySource, /from "\.\/helpers\/first-paint-geometry-contract\.mjs"/,
    "value parity must import the shared first-paint geometry contract");
  assert.match(valueParitySource, /assertParityValues\(bootstrap, authoritative/,
    "value parity must be driven by the shared contract helper");
  assert.doesNotMatch(valueParitySource, /const\s+OWNED_GEOMETRY\s*=/,
    "value parity must not keep an independent hardcoded property list");

  assert.match(completenessSource, /FIRST_PAINT_GEOMETRY_OWNERSHIP/,
    "completeness must consume the same shared ownership declaration");
  assert.doesNotMatch(completenessSource, /const\s+FIRST_PAINT_GEOMETRY_OWNERSHIP\s*=/,
    "completeness must not shadow the shared ownership declaration");
});

test("1.33.0.25 classifying a new parity property automatically enrolls it in value comparison", () => {
  const ownership = ownershipWithValueProbe();
  const authoritative = new Map();
  const bootstrap = new Map();

  for (const property of ownership.PARITY_REQUIRED) {
    authoritative.set(property, "same");
    bootstrap.set(property, "same");
  }
  authoritative.set(FIRST_PAINT_PARITY_PROBES.VALUE_MISMATCH, "18px");
  bootstrap.set(FIRST_PAINT_PARITY_PROBES.VALUE_MISMATCH, "11px");

  assert.doesNotThrow(() => assertOwnershipComplete({
    authoritativeProperties: authoritative.keys(),
    bootstrapProperties: bootstrap.keys()
  }, ownership), "the mutation is fully classified and therefore must reach value parity");

  assert.throws(
    () => assertParityValues(bootstrap, authoritative, "classified probe", ownership),
    new RegExp(`${FIRST_PAINT_PARITY_PROBES.VALUE_MISMATCH} mismatch at classified probe`),
    "a classified property with divergent formulas must fail value parity"
  );

  bootstrap.set(FIRST_PAINT_PARITY_PROBES.VALUE_MISMATCH, "18px");
  assert.doesNotThrow(() => assertParityValues(bootstrap, authoritative, "classified probe", ownership));
});


test("1.33.0.25 parity-contract hardening belongs to startup, New Tab and release groups", () => {
  for (const group of ["startup", "newtab", "release"]) {
    const files = testFilesForGroup(group).map(file => file.replaceAll("\\", "/"));
    assert.ok(files.includes("tests/corrective-133025.test.mjs"), `${group} must include corrective-133025.test.mjs`);
  }
});

test("1.33.0.25 parity-contract mutation probes use a reserved test-only namespace", () => {
  const production = [
    fs.readFileSync("src/shared/newtab/newtab.js", "utf8"),
    fs.readFileSync("src/shared/newtab/render-bootstrap.js", "utf8")
  ].join("\n");

  for (const property of Object.values(FIRST_PAINT_PARITY_PROBES)) {
    assert.match(property, /^--__mosaicsync-test-parity-/,
      `${property} must remain in the reserved test-only probe namespace`);
    assert.equal(production.includes(property), false,
      `${property} must never collide with a production first-paint property`);
  }
});
