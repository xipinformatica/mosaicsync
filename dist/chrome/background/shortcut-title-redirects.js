/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. https://mozilla.org/MPL/2.0/ */

// Fetch's manual redirect response deliberately hides Location in browsers.
// Observe only our own matching response headers, then fetch an approved hop
// explicitly. Never switch to redirect:"follow", even for a trusted first hop.
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
  const extensionRoot = api?.runtime?.getURL?.("");
  const headersEvent = api?.webRequest?.onHeadersReceived;
  const beforeEvent = api?.webRequest?.onBeforeRequest;
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    if (signal?.aborted) return { reason: "cancelled" };
    if (seen.has(current)) return { reason: "redirect-loop" };
    seen.add(current);
    if (!(await canReadOrigin(current))) return { reason: "permission" };
    if (signal?.aborted) return { reason: "cancelled" };
    const observed = new Map();
    const started = new Set();
    const matches = details => {
      // No tab navigation or another extension's traffic may supply Location.
      if (details.url !== current || details.method !== "GET" || details.type !== "xmlhttprequest") return false;
      try {
        const origin = new URL(details.initiator || details.originUrl);
        const own = new URL(extensionRoot);
        return origin.protocol === own.protocol && origin.host === own.host;
      } catch { return false; }
    };
    const beforeListener = details => {
      // Do not mistake an already-running favicon GET for this title GET.
      // Two starts are enough to establish ambiguity; never retain more IDs.
      if (started.size < 2 && matches(details)) started.add(details.requestId);
    };
    const listener = details => {
      if (!started.has(details.requestId) || !matches(details)) return;
      const locations = (details.responseHeaders || []).filter(h => h.name.toLowerCase() === "location");
      observed.set(details.requestId, {
        status: details.statusCode,
        location: locations.length === 1 ? locations[0].value : ""
      });
    };
    let listening = false;
    let response;
    try {
      if (headersEvent?.addListener && headersEvent?.removeListener && beforeEvent?.addListener && beforeEvent?.removeListener && extensionRoot) {
        try {
          const url = new URL(current);
          const filter = { urls: [`${url.protocol}//${url.hostname}/*`], types: ["xmlhttprequest"] };
          beforeEvent.addListener(beforeListener, filter);
          listening = true;
          headersEvent.addListener(listener, filter, ["responseHeaders"]);
        } catch { /* Direct responses still work without redirect observation. */ }
      }
      response = await fetchImpl(current, {
        credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer",
        redirect: "manual", signal
      });
    } finally {
      if (listening) {
        beforeEvent.removeListener(beforeListener);
        headersEvent.removeListener(listener);
      }
    }
    if (signal?.aborted) {
      try { await response.body?.cancel(); } catch {}
      return { reason: "cancelled" };
    }
    const isRedirect = response.type === "opaqueredirect" || [301, 302, 303, 307, 308].includes(response.status);
    if (!isRedirect) return { response, finalPageUrl: response.url || current };
    try { await response.body?.cancel(); } catch {}
    if (hop === maxRedirects) return { reason: "redirect-limit" };
    if (started.size > 1) return { reason: "redirect-ambiguous" };
    if (observed.size !== 1) return { reason: "redirect-unavailable" };
    const observedRedirect = observed.values().next().value;
    if (![301, 302, 303, 307, 308].includes(observedRedirect.status) || !observedRedirect.location) return { reason: "redirect-unavailable" };
    const next = approvedTitleRedirect(current, observedRedirect.location);
    if (!next) return { reason: "redirect-blocked" };
    current = next;
  }
  return { reason: "redirect-limit" };
}
