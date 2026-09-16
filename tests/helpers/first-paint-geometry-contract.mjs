import assert from "node:assert/strict";

export const FIRST_PAINT_GEOMETRY_OWNERSHIP = Object.freeze({
  PARITY_REQUIRED: Object.freeze([
    "--columns", "--tile-size", "--shortcut-icon-size",
    "--folder-mosaic-cell-size", "--folder-mosaic-icon-size", "--folder-mosaic-gap", "--folder-mosaic-padding",
    "--folder-item-tile-size", "--folder-item-icon-size", "--col-gap", "--row-gap"
  ]),
  INTENTIONAL_DEFER: Object.freeze([]),
  NOT_BOOTSTRAP_OWNED: Object.freeze([])
});

export const PARITY_REQUIRED_GEOMETRY = FIRST_PAINT_GEOMETRY_OWNERSHIP.PARITY_REQUIRED;

export const FIRST_PAINT_PARITY_PROBES = Object.freeze({
  AUTHORITATIVE_ONLY: "--__mosaicsync-test-parity-authoritative-only",
  BOOTSTRAP_ONLY: "--__mosaicsync-test-parity-bootstrap-only",
  VALUE_MISMATCH: "--__mosaicsync-test-parity-value-mismatch"
});

export function classificationIndex(ownership = FIRST_PAINT_GEOMETRY_OWNERSHIP) {
  const index = new Map();
  for (const [classification, properties] of Object.entries(ownership)) {
    for (const property of properties) {
      assert.equal(index.has(property), false, `${property} must belong to exactly one first-paint ownership class`);
      index.set(property, classification);
    }
  }
  return index;
}

export function assertOwnershipComplete({ authoritativeProperties, bootstrapProperties }, ownership = FIRST_PAINT_GEOMETRY_OWNERSHIP) {
  const index = classificationIndex(ownership);
  const authoritative = new Set(authoritativeProperties);
  const bootstrap = new Set(bootstrapProperties);

  for (const property of authoritative) {
    assert.ok(index.has(property), `${property} is authoritative first-paint geometry but has no ownership classification`);
  }
  for (const property of index.keys()) {
    assert.ok(authoritative.has(property), `${property} is classified but is no longer written by authoritative geometry`);
  }

  for (const property of ownership.PARITY_REQUIRED) {
    assert.ok(bootstrap.has(property), `${property} is PARITY_REQUIRED but synchronous bootstrap does not write it`);
  }
  for (const property of bootstrap) {
    assert.equal(index.get(property), "PARITY_REQUIRED", `${property} is written by synchronous bootstrap without PARITY_REQUIRED ownership`);
  }
}

export function assertParityValues(bootstrap, authoritative, label = "", ownership = FIRST_PAINT_GEOMETRY_OWNERSHIP) {
  for (const property of ownership.PARITY_REQUIRED) {
    assert.equal(
      bootstrap.get(property),
      authoritative.get(property),
      `${property} mismatch${label ? ` at ${label}` : ""}`
    );
  }
}
