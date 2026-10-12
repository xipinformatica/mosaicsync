#!/usr/bin/env node
import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import { createServer } from "node:http";
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
  const out = { browser: "all", probe: false, keepProfile: false, artifactsDir: "" };
  for (const arg of argv) {
    if (arg === "--probe") out.probe = true;
    else if (arg === "--keep-profile") out.keepProfile = true;
    else if (arg.startsWith("--browser=")) out.browser = arg.slice("--browser=".length);
    else if (arg.startsWith("--artifacts-dir=")) out.artifactsDir = arg.slice("--artifacts-dir=".length);
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
    if (this.child.exitCode != null || this.child.signalCode != null) return;
    this.child.kill("SIGTERM");
    await Promise.race([new Promise(resolve => this.child.once("exit", resolve)), sleep(1000)]);
    if (this.child.exitCode == null && this.child.signalCode == null) this.child.kill("SIGKILL");
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
      // A dead or blocked browser must not strand an entire CI worker.
      signal: AbortSignal.timeout(20000),
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
  windowHandles() { return this.request("GET", this.endpoint("/window/handles")); }
  switchWindow(handle) { return this.request("POST", this.endpoint("/window"), { handle }); }
  actions(actions) { return this.request("POST", this.endpoint("/actions"), { actions }); }
  releaseActions() { return this.request("DELETE", this.endpoint("/actions"), {}); }
  execute(script, args = []) { return this.request("POST", this.endpoint("/execute/sync"), { script, args }); }
  executeAsync(script, args = []) { return this.request("POST", this.endpoint("/execute/async"), { script, args }); }
  // ChromeDriver's supported pass-through to the active Chrome DevTools target.
  cdp(cmd, params = {}) { return this.request("POST", this.endpoint("/goog/cdp/execute"), { cmd, params }); }
  async find(css) {
    const value = await this.request("POST", this.endpoint("/element"), { using: "css selector", value: css });
    return value?.[ELEMENT_KEY] || value?.ELEMENT || "";
  }
  click(elementId) { return this.request("POST", this.endpoint(`/element/${elementId}/click`), {}); }
  installFirefoxAddon(addonPath) {
    return this.request("POST", this.endpoint("/moz/addon/install"), { path: addonPath, temporary: true });
  }
  screenshot() { return this.request("GET", this.endpoint("/screenshot")); }
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
        args: ["-headless", "-remote-allow-system-access"],
        prefs: {
          "browser.shell.checkDefaultBrowser": false,
          "browser.startup.homepage_override.mstone": "ignore",
          "startup.homepage_welcome_url": "",
          "startup.homepage_welcome_url.additional": "",
          "datareporting.policy.dataSubmissionEnabled": false,
          // CI explicitly suppresses the native optional-website-permission dialog;
          // its outcome is not a production permission-flow test.
          "extensions.webextOptionalPermissionPrompts": false
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

// Smoke navigation must never depend on public DNS/TLS or outside websites.
// The target is a short-lived local endpoint reachable only from this runner.
export async function startLocalNavigationTarget() {
  const server = createServer((request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    response.end("<!doctype html><title>MosaicSync browser smoke navigation</title><p>Navigation reached local smoke target.</p>");
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}/mosaicsync-smoke`,
    close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  };
}

// Only the automated Chromium session declines optional website access. This
// is injected before extension pages load, avoiding an unanswerable native
// browser permission dialog while keeping the real Welcome/UI path intact.
export async function configureChromeSmokePermissionDecision(client) {
  await client.cdp("Page.enable");
  await client.cdp("Page.addScriptToEvaluateOnNewDocument", {
    source: "if (globalThis.chrome?.permissions?.request) chrome.permissions.request = async () => false;"
  });
  return "website-access: simulated decline (Chrome DevTools pre-document injection)";
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
  startupPhases: { ...timing },
  navigationTiming: (() => {
    const entry = performance.getEntriesByType?.("navigation")?.[0];
    if (!entry) return null;
    return {
      domInteractive: Number(entry.domInteractive) || 0,
      domContentLoadedEventEnd: Number(entry.domContentLoadedEventEnd) || 0,
      loadEventEnd: Number(entry.loadEventEnd) || 0,
      duration: Number(entry.duration) || 0
    };
  })(),
  domElementCount: document.getElementsByTagName("*").length,
  title: document.title,
  text: document.body?.innerText?.slice(0, 500) || ""
};
`;

// Firefox WebDriver blocks direct about:newtab navigation. Open a genuine
// Firefox browser New Tab in its privileged browser-chrome context, then
// switch back to content. System access is enabled ONLY in isolated CI.
// No direct extension-file navigation can conceal a broken New Tab override.
export async function openBrowserNewTab(client, kind) {
  if (kind !== "firefox") return client.navigate("chrome://newtab/");
  const previous = new Set(await client.windowHandles());
  await client.request("POST", client.endpoint("/moz/context"), { context: "chrome" });
  try {
    await client.execute(`
      const services = typeof Services === "undefined"
        ? ChromeUtils.importESModule("resource://gre/modules/Services.sys.mjs").Services
        : Services;
      const win = services.wm.getMostRecentWindow("navigator:browser");
      if (!win?.gBrowser) throw new Error("Firefox browser window not found");
      if (typeof win.BrowserCommands?.openTab === "function") {
        win.BrowserCommands.openTab();
      } else {
        win.gBrowser.selectedTab = win.gBrowser.addTrustedTab("about:newtab");
      }
    `);
  } finally {
    await client.request("POST", client.endpoint("/moz/context"), { context: "content" });
  }
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const handles = await client.windowHandles();
    for (const handle of handles) {
      if (previous.has(handle)) continue;
      await client.switchWindow(handle);
      const url = String(await client.currentUrl());
      // A Welcome tab can appear during addon installation: only the real
      // New Tab override is acceptable, never another extension page.
      if (url.startsWith("moz-extension://") && url.includes("/newtab/newtab.html")) return;
    }
    await sleep(100);
  }
  throw new Error("Firefox browser New Tab did not resolve to MosaicSync's override.");
}

export async function waitForExtensionPage(client, expectedScheme, timeoutMs = 12000) {
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

const MESSAGE_ROUNDTRIP_SCRIPT = String.raw`
const done = arguments[arguments.length - 1];
(async () => {
  const api = globalThis.browser || globalThis.chrome;
  if (!api?.runtime?.sendMessage) throw new Error("runtime.sendMessage missing");
  const answer = await api.runtime.sendMessage({ type: "mosaicsync:get-sync-status" });
  if (api.runtime.lastError) throw new Error(api.runtime.lastError.message);
  done({ ok: answer?.ok === true, response: answer });
})().catch(error => done({ ok: false, error: String(error?.message || error) }));
`;

async function waitForCondition(client, description, script, timeoutMs = 14000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try { last = await client.execute(script); } catch (error) { last = String(error.message || error); }
    if (last === true) return;
    await sleep(160);
  }
  throw new Error(`${description} timed out; last result: ${JSON.stringify(last)}`);
}

export async function stabilizeChromeSmokeTab(client) {
  const own = await client.request("GET", client.endpoint("/window"));
  await client.switchWindow(own);
  await client.cdp("Emulation.setDeviceMetricsOverride", {
    width: 1050, height: 684, deviceScaleFactor: 1, mobile: false
  });
}

async function exerciseFreshSetup(client, kind, { capture = async () => {}, navigationUrl = "https://example.com/" } = {}) {
  const scheme = kind === "firefox" ? "moz-extension://" : "chrome-extension://";
  await openBrowserNewTab(client, kind);
  const extensionUrl = await waitForExtensionPage(client, scheme, 20000);
  // The installation Welcome tab can steal the foreground. Chrome gives a
  // background target ~56 px of viewport, making UI elements unclickable.
  // Keep our original WebDriver tab and give its CDP target a stable viewport.
  if (kind === "chrome") await stabilizeChromeSmokeTab(client);
  await waitForCondition(client, "first-run Welcome", `return !!document.getElementById('introContinueButton') && !document.getElementById('introStep').hidden;`);
  await capture("welcome-intro");
  await client.click(await client.find("#introContinueButton"));
  await waitForCondition(client, "Sync-choice step", `return document.getElementById('syncStep')?.hidden === false;`, 25000);
  await capture("welcome-sync-choice");
  await client.click(await client.find('label.choice-card:has(input[name="syncChoice"][value="no"])'));
  await client.click(await client.find("#syncContinueButton"));
  await waitForCondition(client, "source-choice step", `return document.getElementById('sourceStep')?.hidden === false;`, 20000);
  await client.click(await client.find('label.choice-card:has(input[name="sourceChoice"][value="empty"])'));
  await client.click(await client.find("#sourceFinishButton"));
  await waitForCondition(client, "fresh setup completion", `return location.pathname.endsWith('/newtab/newtab.html') && !!document.getElementById('settingsButton');`, 25000);
  await capture("newtab-after-setup");
  const response = await client.executeAsync(MESSAGE_ROUNDTRIP_SCRIPT);
  if (!response?.ok) throw new Error(`Background status round-trip failed after fresh setup: ${JSON.stringify(response)}`);
  const completion = await client.executeAsync(`const done = arguments[arguments.length - 1]; (async () => {
    const api = globalThis.browser || globalThis.chrome;
    const { LOCAL_META_KEY } = await import(api.runtime.getURL('core/constants.js'));
    const meta = (await api.storage.local.get(LOCAL_META_KEY))[LOCAL_META_KEY];
    done({ onboardingCompleted: meta?.onboardingCompleted, syncEnabled: meta?.syncEnabled });
  })().catch(error => done({error:String(error)}));`);
  if (!completion?.onboardingCompleted || completion.syncEnabled !== false) throw new Error(`Local setup did not persist its choice: ${JSON.stringify(completion)}`);
  // Exercise an actual user-created shortcut and its persistence, before the
  // historical seeded-view smoke. This MUST use the real UI, not storage seeding.
  // The button itself is never hidden: its #emptyState container is, and MosaicSync keeps
  // it inert until saved data is verified. Wait until it is genuinely visible and clickable.
  await waitForCondition(client, "empty New Tab add control", `
    const button = document.getElementById('addFirstButton');
    const box = document.getElementById('emptyState');
    return !!button && !!box && !box.hidden && !box.inert && button.getClientRects().length > 0
      && Number.isFinite(globalThis.__mosaicsyncStartupTiming?.phases?.interactionReady);`);
  await client.click(await client.find('#addFirstButton'));
  await waitForCondition(client, "shortcut editor", `return !!document.getElementById('shortcutDialog')?.open;`);
  // Exercise the real automatic-name path. A manual name would bypass the
  // feature introduced in .50 and leave this browser gate blind to it.
  const suggestedName = await client.execute(`
    const title = document.getElementById('shortcutTitle');
    const url = document.getElementById('shortcutUrl');
    url.value = ${JSON.stringify(navigationUrl)};
    url.dispatchEvent(new Event('input', { bubbles: true }));
    return title.value;
  `);
  if (!suggestedName || typeof suggestedName !== 'string') throw new Error('Automatic offline shortcut naming did not populate the Name field');
  const submitted = await client.execute(`
    const name = document.getElementById('shortcutTitle');
    const automatic = document.getElementById('shortcutAutomaticName');
    const url = document.getElementById('shortcutUrl');
    if (!automatic?.checked || !name?.readOnly || url.compareDocumentPosition(name) !== Node.DOCUMENT_POSITION_FOLLOWING) return false;
    return !url.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  `);
  if (submitted !== true) throw new Error('URL-first Enter submission or automatic naming was not exercised');
  // Identify the created shortcut by URL. Its name may be the offline suggestion OR,
  // when website access is granted (Firefox CI), the refined page title.
  await waitForCondition(client, "created automatically named shortcut", `const target = new URL(${JSON.stringify(navigationUrl)}).href;
    const names = [${JSON.stringify(suggestedName)}, "MosaicSync browser smoke navigation"];
    return [...document.querySelectorAll('.shortcut-card')].some(card => {
      try { return new URL(card.href).href === target && names.some(n => card.textContent.includes(n.slice(0, 16))); } catch { return false; }
    });`, 20000);
  await client.refresh();
  await waitForCondition(client, "persisted shortcut", `const target = new URL(${JSON.stringify(navigationUrl)}).href;
    const names = [${JSON.stringify(suggestedName)}, "MosaicSync browser smoke navigation"];
    return [...document.querySelectorAll('.shortcut-card')].some(card => {
      try { return new URL(card.href).href === target && names.some(n => card.textContent.includes(n.slice(0, 16))); } catch { return false; }
    });`, 20000);
  // Wait for the reloaded New Tab to finish installing its interaction handlers.
  // This avoids a rare Chromium click race after refresh.
  await waitForCondition(client, "interactive New Tab after shortcut reload", `return Number.isFinite(globalThis.__mosaicsyncStartupTiming?.phases?.interactionReady);`, 20000);
  // Confirmations must be owned by MosaicSync, never native browser alert dialogs.
  // Exercise the same UI on Firefox and Chrome: first cancel, then accept.
  // After a reload the grid paints from cache before UI bindings attach (and stays
  // inert until verified). Click only once the page is genuinely interactive.
  await waitForCondition(client, "interactive grid after reload", `
    const chip = document.querySelector('.shortcut-slot .edit-chip');
    const grid = document.getElementById('shortcutGrid');
    return !!chip && !!grid && !grid.inert && chip.getClientRects().length > 0
      && Number.isFinite(globalThis.__mosaicsyncStartupTiming?.phases?.interactionReady);`, 20000);
  await client.execute(`document.querySelector('.shortcut-slot .edit-chip')?.click(); return true;`);
  await waitForCondition(client, "edit shortcut", `return document.getElementById('shortcutDialog')?.open && !document.getElementById('deleteShortcutButton')?.hidden;`, 20000);
  await client.click(await client.find('#deleteShortcutButton'));
  await waitForCondition(client, "custom confirmation", `return document.getElementById('mosaicConfirmDialog')?.open;`, 12000);
  const closedBeforeCancel = await client.execute(`
    window.__mosaicSmokeCloseCount = window.__mosaicSmokeCloseCount || 0;
    document.getElementById('mosaicConfirmDialog').addEventListener('close', () => { window.__mosaicSmokeCloseCount += 1; });
    return window.__mosaicSmokeCloseCount;
  `);
  await client.click(await client.find('#mosaicConfirmCancel'));
  await waitForCondition(client, "cancelled confirmation close event", `return !document.getElementById('mosaicConfirmDialog')?.open && document.getElementById('shortcutDialog')?.open && window.__mosaicSmokeCloseCount > ${closedBeforeCancel} && document.getElementById('mosaicConfirmDialog').returnValue === 'cancelled';`, 12000);
  await client.click(await client.find('#deleteShortcutButton'));
  await waitForCondition(client, "reopened custom confirmation", `return document.getElementById('mosaicConfirmDialog')?.open;`, 12000);
  await client.click(await client.find('#mosaicConfirmAccept'));
  await waitForCondition(client, "accepted confirmation close event", `return !document.getElementById('mosaicConfirmDialog')?.open && window.__mosaicSmokeCloseCount > ${closedBeforeCancel + 1} && document.getElementById('mosaicConfirmDialog').returnValue === 'accepted';`, 12000);
  // The shortcut may have been renamed after creation; verify deletion by
  // its stable URL rather than a title that might no longer be present.
  await waitForCondition(client, "confirmed shortcut deletion", `const target = new URL(${JSON.stringify(navigationUrl)}).href;
    return !document.getElementById('shortcutDialog')?.open && ![...document.querySelectorAll('.shortcut-card')].some(card => {
      try { return new URL(card.href).href === target; } catch { return false; }
    });`, 20000);
  return { extensionUrl, response: "ok", onboardingCompleted: true, shortcutCreateAndReload: true, automaticShortcutName: suggestedName, customConfirmation: true };
}

export async function exerciseRealBrowserSession(client, kind, { freshSetup = true, capture = async () => {}, navigationUrl = "https://example.com/", permissionDecision = "not-simulated" } = {}) {
  const scheme = kind === "firefox" ? "moz-extension://" : "chrome-extension://";
  const setupResult = freshSetup ? await exerciseFreshSetup(client, kind, { capture, navigationUrl }) : null;
  await openBrowserNewTab(client, kind);
  const extensionUrl = await waitForExtensionPage(client, scheme);
  const seeded = await client.executeAsync(SEED_SCRIPT.replaceAll("https://example.com/", navigationUrl));
  if (!seeded?.ok) throw new Error(`Could not seed real-browser smoke profile: ${seeded?.error || "unknown error"}`);
  // A fresh profile may initially redirect New Tab to the onboarding page.
  // After seeding the completed-onboarding state, navigate through the browser's real New Tab override again rather than merely refreshing onboarding.
  await openBrowserNewTab(client, kind);
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
  await capture("settings");

  await client.execute(`document.querySelector('[data-close-dialog="settingsDialog"]')?.click(); return true;`);
  const workId = await client.find('.space-button[data-space-id="work"]');
  await client.click(workId);
  await sleep(150);
  snapshot = await client.execute(SNAPSHOT_SCRIPT);
  if (!snapshot.workPressed) throw new Error(`Work Space did not become active: ${JSON.stringify(snapshot)}`);

  const personalId = await client.find('.space-button[data-space-id="personal"]');
  await client.click(personalId);
  await sleep(120);
  await capture("newtab-verified");
  const shortcutId = await client.find('.shortcut-slot[data-id="mosaicsync-real-smoke-shortcut"] > .shortcut-card');
  await client.click(shortcutId);
  await sleep(200);
  const navigatedUrl = String(await client.currentUrl());
  if (!navigatedUrl.startsWith(navigationUrl)) {
    throw new Error(`Shortcut click did not navigate in the real browser; got ${navigatedUrl}`);
  }

  return { kind, extensionUrl, freshSetup: setupResult, finalUrl: navigatedUrl, startup: snapshot, permissionDecision, navigationTarget: "local-http" };
}

export async function runBrowserSmoke(kind, environment, { root = ROOT, keepProfile = false, artifactsDir = "" } = {}) {
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
  let navigationTarget = null;
  try {
    navigationTarget = await startLocalNavigationTarget();
    let chromeExtensionPath = path.join(root, "dist", "chrome");
    if (kind === "chrome") {
      chromeExtensionPath = path.join(profileRoot, "release-package");
      const archive = path.join(root, "artifacts", `mosaicsync-${await canonicalVersion(root)}-chrome.zip`);
      const { execFileSync } = await import("node:child_process");
      execFileSync("python3", ["-c", "import sys,zipfile;zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])", archive, chromeExtensionPath]);
    }
    if (kind === "chrome") display = await startVirtualDisplay(environment.xvfb);
    const driverEnv = { ...process.env };
    if (display?.display) driverEnv.DISPLAY = display.display;
    driver = await launchDriver(kind, kind === "firefox" ? environment.geckodriver : environment.chromedriver, driverEnv);
    client = new WebDriverClient(driver.baseUrl);
    const capabilities = browserCapabilities(kind, {
      browserBinary: kind === "firefox" ? environment.firefox : environment.chrome,
      chromeExtensionPath,
      display: display?.display || process.env.DISPLAY || ""
    });
    // Give each real-browser session an isolated browser profile.
    if (kind === "chrome") capabilities["goog:chromeOptions"].args.push(`--user-data-dir=${path.join(profileRoot, "profile")}`);
    await client.newSession(capabilities);
    const permissionDecision = kind === "chrome"
      ? await configureChromeSmokePermissionDecision(client)
      : "website-access: native optional-permission prompts suppressed (Firefox test preference)";
    if (kind === "firefox") {
      const devPackage = path.join(root, "dev-artifacts", `mosaicsync-${await canonicalVersion(root)}-firefox-dev-temporary.zip`);
      try { await fs.access(devPackage); }
      catch { throw new Error(`Firefox development package is missing: ${devPackage}. Run npm run smoke:prepare first.`); }
      await client.installFirefoxAddon(devPackage);
    }
    try {
      const capture = async name => {
        if (!artifactsDir) return;
        await fs.mkdir(artifactsDir, { recursive: true });
        const screenshot = await client.screenshot();
        await fs.writeFile(path.join(artifactsDir, `${kind}-${name}.png`), Buffer.from(screenshot, "base64"));
      };
      const result = await exerciseRealBrowserSession(client, kind, {
        capture, navigationUrl: navigationTarget.url, permissionDecision
      });
      if (artifactsDir) {
        await fs.writeFile(path.join(artifactsDir, `${kind}-result.json`), JSON.stringify(result, null, 2) + "\n");
      }
      return result;
    } catch (error) {
      if (artifactsDir) {
        await fs.mkdir(artifactsDir, { recursive: true });
        try { await fs.writeFile(path.join(artifactsDir, `${kind}-failure.png`), Buffer.from(await client.screenshot(), "base64")); } catch {}
        await fs.writeFile(path.join(artifactsDir, `${kind}-failure.txt`), String(error?.stack || error));
      }
      throw error;
    }
  } finally {
    try { await client?.deleteSession(); } catch (error) { console.error(`Browser session cleanup: ${error}`); }
    try { await driver?.stop(); } catch (error) { console.error(`Driver cleanup: ${error}`); }
    if (display?.child && display.child.exitCode == null) display.child.kill("SIGTERM");
    if (navigationTarget) {
      try { await navigationTarget.close(); } catch (error) { console.error(`HTTP target cleanup: ${error}`); }
    }
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
    const result = await runBrowserSmoke(kind, environment, { keepProfile: options.keepProfile, artifactsDir: options.artifactsDir });
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
