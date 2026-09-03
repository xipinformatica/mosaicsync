import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseCertificationArgs,
  certificationPlan,
  compareArtifactHashes,
  extractSourceZip
} from "../tools/certify-release.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

test("1.30.18.34 official certify command is one fail-closed full-release entry point", () => {
  const pkg = JSON.parse(fs.readFileSync(join(root, "package.json"), "utf8"));
  assert.equal(pkg.scripts.certify, "node tools/certify-release.mjs");
  assert.equal(pkg.scripts["certify:mechanical"], "node tools/certify-release.mjs --skip-browser-smoke");
  assert.doesNotMatch(pkg.scripts.certify, /skip-browser-smoke/);

  const plan = certificationPlan();
  assert.deepEqual(plan.map(step => step.id), [
    "build",
    "tests",
    "reachability",
    "browser-smoke",
    "benchmark",
    "size",
    "generated-contract",
    "package",
    "packaged-contract",
    "clean-room",
    "byte-compare"
  ]);
  assert.deepEqual(
    plan.find(step => step.id === "browser-smoke")?.command,
    ["npm", "run", "smoke:browsers"]
  );
});

test("1.30.18.34 mechanical certification can skip browser automation only by explicit opt-in", () => {
  assert.deepEqual(parseCertificationArgs([]), {
    skipBrowserSmoke: false,
    plan: false,
    keepVerifyTree: false
  });
  assert.equal(parseCertificationArgs(["--skip-browser-smoke"]).skipBrowserSmoke, true);
  assert.throws(() => parseCertificationArgs(["--skip-something-else"]), /Unknown certification option/);

  const ids = certificationPlan({ skipBrowserSmoke: true }).map(step => step.id);
  assert.equal(ids.includes("browser-smoke"), false);
  assert.equal(ids.includes("clean-room"), true);
  assert.equal(ids.includes("byte-compare"), true);
});

test("1.30.18.34 certification rejects any non-reproducible release artifact", () => {
  const expected = {
    firefox: "firefox-good",
    chrome: "chrome-good",
    source: "source-good",
    buildManifest: "manifest-good"
  };
  assert.deepEqual(compareArtifactHashes(expected, { ...expected }), []);

  const mismatches = compareArtifactHashes(expected, {
    ...expected,
    chrome: "chrome-drift",
    source: "source-drift"
  });
  assert.deepEqual(mismatches.map(item => item.name), ["chrome", "source"]);
  assert.equal(mismatches[0].expected, "chrome-good");
  assert.equal(mismatches[0].actual, "chrome-drift");
});

test("1.30.18.34 clean-room certification is source-archive based rather than retained working-tree state", () => {
  const source = fs.readFileSync(join(root, "tools/certify-release.mjs"), "utf8");
  assert.match(source, /extractSourceZip\(original\.paths\.source, verifyRoot\)/);
  assert.match(source, /runProcess\("npm", \["test"\], \{ cwd: verifyRoot \}\)/);
  assert.match(source, /runProcess\("python", \["tools\/package\.py"\], \{ cwd: verifyRoot \}\)/);
  assert.match(source, /compareArtifactHashes\(original\.hashes, reproduced\.hashes\)/);
});


test("1.30.18.34 clean-room extractor really unpacks the packaged source shape", async () => {
  const temp = await fsp.mkdtemp(join(os.tmpdir(), "mosaicsync-cert-extract-"));
  try {
    const sourceDir = join(temp, "input");
    const outputDir = join(temp, "output");
    await fsp.mkdir(join(sourceDir, "nested"), { recursive: true });
    await fsp.writeFile(join(sourceDir, "nested", "proof.txt"), "clean-room\n");
    const zip = join(temp, "proof.zip");
    const result = spawnSync("python", ["-c",
      "from pathlib import Path; from zipfile import ZipFile, ZIP_DEFLATED; import sys; root=Path(sys.argv[1]); z=ZipFile(sys.argv[2], 'w', compression=ZIP_DEFLATED); z.write(root/'nested'/'proof.txt', 'nested/proof.txt'); z.close()",
      sourceDir, zip], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    await extractSourceZip(zip, outputDir);
    assert.equal(await fsp.readFile(join(outputDir, "nested", "proof.txt"), "utf8"), "clean-room\n");
  } finally {
    await fsp.rm(temp, { recursive: true, force: true });
  }
});
