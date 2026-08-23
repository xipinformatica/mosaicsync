/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/*
 * Registrable-domain helper for device-local Frequently Visited hiding.
 *
 * The Mozilla/Public Suffix List is bundled with MosaicSync and loaded lazily
 * only when the user explicitly chooses Hide. Routine New Tab rendering does
 * not parse or retain the PSL. The resulting registrable domain is then stored
 * locally, so later filtering is a cheap hostname suffix comparison.
 */
import "./http-url-safety.js";

let rulesPromise = null;

function normalizeHostname(value) {
  const raw = String(value || "").trim().toLowerCase().replace(/^\.+|\.+$/g, "");
  if (!raw) return "";
  try { return new URL(`http://${raw}/`).hostname.toLowerCase().replace(/^\.+|\.+$/g, ""); }
  catch { return ""; }
}

function isIpOrSingleLabel(hostname) {
  if (!hostname || !hostname.includes(".")) return true;
  if (/^\[[0-9a-f:.]+\]$/i.test(hostname)) return true;
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname)) return true;
  return false;
}

function normalizeRuleDomain(rule) {
  const normalized = normalizeHostname(rule);
  return normalized || "";
}

async function loadRules() {
  if (rulesPromise) return rulesPromise;
  rulesPromise = (async () => {
    const response = await fetch(new URL("./public_suffix_list.dat", import.meta.url));
    if (!response.ok) throw new Error("Could not load public suffix rules.");
    const source = await response.text();
    const exact = new Set();
    const wildcard = new Set();
    const exception = new Set();
    for (const rawLine of source.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("//")) continue;
      if (line.startsWith("!")) {
        const value = normalizeRuleDomain(line.slice(1));
        if (value) exception.add(value);
        continue;
      }
      if (line.startsWith("*.")) {
        const value = normalizeRuleDomain(line.slice(2));
        if (value) wildcard.add(value);
        continue;
      }
      const value = normalizeRuleDomain(line);
      if (value) exact.add(value);
    }
    return { exact, wildcard, exception };
  })();
  try { return await rulesPromise; }
  catch (error) {
    rulesPromise = null;
    throw error;
  }
}

export async function registrableDomainFromHostname(value) {
  const hostname = normalizeHostname(value);
  if (!hostname || isIpOrSingleLabel(hostname)) return hostname;
  const labels = hostname.split(".").filter(Boolean);
  if (labels.length < 2) return hostname;

  const { exact, wildcard, exception } = await loadRules();
  let publicSuffixLabels = 1; // PSL default rule: *
  let exceptionMatched = false;

  for (let index = 0; index < labels.length; index += 1) {
    const candidate = labels.slice(index).join(".");
    if (exception.has(candidate)) {
      publicSuffixLabels = Math.max(1, labels.length - index - 1);
      exceptionMatched = true;
      break;
    }
    if (exact.has(candidate)) {
      publicSuffixLabels = Math.max(publicSuffixLabels, labels.length - index);
    }
    if (index < labels.length - 1) {
      const wildcardSuffix = labels.slice(index + 1).join(".");
      if (wildcard.has(wildcardSuffix)) {
        publicSuffixLabels = Math.max(publicSuffixLabels, labels.length - index);
      }
    }
  }

  // Exception rules override all other matches by definition.
  if (exceptionMatched && labels.length <= publicSuffixLabels) return hostname;
  if (labels.length <= publicSuffixLabels) return hostname;
  return labels.slice(-(publicSuffixLabels + 1)).join(".");
}

export async function registrableDomainFromUrl(value) {
  const safeUrl = globalThis.__mosaicsyncSafeShortcutNavigationUrl?.(value) || "";
  if (!safeUrl) return "";
  try {
    return registrableDomainFromHostname(new URL(safeUrl).hostname);
  } catch {
    return "";
  }
}

export function hostnameMatchesRegistrableDomain(hostnameValue, domainValue) {
  const hostname = normalizeHostname(hostnameValue);
  const domain = normalizeHostname(domainValue);
  return Boolean(hostname && domain && (hostname === domain || hostname.endsWith(`.${domain}`)));
}

export function resetPublicSuffixRulesForTests() { rulesPromise = null; }
