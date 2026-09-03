#!/usr/bin/env node
import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ELEMENT_KEY = "element-6066-11e4-a52e-4f735466cecf";

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

export function isKnownBrandedChromeBinary(candidate) {
  const normalized = String(candidate || "").replace(/\\/g, "/").toLowerCase();
  const basename = normalized.split("/").at(-1) || "";
  if (basename === "google-chrome" || basename === "google-chrome-stable") return true;
  if (normalized.includes("/google/chrome/application/chrome.exe")) return true;
  return normalized.includes("/applications/google chrome.app/");
}

export function parseBrowserSmokeArgs(argv = process.argv.slice(2)) {
  const out = { browser: "all", probe: false, keepProfile: false };
  for (const arg of argv) {
    if (arg === "--probe") out.probe = true;
    else if (arg === "--keep-profile") out.keepProfile = true;
    else if (arg.startsWith("--browser=")) out.browser = arg.slice("--browser=".length);
    else throw new Error(`Unknown browser-smoke option: ${arg}`);
  }
  if (!new Set(["all", "firefox", "chrome"]).has(out.browser)) {
    throw new Error(`Unsupported browser-smoke target: ${out.browser}`);
  }
  return out;
}

async function existsExecutable(candidate) {
  if (!candidate) return false;
  try {
    await fs.access(candidate, process.platform === "win32" ? fsConstants.F_OK : fsConstants.X_OK);
    return true;
  } catch { return false; }
}

async function resolveOnPath(name) {
  const dirs = String(process.env.PATH || "").split(path.delimiter).filter(Boolean);
  const suffixes = process.platform === "win32"
    ? String(process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM").split(";")
    : [""];
  for (const dir of dirs) {
    for (const suffix of suffixes) {
      const candidate = path.join(dir, `${name}${suffix}`);
      if (await existsExecutable(candidate)) return candidate;
    }
  }
  return "";
}

async function firstExecutable(candidates) {
  for (const candidate of candidates.filter(Boolean)) {
    if (path.isAbsolute(candidate) || candidate.includes(path.sep)) {
      if (await existsExecutable(candidate)) return candidate;
    } else {
      const resolved = await resolveOnPath(candidate);
      if (resolved) return resolved;
    }
  }
  return "";
}

export async function discoverBrowserSmokeEnvironment(env = process.env) {
  const firefox = await firstExecutable([
    env.MOSAICSYNC_FIREFOX_BIN,
    "firefox", "firefox-esr",
    process.platform === "win32" ? "C:\\Program Files\\Mozilla Firefox\\firefox.exe" : "",
    process.platform === "win32" ? "C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe" : "",
    process.platform === "darwin" ? "/Applications/Firefox.app/Contents/MacOS/firefox" : ""
  ]);
  const geckodriver = await firstExecutable([env.MOSAICSYNC_GECKODRIVER_BIN, "geckodriver"]);
  const chromeCandidate = await firstExecutable([
    env.MOSAICSYNC_CHROME_BIN,
    "chrome-for-testing", "chromium", "chromium-browser"
  ]);
  const chromeRejected = isKnownBrandedChromeBinary(chromeCandidate) ? chromeCandidate : "";
  const chrome = chromeRejected ? "" : chromeCandidate;
  const chromedriver = await firstExecutable([env.MOSAICSYNC_CHROMEDRIVER_BIN, "chromedriver"]);
  const xvfb = process.platform === "linux" ? await firstExecutable([env.MOSAICSYNC_XVFB_BIN, "Xvfb"]) : "";
  return { firefox, geckodriver, chrome, chromeRejected, chromedriver, xvfb };
}

async function allocatePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", error => error ? reject(error) : resolve()));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function startVirtualDisplay(xvfb) {
  if (process.platform !== "linux" || process.env.DISPLAY) return null;
  if (!xvfb) throw new Error("Chromium real-browser smoke needs DISPLAY or Xvfb on Linux.");
  for (let displayNumber = 120; displayNumber < 180; displayNumber += 1) {
    const lock = `/tmp/.X${displayNumber}-lock`;
    try { await fs.access(lock); continue; } catch {}
    const display = `:${displayNumber}`;
    const child = spawn(xvfb, [display, "-screen", "0", "1280x900x24", "-nolisten", "tcp", "-ac"], {
      stdio: ["ignore", "ignore", "pipe"]
    });
    let stderr = "";
    child.stderr.on("data", chunk => { stderr += String(chunk); });
    await sleep(250);
    if (child.exitCode == null) return { child, display };
    if (stderr) continue;
  }
  throw new Error("Could not start an Xvfb display for Chromium smoke testing.");
}

class DriverProcess {
  constructor(child, baseUrl, stderr) { this.child = child; this.baseUrl = baseUrl; this.stderr = stderr; }
  async stop() {
    if (this.child.exitCode == null) this.child.kill("SIGTERM");
    await Promise.race([new Promise(resolve => this.child.once("exit", resolve)), sleep(1000)]);
    if (this.child.exitCode == null) this.child.kill("SIGKILL");
  }
}

async function waitDriverReady(baseUrl, child, stderrRef) {
  for (let index = 0; index < 80; index += 1) {
    if (child.exitCode != null) throw new Error(`Browser driver exited early (${child.exitCode}).\n${stderrRef.value}`);
    try {
      const response = await fetch(`${baseUrl}/status`);
      if (response.ok) return;
    } catch {}
    await sleep(100);
  }
  throw new Error(`Browser driver did not become ready.\n${stderrRef.value}`);
}

async function launchDriver(kind, executable, env = process.env) {
  const port = await allocatePort();
  const args = kind === "firefox" ? ["--port", String(port), "--log", "error"] : [`--port=${port}`, "--allowed-ips="];
  const stderrRef = { value: "" };
  const child = spawn(executable, args, { stdio: ["ignore", "ignore", "pipe"], env });
  child.stderr.on("data", chunk => { stderrRef.value += String(chunk); });
  const baseUrl = `http://127.0.0.1:${port}`;
  await waitDriverReady(baseUrl, child, stderrRef);
  return new DriverProcess(child, baseUrl, stderrRef);
}

export class WebDriverClient {
  constructor(baseUrl) { this.baseUrl = baseUrl.replace(/\/$/, ""); this.sessionId = ""; }
  async request(method, endpoint, body = undefined) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    let payload = {};
    try { payload = await response.json(); } catch {}
    if (!response.ok || payload?.value?.error) {
      const message = payload?.value?.message || payload?.message || `${method} ${endpoint} failed with HTTP ${response.status}`;
      throw new Error(message);
    }
    return payload?.value ?? payload;
  }
  async newSession(capabilities) {
    const value = await this.request("POST", "/session", { capabilities: { alwaysMatch: capabilities } });
    this.sessionId = value.sessionId || value?.value?.sessionId || "";
    if (!this.sessionId) throw new Error("WebDriver did not return a session id.");
    return value;
  }
  endpoint(suffix) { return `/session/${this.sessionId}${suffix}`; }
  navigate(url) { return this.request("POST", this.endpoint("/url"), { url }); }
  currentUrl() { return this.request("GET", this.endpoint("/url")); }
  refresh() { return this.request("POST", this.endpoint("/refresh"), {}); }
  execute(script, args = []) { return this.request("POST", this.endpoint("/execute/sync"), { script, args }); }
  executeAsync(script, args = []) { return this.request("POST", this.endpoint("/execute/async"), { script, args }); }
  async find(css) {
    const value = await this.request("POST", this.endpoint("/element"), { using: "css selector", value: css });
    return value?.[ELEMENT_KEY] || value?.ELEMENT || "";
  }
  click(elementId) { return this.request("POST", this.endpoint(`/element/${elementId}/click`), {}); }
  installFirefoxAddon(addonPath) {
    return this.request("POST", this.endpoint("/moz/addon/install"), { path: addonPath, temporary: true });
  }
  async deleteSession() {
    if (!this.sessionId) return;
    try { await this.request("DELETE", this.endpoint("")); } catch {}
    this.sessionId = "";
  }
}

export function browserCapabilities(kind, { browserBinary, chromeExtensionPath, display = "" } = {}) {
  if (kind === "firefox") {
    return {
      browserName: "firefox",
      acceptInsecureCerts: true,
      "moz:firefoxOptions": {
        ...(browserBinary ? { binary: browserBinary } : {}),
        args: ["-headless"],
        prefs: {
          "browser.shell.checkDefaultBrowser": false,
          "browser.startup.homepage_override.mstone": "ignore",
          "startup.homepage_welcome_url": "",
          "startup.homepage_welcome_url.additional": "",
          "datareporting.policy.dataSubmissionEnabled": false
        }
      }
    };
  }
  if (isKnownBrandedChromeBinary(browserBinary)) {
    throw new Error("Chromium smoke requires Chrome for Testing or Chromium; current branded Google Chrome does not support command-line unpacked-extension loading.");
  }
  const args = [
    `--load-extension=${chromeExtensionPath}`,
    `--disable-extensions-except=${chromeExtensionPath}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-sync",
    "--metrics-recording-only"
  ];
  if (process.platform === "linux") args.push("--no-sandbox", "--disable-dev-shm-usage");
  return {
    browserName: "chrome",
    acceptInsecureCerts: true,
    "goog:chromeOptions": {
      ...(browserBinary ? { binary: browserBinary } : {}),
      args
    }
  };
}

const SEED_SCRIPT = String.raw`
const done = arguments[arguments.length - 1];
(async () => {
  const api = globalThis.browser || globalThis.chrome;
  if (!api?.runtime?.getURL || !api?.storage?.local) throw new Error("extension APIs unavailable");
  const constants = await import(api.runtime.getURL("core/constants.js"));
  const state = structuredClone(constants.DEFAULT_STATE);
  const now = Date.now();
  const shortcut = {
    type: "shortcut", id: "mosaicsync-real-smoke-shortcut", title: "Smoke Shortcut",
    url: "https://example.com/", image: "", builtinIcon: "", colorTag: "", imageStyle: "contain",
    imageSyncKind: "none", imageSourceKind: "none", position: 0, createdAt: now, modifiedAt: now, source: "manual"
  };
  state.spaces.personal.shortcuts = [shortcut];
  state.shortcuts = [shortcut];
  state.spaces.personal.settings.autoSiteIcons = false;
  state.spaces.personal.settings.webAccessPrompted = true;
  state.spaces.personal.settings.frequentlyVisitedEnabled = false;
  state.settings = state.spaces.personal.settings;
  const meta = {
    ...structuredClone(constants.DEFAULT_META), onboardingCompleted: true, onboardingVersion: "real-smoke",
    deviceId: "real-smoke-device", deviceName: "Real Browser Smoke"
  };
  await api.storage.local.set({ [constants.LOCAL_STATE_KEY]: state, [constants.LOCAL_META_KEY]: meta });
  done({ ok: true });
})().catch(error => done({ ok: false, error: String(error?.stack || error) }));
`;

const SNAPSHOT_SCRIPT = String.raw`
const timing = globalThis.__mosaicsyncStartupTiming?.phases || {};
const settings = document.getElementById("settingsButton");
const frequentToggle = document.getElementById("settingsFrequentlyVisited");
const frequentSection = document.getElementById("frequentSitesSection");
const work = document.querySelector('.space-button[data-space-id="work"]');
const shortcut = document.querySelector('.shortcut-slot[data-id="mosaicsync-real-smoke-shortcut"] > .shortcut-card');
return {
  href: location.href,
  ready: Number.isFinite(timing.interactionReady),
  settingsPresent: !!settings,
  settingsExpanded: settings?.getAttribute("aria-expanded") === "true",
  settingsDialogVisible: document.getElementById("settingsDialog")?.hidden === false,
  workPressed: work?.getAttribute("aria-pressed") === "true",
  shortcutPresent: !!shortcut,
  shortcutHref: shortcut?.href || "",
  frequentTogglePresent: !!frequentToggle,
  frequentDisabledConsistent: frequentToggle?.checked === false && frequentSection?.hidden === true,
  title: document.title,
  text: document.body?.innerText?.slice(0, 500) || ""
};
`;

async function waitForExtensionPage(client, expectedScheme, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const current = String(await client.currentUrl());
    if (current.startsWith(expectedScheme)) return current;
    await sleep(100);
  }
  throw new Error(`New Tab override did not resolve to ${expectedScheme} within ${timeoutMs}ms.`);
}

async function waitForReadySnapshot(client, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try { last = await client.execute(SNAPSHOT_SCRIPT); } catch {}
    if (last?.ready && last?.settingsPresent && last?.shortcutPresent) return last;
    await sleep(100);
  }
  throw new Error(`MosaicSync did not reach interactionReady in the real browser. Last snapshot: ${JSON.stringify(last)}`);
}

export async function exerciseRealBrowserSession(client, kind) {
  const newtab = kind === "firefox" ? "about:newtab" : "chrome://newtab/";
  const scheme = kind === "firefox" ? "moz-extension://" : "chrome-extension://";
  await client.navigate(newtab);
  const extensionUrl = await waitForExtensionPage(client, scheme);
  const seeded = await client.executeAsync(SEED_SCRIPT);
  if (!seeded?.ok) throw new Error(`Could not seed real-browser smoke profile: ${seeded?.error || "unknown error"}`);
  // A fresh profile may initially redirect New Tab to the onboarding page.
  // After seeding the completed-onboarding state, navigate through the browser's real New Tab override again rather than merely refreshing onboarding.
  await client.navigate(newtab);
  await waitForExtensionPage(client, scheme);
  let snapshot = await waitForReadySnapshot(client);
  if (!snapshot.frequentTogglePresent || !snapshot.frequentDisabledConsistent) {
    throw new Error(`Frequently Visited disabled-state wiring is inconsistent: ${JSON.stringify(snapshot)}`);
  }

  const settingsId = await client.find("#settingsButton");
  await client.click(settingsId);
  await sleep(150);
  snapshot = await client.execute(SNAPSHOT_SCRIPT);
  if (!snapshot.settingsDialogVisible || !snapshot.settingsExpanded) {
    throw new Error(`Settings did not open in the real browser: ${JSON.stringify(snapshot)}`);
  }

  await client.execute(`document.querySelector('[data-close-dialog="settingsDialog"]')?.click(); return true;`);
  const workId = await client.find('.space-button[data-space-id="work"]');
  await client.click(workId);
  await sleep(150);
  snapshot = await client.execute(SNAPSHOT_SCRIPT);
  if (!snapshot.workPressed) throw new Error(`Work Space did not become active: ${JSON.stringify(snapshot)}`);

  const personalId = await client.find('.space-button[data-space-id="personal"]');
  await client.click(personalId);
  await sleep(120);
  const shortcutId = await client.find('.shortcut-slot[data-id="mosaicsync-real-smoke-shortcut"] > .shortcut-card');
  await client.click(shortcutId);
  await sleep(200);
  const navigatedUrl = String(await client.currentUrl());
  if (!navigatedUrl.startsWith("https://example.com/")) {
    throw new Error(`Shortcut click did not navigate in the real browser; got ${navigatedUrl}`);
  }

  return { kind, extensionUrl, finalUrl: navigatedUrl, startup: snapshot };
}

export async function runBrowserSmoke(kind, environment, { root = ROOT, keepProfile = false } = {}) {
  if (kind === "firefox" && (!environment.firefox || !environment.geckodriver)) {
    throw new Error("Firefox smoke requires Firefox and geckodriver. Set MOSAICSYNC_FIREFOX_BIN and MOSAICSYNC_GECKODRIVER_BIN if they are not on PATH.");
  }
  if (kind === "chrome" && (!environment.chrome || !environment.chromedriver)) {
    const rejected = environment.chromeRejected ? ` Branded Chrome was rejected: ${environment.chromeRejected}.` : "";
    throw new Error(`Chromium smoke requires Chrome for Testing or Chromium plus chromedriver.${rejected} Set MOSAICSYNC_CHROME_BIN and MOSAICSYNC_CHROMEDRIVER_BIN if needed.`);
  }

  const profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), `mosaicsync-${kind}-smoke-`));
  let display = null;
  let driver = null;
  let client = null;
  try {
    if (kind === "chrome") display = await startVirtualDisplay(environment.xvfb);
    const driverEnv = { ...process.env };
    if (display?.display) driverEnv.DISPLAY = display.display;
    driver = await launchDriver(kind, kind === "firefox" ? environment.geckodriver : environment.chromedriver, driverEnv);
    client = new WebDriverClient(driver.baseUrl);
    const capabilities = browserCapabilities(kind, {
      browserBinary: kind === "firefox" ? environment.firefox : environment.chrome,
      chromeExtensionPath: path.join(root, "dist", "chrome"),
      display: display?.display || process.env.DISPLAY || ""
    });
    // Give each real-browser session an isolated browser profile.
    if (kind === "chrome") capabilities["goog:chromeOptions"].args.push(`--user-data-dir=${path.join(profileRoot, "profile")}`);
    await client.newSession(capabilities);
    if (kind === "firefox") {
      const devPackage = path.join(root, "dev-artifacts", `mosaicsync-${await canonicalVersion(root)}-firefox-dev-temporary.zip`);
      try { await fs.access(devPackage); }
      catch { throw new Error(`Firefox development package is missing: ${devPackage}. Run npm run smoke:prepare first.`); }
      await client.installFirefoxAddon(devPackage);
    }
    return await exerciseRealBrowserSession(client, kind);
  } finally {
    await client?.deleteSession();
    await driver?.stop();
    if (display?.child?.exitCode == null) display.child.kill("SIGTERM");
    if (!keepProfile) await fs.rm(profileRoot, { recursive: true, force: true });
  }
}

async function canonicalVersion(root = ROOT) {
  const source = await fs.readFile(path.join(root, "src/shared/core/constants.js"), "utf8");
  const match = source.match(/export const VERSION\s*=\s*"([^"]+)"/);
  if (!match) throw new Error("Could not read canonical MosaicSync VERSION.");
  return match[1];
}

async function main() {
  const options = parseBrowserSmokeArgs();
  const environment = await discoverBrowserSmokeEnvironment();
  if (options.probe) {
    console.log(JSON.stringify(environment, null, 2));
    return;
  }
  const targets = options.browser === "all" ? ["firefox", "chrome"] : [options.browser];
  const results = [];
  for (const kind of targets) {
    process.stdout.write(`Real-browser smoke: ${kind} ... `);
    const result = await runBrowserSmoke(kind, environment, { keepProfile: options.keepProfile });
    results.push(result);
    console.log("PASS");
  }
  console.log(JSON.stringify({ ok: true, results }, null, 2));
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main().catch(error => {
    console.error(`Real-browser smoke FAILED: ${error?.stack || error}`);
    process.exitCode = 1;
  });
}
