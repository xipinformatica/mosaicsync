import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { visibleTextBottom } from "../src/shared/newtab/ui-utils.js";

function labelRect() {
  return { top: 100, bottom: 134, left: 0, right: 100, width: 100, height: 34 };
}

function label() {
  return { getBoundingClientRect: labelRect };
}

function docWithRects(rects, { throwOnRange = false } = {}) {
  return {
    createRange() {
      if (throwOnRange) throw new Error("range unavailable");
      return {
        selectNodeContents() {},
        getClientRects() { return rects; },
        detach() {}
      };
    }
  };
}

test("1.27.1 folder anchor follows one rendered text line instead of reserved label height", () => {
  const bottom = visibleTextBottom(label(), docWithRects([
    { top: 100, bottom: 116.2, width: 70, height: 16.2 }
  ]));
  assert.equal(bottom, 116.2);
});

test("1.27.1 folder anchor follows the second line for a genuine two-line title", () => {
  const bottom = visibleTextBottom(label(), docWithRects([
    { top: 100, bottom: 116.2, width: 92, height: 16.2 },
    { top: 116.2, bottom: 132.4, width: 54, height: 16.2 }
  ]));
  assert.equal(bottom, 132.4);
});

test("1.27.1 folder anchor ignores a third text line clipped beyond the two-line label viewport", () => {
  const bottom = visibleTextBottom(label(), docWithRects([
    { top: 100, bottom: 116.2, width: 92, height: 16.2 },
    { top: 116.2, bottom: 132.4, width: 88, height: 16.2 },
    { top: 132.4, bottom: 148.6, width: 60, height: 16.2 }
  ]));
  assert.equal(bottom, 132.4);
});

test("1.27.1 folder anchor fails safely to the label box if Range geometry is unavailable", () => {
  assert.equal(visibleTextBottom(label(), {}), 134);
  assert.equal(visibleTextBottom(label(), docWithRects([], { throwOnRange: true })), 134);
});

for (const browser of ["firefox", "chrome"]) {
  test(`1.27.1 ${browser} positions folders from rendered title text with a 3px gap`, () => {
    const js = fs.readFileSync(`src/shared/newtab/newtab.js`, "utf8");
    assert.match(js, /const gap = 3;/);
    assert.match(js, /visibleTextBottom\(labelEl\)/);
    assert.doesNotMatch(js, /labelRect\?\.bottom/);
  });
}
