import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backgroundHarness = path.join(root, "tests/harness/background-runtime-scenario.mjs");
const newtabHarness = path.join(root, "tests/harness/newtab-runtime-smoke.mjs");

function runBackgroundScenario(browser, scenario) {
  const result = spawnSync(process.execPath, [backgroundHarness, browser, scenario], {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000
  });
  assert.equal(result.status, 0, `${browser}/${scenario} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
  return JSON.parse(lines.at(-1));
}

for (const browser of ["firefox", "chrome"]) {
  test(`1.31.0 ${browser} interrupted quota-full reset never leaves empty cloud without reset authority`, () => {
    const out = runBackgroundScenario(browser, "sync-1310-reset-sentinel-failure-safe");
    assert.equal(out.resetFailedSafely, true);
    assert.ok(out.remainingItems > 0);
    assert.equal(out.initiatorBlocked, true);
    assert.equal(out.stalePeerDidNotRecover, true);
    assert.equal(out.clearCalls, 0, "the final sentinel must survive old-key removal; storage.sync.clear cannot provide that transaction");
  });

  test(`1.31.0 ${browser} Restore prefers a demonstrably newer same-publisher atomic profile`, () => {
    const out = runBackgroundScenario(browser, "sync-1310-newer-atomic-outranks-older-live");
    assert.equal(out.newerAtomicSelected, true);
    assert.equal(out.sourceKind, "profile-snapshot");
  });
}

test("1.31.0 coherent Restore source policy keeps incomparable and newer-live cases conservative", async () => {
  const { selectCoherentRestoreSource } = await import("../src/shared/background/sync-source-policy.js");
  const base = {
    atomicAvailable: true,
    liveComplete: true,
    atomicMatchesLive: false,
    atomicModern: true,
    liveModern: true,
    atomic: { originDeviceId: "same", personalUpdatedAt: 900, workUpdatedAt: 900 },
    live: { personalOriginDeviceId: "same", workOriginDeviceId: "same", personalUpdatedAt: 500, workUpdatedAt: 500 }
  };
  assert.equal(selectCoherentRestoreSource(base), "atomic");
  assert.equal(selectCoherentRestoreSource({
    ...base,
    atomic: { ...base.atomic, personalUpdatedAt: 400, workUpdatedAt: 400 }
  }), "live");
  assert.equal(selectCoherentRestoreSource({
    ...base,
    live: { ...base.live, workUpdatedAt: 1000 }
  }), "live", "straddling/incomparable source clocks retain the established live preference");
  assert.equal(selectCoherentRestoreSource({
    ...base,
    live: { ...base.live, workOriginDeviceId: "other" }
  }), "live", "cross-publisher clocks are not treated as comparable");
  assert.equal(selectCoherentRestoreSource({ ...base, atomicMatchesLive: true }), "atomic");
  assert.equal(selectCoherentRestoreSource({ ...base, liveComplete: false }), "atomic");
  assert.equal(selectCoherentRestoreSource({ ...base, atomicAvailable: false }), "live");
});

test("1.31.0 bounded response reader cancels an undeclared oversized stream before full buffering", async () => {
  const { readBoundedResponseBlob } = await import("../src/shared/core/bounded-response.js");
  let pulls = 0;
  let cancelled = false;
  const response = {
    headers: { get: name => String(name).toLowerCase() === "content-type" ? "image/png" : null },
    body: new ReadableStream({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(600_000));
        if (pulls >= 3) controller.close();
      },
      cancel() { cancelled = true; }
    })
  };
  await assert.rejects(readBoundedResponseBlob(response, 1_000_000), /too large/i);
  assert.equal(cancelled, true);
  assert.ok(pulls < 3, "the third chunk must never be buffered");
});

test("1.31.0 bounded response reader preserves valid bytes and MIME type", async () => {
  const { readBoundedResponseBlob } = await import("../src/shared/core/bounded-response.js");
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const response = {
    headers: { get: name => String(name).toLowerCase() === "content-type" ? "image/png" : null },
    body: new Blob([bytes]).stream()
  };
  const blob = await readBoundedResponseBlob(response, 10);
  assert.equal(blob.type, "image/png");
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), bytes);
});

test("1.31.0 generated New Tab executes Fit-Fill-Fit against the real HTML preview element", () => {
  for (const browser of ["firefox", "chrome"]) {
    const run = spawnSync(process.execPath, [newtabHarness, root, browser], { cwd: root, encoding: "utf8", timeout: 20_000 });
    assert.equal(run.status, 0, `${browser} New Tab smoke failed\n${run.stdout}\n${run.stderr}`);
    const result = JSON.parse(run.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1));
    assert.equal(result.imagePreview?.baseClassPresent, true);
    assert.equal(result.imagePreview?.changeListeners > 0, true);
    assert.equal(result.imagePreview?.coverAfterFill, true);
    assert.equal(result.imagePreview?.coverAfterFit, false);
  }
});

test("1.31.0 interrupted ZIP creation preserves the previous valid final artifact", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "mosaicsync-atomic-package-"));
  try {
    const script = String.raw`
import importlib.util, pathlib, sys
root=pathlib.Path(sys.argv[1])
out=pathlib.Path(sys.argv[2])
spec=importlib.util.spec_from_file_location("mosaicsync_package", root/"tools"/"package.py")
module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
out.write_bytes(b"previous-valid-artifact")
real_zip=module.ZipFile
class FailingZip:
    def __init__(self, target, *args, **kwargs): self.handle=open(target,"wb")
    def __enter__(self): return self
    def __exit__(self, *args): self.handle.close()
    def writestr(self, *args, **kwargs):
        self.handle.write(b"truncated")
        self.handle.flush()
        raise RuntimeError("injected packaging interruption")
module.ZipFile=FailingZip
try:
    module.write_deterministic_zip(out, [("a.txt", b"a")])
except RuntimeError:
    pass
finally:
    module.ZipFile=real_zip
assert out.read_bytes()==b"previous-valid-artifact"
assert not list(out.parent.glob(f".{out.name}.*.tmp"))
`;
    const run = spawnSync("python", ["-c", script, root, path.join(temp, "release.zip")], { encoding: "utf8" });
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("1.31.0 remote-image calls use bounded timed retrieval instead of response.blob", () => {
  const source = fs.readFileSync(path.join(root, "src/shared/newtab/newtab.js"), "utf8");
  assert.match(source, /fetchBoundedRemoteImageBlob\(parsed\.href\)/);
  assert.match(source, /fetchBoundedRemoteImageBlob\(shortcut\.imageSourceUrl\)/);
  assert.doesNotMatch(source, /const blob = await response\.blob\(\)/);
  assert.match(source, /AbortController/);
});

