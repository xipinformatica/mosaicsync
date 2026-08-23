/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Compute a viewport-safe tooltip position without depending on DOM globals.
 * Exported separately so clipping/edge behavior can be regression-tested.
 */
export function computeViewportTooltipPosition({
  anchorRect,
  tooltipWidth,
  tooltipHeight,
  viewportWidth,
  viewportHeight,
  gap = 8,
  margin = 12
}) {
  const leftEdge = finite(anchorRect?.left);
  const topEdge = finite(anchorRect?.top);
  const anchorWidth = Math.max(0, finite(anchorRect?.width));
  const anchorHeight = Math.max(0, finite(anchorRect?.height));
  const rightEdge = Number.isFinite(Number(anchorRect?.right))
    ? Number(anchorRect.right)
    : leftEdge + anchorWidth;
  const bottomEdge = Number.isFinite(Number(anchorRect?.bottom))
    ? Number(anchorRect.bottom)
    : topEdge + anchorHeight;
  const viewWidth = Math.max(0, finite(viewportWidth));
  const viewHeight = Math.max(0, finite(viewportHeight));
  const safeMargin = Math.max(0, finite(margin, 12));
  const safeGap = Math.max(0, finite(gap, 8));
  const width = Math.min(Math.max(0, finite(tooltipWidth)), Math.max(0, viewWidth - (safeMargin * 2)));
  const height = Math.min(Math.max(0, finite(tooltipHeight)), Math.max(0, viewHeight - (safeMargin * 2)));

  const centeredLeft = ((leftEdge + rightEdge) / 2) - (width / 2);
  const left = clamp(centeredLeft, safeMargin, Math.max(safeMargin, viewWidth - safeMargin - width));
  const above = topEdge - safeGap - height;
  const below = bottomEdge + safeGap;
  let top = above;
  let placement = "above";
  if (above < safeMargin && below + height <= viewHeight - safeMargin) {
    top = below;
    placement = "below";
  } else {
    top = clamp(top, safeMargin, Math.max(safeMargin, viewHeight - safeMargin - height));
  }

  return { left, top, placement };
}

/**
 * Portal anchored help tooltips to document.body while visible. This keeps
 * them outside clipped/scrolling dialog containers, while preserving the
 * original localized DOM node and restoring it when the tooltip closes.
 */
export function installViewportTooltips(root = globalThis.document, {
  wrapperSelector = ".sync-help-wrap, .help-wrap",
  tooltipSelector = '[role="tooltip"]',
  anchorSelector = "button",
  activeClass = "viewport-tooltip-active",
  gap = 8,
  margin = 12
} = {}) {
  const doc = root?.nodeType === 9 ? root : root?.ownerDocument;
  const base = root?.nodeType === 9 ? root : root;
  const win = doc?.defaultView || globalThis.window;
  if (!doc?.body || !base?.querySelectorAll || !win) return () => {};

  const cleanups = [];
  for (const wrapper of base.querySelectorAll(wrapperSelector)) {
    const tooltip = wrapper.querySelector(tooltipSelector);
    if (!tooltip || tooltip.dataset.viewportTooltipInstalled === "true") continue;
    const anchor = wrapper.querySelector(anchorSelector) || wrapper;
    const originalParent = tooltip.parentNode;
    const originalNextSibling = tooltip.nextSibling;
    let active = false;
    let frame = 0;
    let hideResetFrame = 0;

    tooltip.dataset.viewportTooltipInstalled = "true";

    const clearInlinePosition = () => {
      tooltip.style.removeProperty("left");
      tooltip.style.removeProperty("top");
      tooltip.style.removeProperty("right");
      tooltip.style.removeProperty("bottom");
    };

    const clearInlineVisibility = () => {
      tooltip.style.removeProperty("opacity");
      tooltip.style.removeProperty("visibility");
      tooltip.style.removeProperty("transition");
    };

    const position = () => {
      frame = 0;
      if (!active || !tooltip.isConnected || !anchor.isConnected) return;
      const anchorRect = anchor.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();
      const viewportWidth = doc.documentElement?.clientWidth || win.innerWidth || 0;
      const viewportHeight = doc.documentElement?.clientHeight || win.innerHeight || 0;
      const next = computeViewportTooltipPosition({
        anchorRect,
        tooltipWidth: tooltipRect.width,
        tooltipHeight: tooltipRect.height,
        viewportWidth,
        viewportHeight,
        gap,
        margin
      });
      tooltip.style.left = `${Math.round(next.left)}px`;
      tooltip.style.top = `${Math.round(next.top)}px`;
      tooltip.dataset.tooltipPlacement = next.placement;
    };

    const queuePosition = () => {
      if (!active || frame) return;
      frame = win.requestAnimationFrame(position);
    };

    const show = () => {
      if (hideResetFrame) {
        win.cancelAnimationFrame(hideResetFrame);
        hideResetFrame = 0;
      }
      clearInlineVisibility();
      if (active) {
        queuePosition();
        return;
      }
      active = true;
      doc.body.append(tooltip);
      tooltip.classList.add(activeClass);
      tooltip.setAttribute("aria-hidden", "false");
      clearInlinePosition();
      position();
    };

    const hide = () => {
      if (!active) return;
      active = false;
      if (frame) {
        win.cancelAnimationFrame(frame);
        frame = 0;
      }
      // Make the portaled node non-renderable before changing its positioning
      // class or returning it to the wrapper. Firefox can otherwise paint one
      // frame of the old in-panel tooltip while the base 100 ms transition
      // takes over; Chromium generally coalesces those changes into one paint.
      tooltip.style.transition = "none";
      tooltip.style.opacity = "0";
      tooltip.style.visibility = "hidden";
      tooltip.classList.remove(activeClass);
      tooltip.removeAttribute("data-tooltip-placement");
      tooltip.setAttribute("aria-hidden", "true");
      clearInlinePosition();
      if (originalParent?.isConnected) {
        if (originalNextSibling?.parentNode === originalParent) originalParent.insertBefore(tooltip, originalNextSibling);
        else originalParent.append(tooltip);
        hideResetFrame = win.requestAnimationFrame(() => {
          hideResetFrame = 0;
          if (!active) clearInlineVisibility();
        });
      } else {
        // The host UI may be torn down while the tooltip is portaled to body.
        // Do not leave an invisible orphan in the long-lived New Tab document.
        tooltip.remove();
      }
    };

    const onFocusOut = () => {
      win.requestAnimationFrame(() => {
        if (!wrapper.contains(doc.activeElement)) hide();
      });
    };

    wrapper.addEventListener("pointerenter", show);
    wrapper.addEventListener("pointerleave", hide);
    wrapper.addEventListener("focusin", show);
    wrapper.addEventListener("focusout", onFocusOut);
    win.addEventListener("resize", queuePosition, { passive: true });
    doc.addEventListener("scroll", queuePosition, true);

    cleanups.push(() => {
      hide();
      if (hideResetFrame) {
        win.cancelAnimationFrame(hideResetFrame);
        hideResetFrame = 0;
      }
      clearInlineVisibility();
      wrapper.removeEventListener("pointerenter", show);
      wrapper.removeEventListener("pointerleave", hide);
      wrapper.removeEventListener("focusin", show);
      wrapper.removeEventListener("focusout", onFocusOut);
      win.removeEventListener("resize", queuePosition);
      doc.removeEventListener("scroll", queuePosition, true);
      delete tooltip.dataset.viewportTooltipInstalled;
    });
  }

  return () => cleanups.forEach(cleanup => cleanup());
}
