import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  parseBrowserSmokeArgs,
  discoverBrowserSmokeEnvironment,
  browserCapabilities,
  exerciseRealBrowserSession
} from "../tools/browser-smoke.mjs";

function readySnapshot(overrides = {}) {
  return {
    href: "moz-extension://smoke/newtab/newtab.html",
    ready: true,
    settingsPresent: true,
    settingsExpanded: false,
    settingsDialogVisible: false,
    workPressed: false,
    shortcutPresent: true,
    shortcutHref: "https://example.com/",
    frequentTogglePresent: true,
    frequentDisabledConsistent: true,
    title: "MosaicSync",
    text: "",
    ...overrides
  };
}

class FakeRealBrowserClient {
  constructor(kind, { brokenFrequentlyVisited = false } = {}) {
    this.kind = kind;
    this.url = kind === "firefox" ? "about:blank" : "about:blank";
    this.settingsOpen = false;
    this.workPressed = false;
    this.brokenFrequentlyVisited = brokenFrequentlyVisited;
    this.calls = [];
  }
  async navigate(url) {
    this.calls.push(["navigate", url]);
    this.url = this.kind === "firefox"
      ? "moz-extension://smoke/newtab/newtab.html"
      : "chrome-extension://smoke/newtab/newtab.html";
  }
  async currentUrl() { return this.url; }
  async executeAsync(script) {
    this.calls.push(["executeAsync", script.includes("LOCAL_STATE_KEY")]);
    return { ok: true };
  }
  async refresh() { this.calls.push(["refresh"]); }
  async execute(script) {
    if (script.includes('data-close-dialog="settingsDialog"')) {
      this.settingsOpen = false;
      return true;
    }
    return readySnapshot({
      href: this.url,
      settingsExpanded: this.settingsOpen,
      settingsDialogVisible: this.settingsOpen,
      workPressed: this.workPressed,
      frequentDisabledConsistent: !this.brokenFrequentlyVisited
    });
  }
  async find(css) { this.calls.push(["find", css]); return css; }
  async click(id) {
    this.calls.push(["click", id]);
    if (id === "#settingsButton") this.settingsOpen = true;
    else if (id.includes('data-space-id="work"')) this.workPressed = true;
    else if (id.includes('data-space-id="personal"')) this.workPressed = false;
    else if (id.includes("mosaicsync-real-smoke-shortcut")) this.url = "https://example.com/";
  }
}

test("1.30.18.33 browser-smoke CLI and capabilities keep the production extension runtime external", () => {
  assert.deepEqual(parseBrowserSmokeArgs(["--browser=firefox", "--probe"]), {
    browser: "firefox", probe: true, keepProfile: false
  });
  assert.throws(() => parseBrowserSmokeArgs(["--browser=safari"]), /Unsupported browser-smoke target/);

  const firefox = browserCapabilities("firefox", { browserBinary: "/opt/firefox/firefox" });
  assert.equal(firefox.browserName, "firefox");
  assert.equal(firefox["moz:firefoxOptions"].binary, "/opt/firefox/firefox");
  assert.ok(firefox["moz:firefoxOptions"].args.includes("-headless"));

  const chrome = browserCapabilities("chrome", {
    browserBinary: "/opt/chrome/chrome",
    chromeExtensionPath: "/work/dist/chrome"
  });
  assert.equal(chrome.browserName, "chrome");
  assert.equal(chrome["goog:chromeOptions"].binary, "/opt/chrome/chrome");
  assert.ok(chrome["goog:chromeOptions"].args.includes("--load-extension=/work/dist/chrome"));
  assert.ok(chrome["goog:chromeOptions"].args.includes("--disable-extensions-except=/work/dist/chrome"));
});

test("1.30.18.33 browser-smoke environment discovery honors explicit browser/driver paths", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mosaicsync-smoke-discovery-"));
  try {
    const names = ["firefox-bin", "geckodriver-bin", "chrome-bin", "chromedriver-bin", "xvfb-bin"];
    for (const name of names) {
      const file = path.join(dir, name);
      await fs.writeFile(file, "#!/bin/sh\nexit 0\n");
      await fs.chmod(file, 0o755);
    }
    const result = await discoverBrowserSmokeEnvironment({
      ...process.env,
      MOSAICSYNC_FIREFOX_BIN: path.join(dir, "firefox-bin"),
      MOSAICSYNC_GECKODRIVER_BIN: path.join(dir, "geckodriver-bin"),
      MOSAICSYNC_CHROME_BIN: path.join(dir, "chrome-bin"),
      MOSAICSYNC_CHROMEDRIVER_BIN: path.join(dir, "chromedriver-bin"),
      MOSAICSYNC_XVFB_BIN: path.join(dir, "xvfb-bin")
    });
    assert.equal(result.firefox, path.join(dir, "firefox-bin"));
    assert.equal(result.geckodriver, path.join(dir, "geckodriver-bin"));
    assert.equal(result.chrome, path.join(dir, "chrome-bin"));
    assert.equal(result.chromedriver, path.join(dir, "chromedriver-bin"));
    if (process.platform === "linux") assert.equal(result.xvfb, path.join(dir, "xvfb-bin"));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

for (const kind of ["firefox", "chrome"]) {
  test(`1.30.18.33 real-${kind} smoke contract exercises startup, Settings, Spaces, FV state and shortcut navigation`, async () => {
    const client = new FakeRealBrowserClient(kind);
    const result = await exerciseRealBrowserSession(client, kind);
    assert.equal(result.kind, kind);
    assert.equal(result.finalUrl, "https://example.com/");
    assert.ok(client.calls.some(([name, value]) => name === "find" && value === "#settingsButton"));
    assert.ok(client.calls.some(([name, value]) => name === "find" && String(value).includes('data-space-id="work"')));
    assert.ok(client.calls.some(([name, value]) => name === "find" && String(value).includes("mosaicsync-real-smoke-shortcut")));
  });
}

test("1.30.18.33 real-browser smoke fails closed when Frequently Visited startup state is inconsistent", async () => {
  const client = new FakeRealBrowserClient("firefox", { brokenFrequentlyVisited: true });
  await assert.rejects(() => exerciseRealBrowserSession(client, "firefox"), /Frequently Visited disabled-state wiring is inconsistent/);
});
