/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/*
 * Tiny bundled shortcut-glyph library shared by the classic first-paint path
 * and the authoritative ES-module UI. No remote assets, fonts, or user-provided
 * SVG markup are used: every shape below is a fixed MosaicSync-owned primitive.
 */
(() => {
  "use strict";
  const GLOBAL_KEY = "__mosaicsyncBuiltinIcons";
  if (globalThis[GLOBAL_KEY]?.append && globalThis[GLOBAL_KEY]?.isValid) return;

  const NS = "http://www.w3.org/2000/svg";
  const SPECS = Object.freeze({
    home: Object.freeze([["path", { d: "M3.5 10.5 12 3.5l8.5 7v9a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1z" }]]),
    mail: Object.freeze([["rect", { x: "3.5", y: "5.5", width: "17", height: "13", rx: "2" }], ["path", { d: "m4.5 7 7.5 6 7.5-6" }]]),
    work: Object.freeze([["rect", { x: "3.5", y: "7", width: "17", height: "12.5", rx: "2" }], ["path", { d: "M8 7V5.5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2V7M3.5 11.5h17M10 11.5v2h4v-2" }]]),
    star: Object.freeze([["path", { d: "m12 3.2 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" }]]),
    heart: Object.freeze([["path", { d: "M20.5 8.7c0 5-8.5 10.3-8.5 10.3S3.5 13.7 3.5 8.7A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 8.5 1.1z" }]]),
    shopping: Object.freeze([["path", { d: "M4 5h2l1.7 9h9.8l2-6.5H7" }], ["circle", { cx: "9.5", cy: "18.5", r: "1.2" }], ["circle", { cx: "16.5", cy: "18.5", r: "1.2" }]]),
    finance: Object.freeze([["path", { d: "M3.5 9 12 4l8.5 5M5 9.5h14M6.5 9.5v7M10 9.5v7M14 9.5v7M17.5 9.5v7M4.5 17h15M3.5 20h17" }]]),
    video: Object.freeze([["rect", { x: "3.5", y: "5", width: "17", height: "14", rx: "2.5" }], ["path", { d: "m10 9 5 3-5 3z" }]]),
    music: Object.freeze([["path", { d: "M10 17V6l8-2v11M10 8l8-2" }], ["circle", { cx: "7.5", cy: "17.5", r: "2.5" }], ["circle", { cx: "15.5", cy: "15.5", r: "2.5" }]]),
    news: Object.freeze([["rect", { x: "4", y: "4.5", width: "16", height: "15", rx: "2" }], ["path", { d: "M7 8h4v4H7zM13.5 8H17M13.5 11H17M7 15h10" }]]),
    code: Object.freeze([["path", { d: "m9 7-5 5 5 5M15 7l5 5-5 5M13.5 5.5l-3 13" }]]),
    cloud: Object.freeze([["path", { d: "M7.5 18.5h10a3.5 3.5 0 0 0 .7-6.9A6 6 0 0 0 6.7 9.8 4.4 4.4 0 0 0 7.5 18.5z" }]]),
    game: Object.freeze([["path", { d: "M7.3 8.5h9.4a4 4 0 0 1 3.8 5.2l-1.2 3.8a2.3 2.3 0 0 1-3.6 1.1L13.8 17h-3.6l-1.9 1.6a2.3 2.3 0 0 1-3.6-1.1l-1.2-3.8a4 4 0 0 1 3.8-5.2zM7 11v4M5 13h4" }], ["circle", { cx: "16", cy: "12", r: ".8" }], ["circle", { cx: "18", cy: "14", r: ".8" }]])
  });
  const KEYS = Object.freeze(Object.keys(SPECS));

  function isValid(key) {
    return typeof key === "string" && Object.prototype.hasOwnProperty.call(SPECS, key);
  }

  function append(target, key, className = "builtin-shortcut-icon") {
    if (!target || !isValid(key) || !globalThis.document?.createElementNS) return false;
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.classList.add(className);
    for (const [tag, attributes] of SPECS[key]) {
      const node = document.createElementNS(NS, tag);
      for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
      svg.append(node);
    }
    target.append(svg);
    return true;
  }

  const api = Object.freeze({ keys: KEYS, isValid, append });
  try {
    Object.defineProperty(globalThis, GLOBAL_KEY, {
      value: api,
      configurable: false,
      writable: false,
      enumerable: false
    });
  } catch {
    // If another packaged script somehow defined a non-configurable value first,
    // fail closed: callers will fall back to the normal initial-letter artwork.
  }
})();
