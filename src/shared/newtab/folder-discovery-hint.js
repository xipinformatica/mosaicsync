/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

const DEFAULT_DELAY_MS = 1500;
const TOTAL_VISIBLE_MS = 6100;
const MAX_ADJACENT_GAP_WIDTHS = 1.6;

let hintStylesPromise = null;

function ensureHintStyles(documentRef) {
  if (!documentRef?.head?.append) return Promise.resolve(true);
  const existing = documentRef.querySelector?.('link[data-mosaicsync-folder-discovery-style="true"]');
  if (existing) return Promise.resolve(true);
  if (hintStylesPromise) return hintStylesPromise;
  hintStylesPromise = new Promise(resolve => {
    const link = documentRef.createElement("link");
    link.rel = "stylesheet";
    link.href = new URL("./folder-discovery-hint.css", import.meta.url).href;
    link.dataset.mosaicsyncFolderDiscoveryStyle = "true";
    link.addEventListener?.("load", () => resolve(true), { once: true });
    link.addEventListener?.("error", () => resolve(false), { once: true });
    documentRef.head.append(link);
    if (!link.addEventListener) resolve(true);
  });
  return hintStylesPromise;
}

export function folderDiscoveryEligible(snapshot) {
  return Boolean(
    snapshot &&
    Number(snapshot.activeShortcutCount) >= 6 &&
    snapshot.anyFolder !== true &&
    snapshot.orderMode !== "recent" &&
    snapshot.visible === true &&
    snapshot.idle === true &&
    snapshot.renderReady === true &&
    snapshot.awaitingRemote !== true
  );
}

function fullyVisible(rect, viewport) {
  return Boolean(
    rect && rect.width > 0 && rect.height > 0 &&
    rect.left >= 0 && rect.top >= 0 &&
    rect.right <= viewport.width && rect.bottom <= viewport.height
  );
}

export function chooseFolderDiscoveryPair(items, viewport) {
  if (!Array.isArray(items) || items.length < 2 || !viewport) return null;
  const visible = items.filter(item => fullyVisible(item?.rect, viewport));
  if (visible.length < 2) return null;

  const sorted = visible.slice().sort((a, b) =>
    a.rect.top - b.rect.top || a.rect.left - b.rect.left || String(a.id || "").localeCompare(String(b.id || ""))
  );
  const rowTolerance = Math.max(3, Math.min(...sorted.map(item => item.rect.height || 0)) * 0.25);
  const rows = [];
  for (const item of sorted) {
    const row = rows.find(candidate => Math.abs(candidate.top - item.rect.top) <= rowTolerance);
    if (row) row.items.push(item);
    else rows.push({ top: item.rect.top, items: [item] });
  }

  const viewportCenter = viewport.width / 2;
  for (const row of rows) {
    if (row.items.length < 2) continue;
    row.items.sort((a, b) => a.rect.left - b.rect.left);
    const adjacent = [];
    for (let index = 0; index < row.items.length - 1; index += 1) {
      const left = row.items[index];
      const right = row.items[index + 1];
      const gap = right.rect.left - left.rect.right;
      const referenceWidth = Math.max(1, Math.min(left.rect.width || 0, right.rect.width || 0));
      if (gap > referenceWidth * MAX_ADJACENT_GAP_WIDTHS) continue;
      const center = (left.rect.left + left.rect.width / 2 + right.rect.left + right.rect.width / 2) / 2;
      adjacent.push({ pair: [left, right], distance: Math.abs(center - viewportCenter), left: left.rect.left });
    }
    adjacent.sort((a, b) => a.distance - b.distance || a.left - b.left);
    if (adjacent[0]) return adjacent[0].pair;
  }
  return null;
}

export function folderDiscoveryReducedMotion(matchMediaFn) {
  try {
    return typeof matchMediaFn === "function" && matchMediaFn("(prefers-reduced-motion: reduce)")?.matches === true;
  } catch {
    return false;
  }
}

function candidateItems(grid) {
  const slots = Array.from(grid?.querySelectorAll?.('.shortcut-slot[data-interactive="true"]:not(.folder-slot)') || []);
  return slots.map(slot => {
    const tile = slot.querySelector?.(".tile");
    const rect = tile?.getBoundingClientRect?.();
    return tile && rect ? { id: slot.dataset?.id || "", slot, tile, labelText: slot.querySelector?.(".shortcut-label")?.textContent || "", rect } : null;
  }).filter(Boolean);
}

function setBox(element, rect) {
  element.style.left = `${rect.left}px`;
  element.style.top = `${rect.top}px`;
  element.style.width = `${rect.width}px`;
  element.style.height = `${rect.height}px`;
}

function createArrow(documentRef, fromRect, toRect) {
  const arrow = documentRef.createElement("div");
  arrow.className = "folder-discovery-arrow";
  const left = fromRect.right + 8;
  const right = toRect.left - 8;
  arrow.style.left = `${Math.min(left, right)}px`;
  arrow.style.top = `${fromRect.top + fromRect.height / 2 - 1}px`;
  arrow.style.width = `${Math.max(18, Math.abs(right - left))}px`;
  return arrow;
}

function positionCallout(callout, pair, viewport) {
  const [left, right] = pair;
  const center = (left.rect.left + right.rect.right) / 2;
  const estimatedWidth = Math.min(360, Math.max(240, viewport.width - 24));
  const desiredLeft = center - estimatedWidth / 2;
  callout.style.width = `${estimatedWidth}px`;
  callout.style.left = `${Math.max(12, Math.min(viewport.width - estimatedWidth - 12, desiredLeft))}px`;
  const below = Math.max(left.rect.bottom, right.rect.bottom) + 18;
  const top = below + 90 <= viewport.height ? below : Math.max(12, Math.min(left.rect.top, right.rect.top) - 84);
  callout.style.top = `${top}px`;
}

function sanitizedTileClone(tile) {
  const clone = tile.cloneNode(true);
  clone.removeAttribute?.("id");
  clone.removeAttribute?.("data-id");
  clone.querySelectorAll?.("[id], [data-id]")?.forEach?.(node => {
    node.removeAttribute("id");
    node.removeAttribute("data-id");
  });
  return clone;
}

function createChoiceRow(documentRef, { icon, title, detail, folder = false }) {
  const row = documentRef.createElement("div");
  row.className = `folder-discovery-choice-row${folder ? " folder-discovery-choice-folder" : ""}`;
  const iconEl = documentRef.createElement("span");
  iconEl.className = "folder-discovery-choice-icon";
  iconEl.textContent = icon;
  const copy = documentRef.createElement("span");
  const strong = documentRef.createElement("strong");
  strong.textContent = title;
  const small = documentRef.createElement("small");
  small.textContent = detail;
  copy.append(strong, small);
  row.append(iconEl, copy);
  return row;
}

function createFakeDropChoice(documentRef, targetRect, viewport, translate) {
  const choice = documentRef.createElement("div");
  choice.className = "folder-discovery-choice";
  const moveRow = createChoiceRow(documentRef, {
    icon: "↔",
    title: translate?.("moveHere") || "Move here",
    detail: translate?.("switchPositions") || "Switch their positions"
  });
  const folderRow = createChoiceRow(documentRef, {
    icon: "▦",
    title: translate?.("createFolder") || "Create folder",
    detail: translate?.("putTogether") || "Put both shortcuts together",
    folder: true
  });
  choice.append(moveRow, folderRow);
  const width = 250;
  const left = Math.max(12, Math.min(viewport.width - width - 12, targetRect.left + targetRect.width / 2 - width / 2));
  let top = targetRect.bottom + 8;
  if (top + 130 > viewport.height) top = Math.max(12, targetRect.top - 130);
  choice.style.left = `${left}px`;
  choice.style.top = `${top}px`;
  return { choice, folderRow };
}

function createMiniVisual(documentRef, tile) {
  const cell = documentRef.createElement("span");
  cell.className = "folder-discovery-mini-visual";
  cell.append(sanitizedTileClone(tile));
  return cell;
}

function createFakeFolder(documentRef, source, target) {
  const folder = documentRef.createElement("div");
  folder.className = "folder-discovery-fake-folder";
  setBox(folder, target.rect);
  const tile = documentRef.createElement("span");
  tile.className = "folder-discovery-fake-folder-tile";
  const mosaic = documentRef.createElement("span");
  mosaic.className = "folder-discovery-fake-folder-mosaic";
  mosaic.append(createMiniVisual(documentRef, target.tile), createMiniVisual(documentRef, source.tile));
  tile.append(mosaic);
  folder.append(tile);
  return folder;
}

function createFakeFolderPanel(documentRef, source, target, viewport, translate) {
  const panel = documentRef.createElement("div");
  panel.className = "folder-discovery-fake-folder-panel";
  const title = documentRef.createElement("strong");
  title.className = "folder-discovery-fake-folder-title";
  title.textContent = translate?.("folder") || "Folder";
  const items = documentRef.createElement("div");
  items.className = "folder-discovery-fake-folder-items";
  for (const item of [target, source]) {
    const entry = documentRef.createElement("div");
    entry.className = "folder-discovery-fake-folder-item";
    entry.append(createMiniVisual(documentRef, item.tile));
    const label = documentRef.createElement("span");
    label.textContent = item.labelText || "";
    entry.append(label);
    items.append(entry);
  }
  panel.append(title, items);
  const width = Math.min(300, Math.max(220, viewport.width - 24));
  panel.style.width = `${width}px`;
  const left = Math.max(12, Math.min(viewport.width - width - 12, target.rect.left + target.rect.width / 2 - width / 2));
  let top = target.rect.bottom + 12;
  if (top + 170 > viewport.height) top = Math.max(12, target.rect.top - 182);
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
  return panel;
}

export function createFolderDiscoveryHint({
  grid,
  snapshot,
  ensureStyles,
  translate,
  flagKey,
  storage = globalThis.localStorage,
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  delayMs = DEFAULT_DELAY_MS
} = {}) {
  let armedTimer = 0;
  let layer = null;
  let mutationObserver = null;
  let done = false;
  let mounted = false;
  let mountPending = false;
  let attemptGeneration = 0;
  let pointerArmed = false;
  const animations = new Set();
  const cleanupListeners = [];
  const cleanupTimers = new Set();
  const armListeners = [];

  const readSeen = () => {
    try { return storage?.getItem?.(flagKey) === "1"; } catch { return false; }
  };
  const writeSeen = () => {
    try { storage?.setItem?.(flagKey, "1"); } catch {}
  };

  function clearArmListeners() {
    for (const [target, type, fn, options] of armListeners.splice(0)) removeListener(target, type, fn, options);
  }

  function clearArmedTimer() {
    if (armedTimer) {
      windowRef.clearTimeout(armedTimer);
      armedTimer = 0;
    }
    clearArmListeners();
  }

  function removeListener(target, type, fn, options) {
    target?.removeEventListener?.(type, fn, options);
  }

  function teardownVisuals() {
    for (const animation of animations) {
      try { animation.cancel(); } catch {}
    }
    animations.clear();
    mutationObserver?.disconnect?.();
    mutationObserver = null;
    for (const [target, type, fn, options] of cleanupListeners.splice(0)) removeListener(target, type, fn, options);
    for (const timer of cleanupTimers) windowRef.clearTimeout(timer);
    cleanupTimers.clear();
    layer?.remove?.();
    layer = null;
    mounted = false;
  }

  function cancel({ permanent = false } = {}) {
    attemptGeneration += 1;
    mountPending = false;
    clearArmedTimer();
    teardownVisuals();
    if (permanent) {
      done = true;
      removeListener(grid, "pointermove", onFirstPointerMove);
      pointerArmed = false;
    }
  }

  function suppressIfKnownFolder(current) {
    if (current?.anyFolder === true) {
      writeSeen();
      cancel({ permanent: true });
      return true;
    }
    return false;
  }

  function scheduleCleanup(ms = TOTAL_VISIBLE_MS) {
    const timer = windowRef.setTimeout(() => {
      cleanupTimers.delete(timer);
      cancel({ permanent: true });
    }, ms);
    cleanupTimers.add(timer);
  }

  function listen(target, type, fn, options) {
    target?.addEventListener?.(type, fn, options);
    cleanupListeners.push([target, type, fn, options]);
  }

  function animate(element, keyframes, options) {
    if (typeof element?.animate !== "function") return null;
    // WAAPI timing-level easing warps the entire iteration, including the
    // keyframe offsets that define this tutorial's staged wall-clock schedule.
    // Keep iteration progress linear and apply the requested curve per segment.
    const curve = options?.easing;
    const segmented = curve && curve !== "linear"
      ? keyframes.map(frame => ({ easing: curve, ...frame }))
      : keyframes;
    const animation = element.animate(segmented, { ...options, easing: "linear" });
    if (animation) animations.add(animation);
    return animation;
  }

  function retryableAfterTemporaryFailure(current) {
    return Boolean(
      !done && !readSeen() && current && current.anyFolder !== true &&
      Number(current.activeShortcutCount) >= 6 && current.orderMode !== "recent"
    );
  }

  function finishMountAttempt(attempt, current, { rearm = false } = {}) {
    if (attempt !== attemptGeneration) return false;
    mountPending = false;
    clearArmListeners();
    if (rearm && retryableAfterTemporaryFailure(current)) installPointerArmer();
    return false;
  }

  async function mountIfEligible() {
    armedTimer = 0;
    if (done || readSeen()) {
      cancel({ permanent: true });
      return false;
    }
    const attempt = ++attemptGeneration;
    mountPending = true;
    const current = snapshot?.();
    if (suppressIfKnownFolder(current)) return false;
    if (!folderDiscoveryEligible(current)) {
      return finishMountAttempt(attempt, current, { rearm: retryableAfterTemporaryFailure(current) });
    }

    const viewport = { width: Number(windowRef.innerWidth) || 0, height: Number(windowRef.innerHeight) || 0 };
    const pair = chooseFolderDiscoveryPair(candidateItems(grid), viewport);
    if (!pair) return finishMountAttempt(attempt, current, { rearm: true });

    const stylesReady = await (typeof ensureStyles === "function" ? ensureStyles() : ensureHintStyles(documentRef));
    if (attempt !== attemptGeneration || done) return false;
    if (readSeen()) {
      cancel({ permanent: true });
      return false;
    }
    if (stylesReady === false) return finishMountAttempt(attempt, snapshot?.() || current, { rearm: true });
    const afterStyles = snapshot?.();
    if (suppressIfKnownFolder(afterStyles)) return false;
    if (!folderDiscoveryEligible(afterStyles)) {
      return finishMountAttempt(attempt, afterStyles, { rearm: retryableAfterTemporaryFailure(afterStyles) });
    }
    const freshViewport = { width: Number(windowRef.innerWidth) || 0, height: Number(windowRef.innerHeight) || 0 };
    const freshPair = chooseFolderDiscoveryPair(candidateItems(grid), freshViewport);
    if (!freshPair) return finishMountAttempt(attempt, afterStyles, { rearm: true });
    if (attempt !== attemptGeneration || done || readSeen()) return false;

    mountPending = false;
    clearArmListeners();
    const [source, target] = freshPair;
    const sourceRect = source.rect;
    const targetRect = target.rect;
    const layerEl = documentRef.createElement("div");
    layerEl.className = "folder-discovery-layer";
    layerEl.style.pointerEvents = "none";
    layerEl.setAttribute("aria-hidden", "true");
    try { layerEl.inert = true; } catch {}

    const ghost = documentRef.createElement("div");
    ghost.className = "folder-discovery-ghost";
    setBox(ghost, sourceRect);
    ghost.append(sanitizedTileClone(source.tile));

    const ring = documentRef.createElement("div");
    ring.className = "folder-discovery-target-ring";
    setBox(ring, targetRect);

    const callout = documentRef.createElement("div");
    callout.className = "folder-discovery-callout";
    const title = documentRef.createElement("strong");
    title.textContent = translate?.("folderDiscoveryTitle") || "Organize with folders";
    const body = documentRef.createElement("span");
    body.textContent = translate?.("folderDiscoveryBody", { action: translate?.("createFolder") || "Create folder" }) ||
      'Drop one shortcut onto another, then choose "Create folder".';
    callout.append(title, body);
    positionCallout(callout, freshPair, freshViewport);

    const reducedMotion = folderDiscoveryReducedMotion(windowRef.matchMedia?.bind(windowRef));
    let choice = null;
    let choiceFolderRow = null;
    let fakeFolder = null;
    let fakeFolderPanel = null;
    if (reducedMotion) {
      layerEl.append(createArrow(documentRef, sourceRect, targetRect));
    } else {
      const fakeChoice = createFakeDropChoice(documentRef, targetRect, freshViewport, translate);
      choice = fakeChoice.choice;
      choiceFolderRow = fakeChoice.folderRow;
      fakeFolder = createFakeFolder(documentRef, source, target);
      fakeFolderPanel = createFakeFolderPanel(documentRef, source, target, freshViewport, translate);
    }
    layerEl.append(ghost, ring, callout);
    if (!reducedMotion) layerEl.append(choice, fakeFolder, fakeFolderPanel);
    documentRef.body.append(layerEl);
    if (!reducedMotion) {
      const calloutHeight = callout.getBoundingClientRect?.().height || 0;
      const aboveTop = Math.min(sourceRect.top, targetRect.top) - calloutHeight - 14;
      if (calloutHeight && aboveTop >= 12) callout.style.top = `${aboveTop}px`;
    }
    layer = layerEl;
    mounted = true;
    writeSeen();
    removeListener(grid, "pointermove", onFirstPointerMove);
    pointerArmed = false;

    const abort = () => cancel({ permanent: true });
    for (const [targetEl, type, options] of [
      [documentRef, "pointerdown", true], [documentRef, "keydown", true], [documentRef, "wheel", true],
      [documentRef, "dragstart", true], [windowRef, "resize", false], [windowRef, "scroll", true],
      [documentRef, "visibilitychange", false], [windowRef, "pagehide", false]
    ]) listen(targetEl, type, abort, options);
    listen(windowRef, "storage", event => {
      if (event?.key === flagKey && event?.newValue === "1") cancel({ permanent: true });
    });

    const Observer = windowRef.MutationObserver || globalThis.MutationObserver;
    if (typeof Observer === "function") {
      mutationObserver = new Observer(() => cancel({ permanent: true }));
      mutationObserver.observe(grid, { childList: true });
    }

    if (reducedMotion) {
      ghost.style.opacity = "0";
      ring.style.opacity = "1";
      callout.style.opacity = "1";
    } else {
      const dx = targetRect.left - sourceRect.left;
      const dy = targetRect.top - sourceRect.top;
      animate(callout, [{ opacity: 0, transform: "translateY(4px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 180, fill: "forwards", easing: "ease-out" });
      animate(ghost, [
        { transform: "translate3d(0,0,0) scale(1)", opacity: .68, offset: 0 },
        { transform: "translate3d(0,-4px,0) scale(1.04)", opacity: .85, offset: .18 },
        { transform: `translate3d(${dx}px,${dy}px,0) scale(1.035)`, opacity: .82, offset: .72 },
        { transform: `translate3d(${dx}px,${dy}px,0) scale(1.035)`, opacity: .82, offset: .88 },
        { transform: `translate3d(${dx}px,${dy}px,0) scale(1.035)`, opacity: 0, offset: 1 }
      ], { duration: 1750, fill: "forwards", easing: "cubic-bezier(.2,.8,.2,1)" });
      animate(ring, [{ opacity: 0 }, { opacity: 0, offset: .5 }, { opacity: 1, offset: .62 }, { opacity: 1, offset: .9 }, { opacity: 0 }], { duration: 1900, fill: "forwards", easing: "ease-out" });
      animate(choice, [
        { opacity: 0, transform: "translateY(-5px) scale(.97)", offset: 0 },
        { opacity: 0, transform: "translateY(-5px) scale(.97)", offset: .22 },
        { opacity: 1, transform: "translateY(0) scale(1)", offset: .29 },
        { opacity: 1, transform: "translateY(0) scale(1)", offset: .48 },
        { opacity: 0, transform: "translateY(-2px) scale(.985)", offset: .54 },
        { opacity: 0, transform: "translateY(-2px) scale(.985)", offset: 1 }
      ], { duration: TOTAL_VISIBLE_MS, fill: "forwards", easing: "cubic-bezier(.2,.8,.2,1)" });
      animate(choiceFolderRow, [
        { transform: "scale(1)", opacity: .9, offset: 0 },
        { transform: "scale(1)", opacity: .9, offset: .34 },
        { transform: "scale(1.018)", opacity: 1, offset: .4 },
        { transform: "scale(.975)", opacity: 1, offset: .47 },
        { transform: "scale(1)", opacity: 1, offset: .5 },
        { transform: "scale(1)", opacity: .9, offset: 1 }
      ], { duration: TOTAL_VISIBLE_MS, fill: "forwards", easing: "ease-out" });
      animate(fakeFolder, [
        { opacity: 0, transform: "scale(.78)", offset: 0 },
        { opacity: 0, transform: "scale(.78)", offset: .49 },
        { opacity: 1, transform: "scale(1.09)", offset: .56 },
        { opacity: 1, transform: "scale(1)", offset: .62 },
        { opacity: 1, transform: "scale(1)", offset: .91 },
        { opacity: 0, transform: "scale(.98)", offset: 1 }
      ], { duration: TOTAL_VISIBLE_MS, fill: "forwards", easing: "cubic-bezier(.2,.9,.25,1.15)" });
      animate(fakeFolderPanel, [
        { opacity: 0, transform: "translateY(-6px) scale(.94)", offset: 0 },
        { opacity: 0, transform: "translateY(-6px) scale(.94)", offset: .57 },
        { opacity: 1, transform: "translateY(0) scale(1)", offset: .64 },
        { opacity: 1, transform: "translateY(0) scale(1)", offset: .91 },
        { opacity: 0, transform: "translateY(-2px) scale(.985)", offset: 1 }
      ], { duration: TOTAL_VISIBLE_MS, fill: "forwards", easing: "cubic-bezier(.17,.82,.27,1.08)" });
      animate(callout, [{ opacity: 1 }, { opacity: 1, offset: .94 }, { opacity: 0 }], { duration: TOTAL_VISIBLE_MS, fill: "forwards", easing: "ease-out" });
    }

    scheduleCleanup(TOTAL_VISIBLE_MS + 40);
    return true;
  }

  function installPointerArmer() {
    if (done || mounted || readSeen() || pointerArmed) return;
    pointerArmed = true;
    grid?.addEventListener?.("pointermove", onFirstPointerMove, { passive: true, once: true });
  }

  function cancelArmForInteraction() {
    if (!armedTimer && !mountPending) return;
    cancel();
    pointerArmed = false;
    installPointerArmer();
  }

  function arm({ immediate = false } = {}) {
    if (done || mounted || mountPending || readSeen()) return false;
    const current = snapshot?.();
    if (suppressIfKnownFolder(current)) return false;
    clearArmedTimer();
    for (const [target, type, options] of [
      [documentRef, "pointerdown", true], [documentRef, "keydown", true], [documentRef, "wheel", true],
      [windowRef, "scroll", true]
    ]) {
      target?.addEventListener?.(type, cancelArmForInteraction, options);
      armListeners.push([target, type, cancelArmForInteraction, options]);
    }
    armedTimer = windowRef.setTimeout(() => {
      armedTimer = 0;
      void mountIfEligible();
    }, immediate ? 0 : delayMs);
    return true;
  }

  function onFirstPointerMove() {
    if (done || readSeen()) return;
    pointerArmed = false;
    arm();
  }

  function rearmPointer() {
    if (done || mounted || readSeen()) return false;
    cancel();
    installPointerArmer();
    return pointerArmed;
  }

  if (!readSeen()) installPointerArmer();
  else done = true;

  return {
    arm,
    rearmPointer,
    cancel: () => cancel(),
    suppress: () => cancel({ permanent: true }),
    markKnownFolder() { writeSeen(); cancel({ permanent: true }); },
    get mounted() { return mounted; }
  };
}
