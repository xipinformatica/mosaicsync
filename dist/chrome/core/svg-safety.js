/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/*
 * Pure SVG admission check for remote favicon rasterization.
 *
 * MosaicSync never injects remote SVG markup into the DOM. It only lets the
 * browser decoder rasterize a tightly restricted, self-contained subset. Any
 * construct that can execute script, embed another document, resolve an
 * external resource, or define XML entities is rejected before decoding.
 */
const ACTIVE_OR_EMBED_TAG_RE = /<(?:[a-z0-9_-]+:)?(?:script|foreignObject|iframe|object|embed|image|feImage)\b/i;
const EVENT_HANDLER_RE = /(?:^|[\s<])(?:[a-z0-9_-]+:)?on[a-z0-9_-]+\s*=/i;
const SCRIPT_SCHEME_RE = /(?:javascript|vbscript)\s*:/i;
const XML_EXTERNAL_RE = /<!\s*(?:doctype|entity)\b|<\?xml-stylesheet\b/i;
const CSS_IMPORT_RE = /@import\b/i;
const HREF_RE = /\b(?:href|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const CSS_URL_RE = /url\s*\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)'"]+))\s*\)/gi;

function isFragmentReference(value) {
  return typeof value === "string" && /^#[A-Za-z0-9_.:-]+$/.test(value.trim());
}

function referencesAreLocalFragments(source, regex) {
  regex.lastIndex = 0;
  let match;
  while ((match = regex.exec(source))) {
    const value = match[1] ?? match[2] ?? match[3] ?? "";
    if (!isFragmentReference(value)) return false;
  }
  return true;
}

export function isSafeSelfContainedSvgText(source) {
  if (typeof source !== "string" || !source || source.includes("\0")) return false;
  if (!/<(?:[a-z0-9_-]+:)?svg\b/i.test(source)) return false;
  if (ACTIVE_OR_EMBED_TAG_RE.test(source)) return false;
  if (EVENT_HANDLER_RE.test(source)) return false;
  if (SCRIPT_SCHEME_RE.test(source)) return false;
  if (XML_EXTERNAL_RE.test(source)) return false;
  if (CSS_IMPORT_RE.test(source)) return false;
  if (!referencesAreLocalFragments(source, HREF_RE)) return false;
  if (!referencesAreLocalFragments(source, CSS_URL_RE)) return false;
  return true;
}
