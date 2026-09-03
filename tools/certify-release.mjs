#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VERSION_RE = /^export const VERSION = "([^"]+)";/m;

export function parseCertificationArgs(argv) {
  const args = { skipBrowserSmoke: false, plan: false, keepVerifyTree: false };
  for (const token of argv) {
    if (token === "--skip-browser-smoke") args.skipBrowserSmoke = true;
    else if (token === "--plan") args.plan = true;
    else if (token === "--keep-verify-tree") args.keepVerifyTree = true;
    else throw new Error(`Unknown certification option: ${token}`);
  }
  return args;
}

export function certificationPlan({ skipBrowserSmoke = false } = {}) {
  return [
    { id: "build", label: "Canonical build", command: ["node", "tools/build.mjs"] },
    { id: "tests", label: "Full regression suite", command: ["npm", "test"], npm: true },
    { id: "reachability", label: "Runtime reachability", command: ["npm", "run", "reachability"], npm: true },
    ...(skipBrowserSmoke ? [] : [
      { id: "browser-smoke", label: "Real Firefox + Chromium smoke", command: ["npm", "run", "smoke:browsers"], npm: true }
    ]),
    { id: "benchmark", label: "Performance benchmark", command: ["npm", "run", "bench"], npm: true },
    { id: "size", label: "Runtime size report", command: ["npm", "run", "size"], npm: true },
    { id: "generated-contract", label: "Generated release contracts", command: ["python", "tools/release_contract.py"] },
    { id: "package", label: "Deterministic release packaging", command: ["python", "tools/package.py"] },
    { id: "packaged-contract", label: "Packaged release contracts", internal: true },
    { id: "clean-room", label: "Clean-source rebuild/retest/repackage", internal: true },
    { id: "byte-compare", label: "Byte-for-byte artifact verification", internal: true }
  ];
}

function commandText(spec) {
  const first = spec.command?.join(" ") || "internal";
  return spec.chained ? `${first} && ${spec.chained.join(" ")}` : first;
}

function runProcess(command, args, { cwd = ROOT, env = process.env, shell = false } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const useShell = shell || (process.platform === "win32" && command === "npm");
    const child = spawn(command, args, { cwd, env, shell: useShell, stdio: "inherit" });
    child.on("error", rejectPromise);
    child.on("exit", (code, signal) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`${command} ${args.join(" ")} failed${signal ? ` with signal ${signal}` : ` with exit ${code}`}`));
    });
  });
}

async function runSpec(spec, cwd) {
  if (!spec.command) return;
  const [command, ...args] = spec.command;
  await runProcess(command, args, { cwd, shell: Boolean(spec.shell) });
}

async function canonicalVersion(root = ROOT) {
  const text = await readFile(join(root, "src/shared/core/constants.js"), "utf8");
  const match = VERSION_RE.exec(text);
  if (!match) throw new Error("Canonical VERSION declaration not found.");
  return match[1];
}

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function hashReleaseArtifacts(root, version) {
  const paths = {
    firefox: join(root, "artifacts", `mosaicsync-${version}-firefox.zip`),
    chrome: join(root, "artifacts", `mosaicsync-${version}-chrome.zip`),
    source: join(root, "artifacts", `mosaicsync-${version}-github-ready.zip`),
    buildManifest: join(root, "build-manifest.json")
  };
  const hashes = {};
  for (const [name, path] of Object.entries(paths)) hashes[name] = await sha256(path);
  return { paths, hashes };
}

async function validatePackagedContracts(root, version) {
  for (const browser of ["firefox", "chrome"]) {
    const suffix = browser === "chrome" ? "chrome" : "firefox";
    await runProcess("python", ["tools/release_contract.py", "--zip", browser, `artifacts/mosaicsync-${version}-${suffix}.zip`], { cwd: root });
  }
}

export async function extractSourceZip(sourceZip, destination) {
  await mkdir(destination, { recursive: true });
  const code = [
    "from pathlib import Path",
    "from zipfile import ZipFile",
    "import sys",
    "src=Path(sys.argv[1])",
    "dst=Path(sys.argv[2])",
    "with ZipFile(src, 'r') as z:",
    "    z.extractall(dst)"
  ].join("\n");
  await runProcess("python", ["-c", code, sourceZip, destination], { cwd: ROOT });
}

export function compareArtifactHashes(expected, actual) {
  const mismatches = [];
  for (const name of ["firefox", "chrome", "source", "buildManifest"]) {
    if (expected[name] !== actual[name]) mismatches.push({ name, expected: expected[name], actual: actual[name] });
  }
  return mismatches;
}

async function runCleanRoom(root, version, original, { keepVerifyTree = false } = {}) {
  const tempRoot = await mkdtemp(join(tmpdir(), `mosaicsync-${version}-certify-`));
  const verifyRoot = join(tempRoot, "source");
  try {
    await extractSourceZip(original.paths.source, verifyRoot);
    console.log(`\n[CLEAN ROOM] ${verifyRoot}`);
    await runProcess("node", ["tools/build.mjs"], { cwd: verifyRoot });
    await runProcess("npm", ["test"], { cwd: verifyRoot });
    await runProcess("npm", ["run", "reachability"], { cwd: verifyRoot });
    await runProcess("python", ["tools/release_contract.py"], { cwd: verifyRoot });
    await runProcess("python", ["tools/package.py"], { cwd: verifyRoot });
    await validatePackagedContracts(verifyRoot, version);
    const reproduced = await hashReleaseArtifacts(verifyRoot, version);
    const mismatches = compareArtifactHashes(original.hashes, reproduced.hashes);
    if (mismatches.length) {
      const detail = mismatches.map(({ name, expected, actual }) => `${name}: ${expected} != ${actual}`).join("\n");
      throw new Error(`Clean-room artifact mismatch:\n${detail}`);
    }
    return { verifyRoot, hashes: reproduced.hashes };
  } finally {
    if (!keepVerifyTree) await rm(tempRoot, { recursive: true, force: true });
    else console.log(`[KEEP] Clean-room verification tree retained at ${verifyRoot}`);
  }
}

async function writeCertificationReport(root, report) {
  const out = join(root, "artifacts", "certification-report.json");
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return out;
}

export async function runCertification({ root = ROOT, skipBrowserSmoke = false, keepVerifyTree = false } = {}) {
  const version = await canonicalVersion(root);
  const plan = certificationPlan({ skipBrowserSmoke });
  const completed = [];
  const startedAt = new Date().toISOString();

  console.log(`MosaicSync ${version} release certification`);
  if (skipBrowserSmoke) {
    console.warn("\nWARNING: browser smoke is explicitly skipped. This run can only produce MECHANICAL_ONLY status, never FULL certification.\n");
  }

  for (const spec of plan) {
    if (spec.internal) continue;
    console.log(`\n=== ${spec.label} ===\n${commandText(spec)}`);
    await runSpec(spec, root);
    completed.push(spec.id);
  }

  console.log("\n=== Packaged release contracts ===");
  await validatePackagedContracts(root, version);
  completed.push("packaged-contract");

  const original = await hashReleaseArtifacts(root, version);
  console.log("\n=== Clean-source rebuild / retest / repackage ===");
  const cleanRoom = await runCleanRoom(root, version, original, { keepVerifyTree });
  completed.push("clean-room", "byte-compare");

  const level = skipBrowserSmoke ? "MECHANICAL_ONLY" : "FULL";
  const report = {
    schemaVersion: 1,
    version,
    certificationLevel: level,
    fullyCertified: level === "FULL",
    browserSmokeExecuted: !skipBrowserSmoke,
    startedAt,
    finishedAt: new Date().toISOString(),
    completed,
    artifactSha256: original.hashes,
    cleanRoomSha256: cleanRoom.hashes
  };
  const reportPath = await writeCertificationReport(root, report);

  console.log(`\n${"=".repeat(68)}`);
  if (level === "FULL") console.log(`CERTIFIED: MosaicSync ${version} — FULL`);
  else console.log(`VERIFIED: MosaicSync ${version} — MECHANICAL ONLY (NOT FULL CERTIFICATION)`);
  console.log(`Report: ${reportPath}`);
  console.log(`${"=".repeat(68)}\n`);
  return report;
}

async function main() {
  const args = parseCertificationArgs(process.argv.slice(2));
  if (args.plan) {
    for (const step of certificationPlan(args)) console.log(`${step.id}\t${step.label}\t${commandText(step)}`);
    return;
  }
  await runCertification(args);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(`\nCERTIFICATION FAILED: ${error?.stack || error}`);
    process.exitCode = 1;
  });
}
