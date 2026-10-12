/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. https://mozilla.org/MPL/2.0/ */

// A Fetch manual redirect deliberately conceals Location. Only our own
// extension-initiated title GET may provide a verified header. Request listeners
// are attached only for bounded title lookups, with a short idle tail for
// delayed response-header events. They are removed when idle, so unrelated
// browsing cannot repeatedly wake the extension worker. Events that do arrive
// during a lookup are ignored unless they match its extension-origin request;
// nothing about unrelated browsing is stored or transmitted.
export function approvedTitleRedirect(from, location) {
  try {
    const previous = new URL(from);
    const next = new URL(location, previous);
    const ownHost = host => host.toLowerCase().replace(/^www\./, "");
    if (!/^https?:$/.test(next.protocol) || next.username || next.password) return null;
    if (previous.protocol === "https:" && next.protocol !== "https:") return null;
    if (ownHost(previous.hostname) !== ownHost(next.hostname)) return null;
    if (previous.port !== next.port) return null;
    next.hash = "";
    return next.href;
  } catch { return null; }
}

const observers = new WeakMap();
const REDIRECT_EVENT_GRACE_MS = 300;
const REDIRECT_EVENT_FILTER = Object.freeze({ urls: ["<all_urls>"], types: ["xmlhttprequest"] });

function getRedirectObserver(api) {
  if (!api || typeof api !== "object") return null;
  if (observers.has(api)) return observers.get(api);
  const before = api.webRequest?.onBeforeRequest;
  const headers = api.webRequest?.onHeadersReceived;
  const root = api.runtime?.getURL?.("");
  if (!root || !before?.addListener || !headers?.addListener) {
    observers.set(api, null);
    return null;
  }
  const pending = new Set();
  const matches = (details, tracker) => {
    if (details.url !== tracker.url || details.method !== "GET" || details.type !== "xmlhttprequest") return false;
    try {
      const origin = new URL(details.initiator || details.originUrl);
      const own = new URL(root);
      return origin.protocol === own.protocol && origin.host === own.host;
    } catch { return false; }
  };
  const onBefore = details => {
    for (const tracker of pending) {
      if (matches(details, tracker)) {
        // Another simultaneous same-URL GET is ambiguous: fail closed.
        if (tracker.started.size < 2) tracker.started.add(details.requestId);
        if (tracker.started.size > 1) tracker.notify();
      }
    }
  };
  const onHeaders = details => {
    for (const tracker of pending) {
      if (!tracker.started.has(details.requestId) || !matches(details, tracker)) continue;
      const locations = (details.responseHeaders || []).filter(h => h.name.toLowerCase() === "location");
      tracker.observed.set(details.requestId, {
        status: details.statusCode,
        location: locations.length === 1 ? locations[0].value : ""
      });
      tracker.notify();
    }
  };
  // Do not subscribe at service-worker start: matching webRequest events can
  // otherwise keep waking a MV3 worker while completely unrelated tabs are busy.
  // Keep observers alive briefly after the last lookup to catch delayed headers.
  let active = false, teardown = null, settling = null;
  const ensureListening = async () => {
    if (teardown) { clearTimeout(teardown); teardown = null; }
    if (active) { if (settling) await settling; return true; }
    try {
      before.addListener(onBefore, REDIRECT_EVENT_FILTER);
      try { headers.addListener(onHeaders, REDIRECT_EVENT_FILTER, ["responseHeaders"]); }
      catch (error) { before.removeListener?.(onBefore); throw error; }
    } catch { return false; }
    active = true;
    settling = new Promise(r => setTimeout(r, 75)); // registration reaches the browser asynchronously
    await settling; settling = null;
    return true;
  };
  const scheduleTeardown = () => {
    if (pending.size || !active || teardown) return;
    teardown = setTimeout(() => {
      teardown = null;
      if (pending.size) return;
      before.removeListener(onBefore); headers.removeListener(onHeaders); active = false;
    }, 5000);
  };
  const observer = {
    async track(url) {
      const listening = await ensureListening();
      if (!listening) return null;
      const tracker = {
        url, started: new Set(), observed: new Map(), wake: null,
        notify() { this.wake?.(); }
      };
      pending.add(tracker);
      return {
        tracker,
        release() { pending.delete(tracker); tracker.notify(); scheduleTeardown(); },
        async waitForHeaders(signal) {
          if (tracker.observed.size || tracker.started.size > 1 || signal?.aborted) return;
          await new Promise(resolve => {
            let finished = false;
            const finish = () => {
              if (finished) return;
              finished = true;
              clearTimeout(timer);
              signal?.removeEventListener?.("abort", finish);
              tracker.wake = null;
              resolve();
            };
            const timer = setTimeout(finish, REDIRECT_EVENT_GRACE_MS);
            tracker.wake = finish;
            signal?.addEventListener?.("abort", finish, { once: true });
            if (tracker.observed.size || tracker.started.size > 1 || signal?.aborted) finish();
          });
        }
      };
    }
  };
  observers.set(api, observer);
  return observer;
}

// Create an observer lazily on the first approved title lookup; no browser
// webRequest listeners exist while the extension is otherwise idle.

export async function fetchShortcutTitleResponse(pageUrl, {
  api, signal, canReadOrigin, fetchImpl = fetch, maxRedirects = 3
}) {
  let current;
  try {
    const parsed = new URL(pageUrl);
    if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) throw Error();
    parsed.hash = "";
    current = parsed.href;
  } catch { return { reason: "invalid-url" }; }
  const seen = new Set();
  const observer = getRedirectObserver(api);
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    if (signal?.aborted) return { reason: "cancelled" };
    if (seen.has(current)) return { reason: "redirect-loop" };
    seen.add(current);
    if (!(await canReadOrigin(current))) return { reason: "permission" };
    if (signal?.aborted) return { reason: "cancelled" };
    const pending = await observer?.track(current);
    let response;
    try {
      response = await fetchImpl(current, {
        credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer",
        redirect: "manual", signal
      });
      if (signal?.aborted) {
        try { await response.body?.cancel(); } catch {}
        return { reason: "cancelled" };
      }
      const isRedirect = response.type === "opaqueredirect" || [301, 302, 303, 307, 308].includes(response.status);
      if (!isRedirect) return { response, finalPageUrl: response.url || current };
      try { await response.body?.cancel(); } catch {}
      if (hop === maxRedirects) return { reason: "redirect-limit" };
      // Fetch can resolve BEFORE webRequest dispatches response headers.
      // Wait only for that event, with an abortable 300 ms upper bound;
      // never speculate about the destination if it stays unavailable.
      await pending?.waitForHeaders(signal);
      if (signal?.aborted) return { reason: "cancelled" };
      const tracked = pending?.tracker;
      if (tracked?.started.size > 1) return { reason: "redirect-ambiguous" };
      if (tracked?.observed.size !== 1) return { reason: "redirect-unavailable" };
      const observed = tracked.observed.values().next().value;
      if (![301, 302, 303, 307, 308].includes(observed.status) || !observed.location) return { reason: "redirect-unavailable" };
      const next = approvedTitleRedirect(current, observed.location);
      if (!next) return { reason: "redirect-blocked" };
      current = next;
    } finally {
      pending?.release();
    }
  }
  return { reason: "redirect-limit" };
}
