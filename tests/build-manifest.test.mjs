import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");

test("build manifest hashes exactly describe both generated browser trees", async()=>{
  const manifest=JSON.parse(await readFile("build-manifest.json","utf8"));
  assert.equal(manifest.schemaVersion,1);
  for (const browser of ["firefox","chrome"]) {
    assert.equal(manifest.browsers[browser].version,"1.30.12");
    for (const [rel,expected] of Object.entries(manifest.browsers[browser].files)) {
      const bytes=await readFile(resolve(`dist/${browser}/${rel}`));
      assert.equal(sha256(bytes),expected,`${browser}/${rel}`);
    }
  }
});
