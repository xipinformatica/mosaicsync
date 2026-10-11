// @kind integration
import test from 'node:test';
import assert from 'node:assert/strict';
import { WebDriverClient, browserCapabilities, configureChromeSmokePermissionDecision, startLocalNavigationTarget } from '../tools/browser-smoke.mjs';

test('.46 browser gate uses the ChromeDriver CDP protocol to decline optional access before real onboarding', async () => {
  const actual = [];
  const client = new WebDriverClient('http://127.0.0.1:3');
  client.sessionId = 'test-session';
  client.request = async (...args) => { actual.push(args); return { identifier: 'script-added' }; };
  const result = await configureChromeSmokePermissionDecision(client);
  assert.match(result, /simulated decline/);
  assert.equal(actual.length, 2, 'Chrome DevTools Page must be enabled before injecting the optional-permission decision');
  const [enableMethod, enableEndpoint, enableBody] = actual[0];
  assert.equal(enableMethod, 'POST');
  assert.equal(enableEndpoint, '/session/test-session/goog/cdp/execute');
  assert.equal(enableBody.cmd, 'Page.enable');
  assert.deepEqual(enableBody.params, {});
  const [method, endpoint, body] = actual[1];
  assert.equal(method, 'POST');
  assert.equal(endpoint, '/session/test-session/goog/cdp/execute');
  assert.equal(body.cmd, 'Page.addScriptToEvaluateOnNewDocument');
  assert.match(body.params.source, /chrome\.permissions\.request\s*=\s*async\s*\(\)\s*=>\s*false/);
});

test('.46 browser gate records Firefox optional-permission suppression in its real Firefox capabilities', () => {
  const options = browserCapabilities('firefox', { browserBinary: '/opt/firefox/firefox' });
  assert.equal(options['moz:firefoxOptions'].prefs['extensions.webextOptionalPermissionPrompts'], false);
});

test('.46 browser gate navigates to a locally hosted page without any external network dependency', async () => {
  const local = await startLocalNavigationTarget();
  try {
    const url = new URL(local.url);
    assert.equal(url.hostname, '127.0.0.1');
    assert.equal(url.protocol, 'http:');
    const response = await fetch(local.url, { signal: AbortSignal.timeout(2500) });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /MosaicSync browser smoke navigation/);
  } finally {
    await local.close();
  }
});
