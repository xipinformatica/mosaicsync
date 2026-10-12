// Test-harness only. On a fresh profile, MosaicSync's New Tab is intentionally
// replaced by Welcome. Firefox can unload the original document mid-script.
// Poll the resulting page's actual state rather than waiting a fixed delay.
export async function waitForFreshProfileWelcome(client, {
  timeoutMs = 20000,
  pollMs = 150,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
} = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastState = 'not started';
  while (true) {
    try {
      const state = await client.execute('return {pathname: location.pathname, readyState: document.readyState}');
      lastState = state;
      if (state?.pathname?.endsWith('/welcome/welcome.html') && state.readyState === 'complete') return;
    } catch (error) {
      lastState = String(error?.message || error);
    }
    if (Date.now() >= deadline) {
      let url = 'unavailable';
      try { url = String(await client.currentUrl()); } catch {}
      throw new Error(`Extension did not settle on the Welcome page; URL: ${url}; last state: ${JSON.stringify(lastState)}`);
    }
    await sleep(pollMs);
  }
}
