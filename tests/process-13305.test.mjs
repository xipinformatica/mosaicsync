import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { testFilesForGroup } from "../tools/test-groups.mjs";

test("1.33.0.5 focused Startup and New Tab groups include canonical Step-3A coverage", () => {
  for (const group of ["startup", "newtab"]) {
    const files = testFilesForGroup(group).map(file => file.replaceAll("\\", "/"));
    assert.ok(files.includes("tests/optimization-13304.test.mjs"), `${group} must include optimization-13304.test.mjs`);
  }
});

test("1.33.0.5 critical-path raw-text masking ignores HTML-looking script/style contents", async () => {
  const helper = "tools/critical-path-html.mjs";
  assert.ok(fs.existsSync(helper), `${helper} must exist`);
  const { maskRawTextElementContents } = await import(pathToFileURL(helper).href);
  const source = [
    '<main id="real">',
    '<script>const fake = "<dialog id=\\"fakeDialog\\"><span id=\\"fakeSpan\\"></span></dialog>";</script>',
    '<style>.x::after { content: "<section id=\\"fakeSection\\"></section>"; }</style>',
    '<dialog id="realDialog"><span id="realSpan"></span></dialog>',
    '</main>'
  ].join("\n");
  const masked = maskRawTextElementContents(source);
  assert.match(masked, /id="realDialog"/);
  assert.match(masked, /id="realSpan"/);
  assert.doesNotMatch(masked, /fakeDialog|fakeSpan|fakeSection/);
  assert.equal(masked.length, source.length, "masking must preserve source length for stable offsets");
});

test("1.33.0.5 critical-path census applies raw-text masking before structural parsing", () => {
  const census = fs.readFileSync("tools/critical-path-census.mjs", "utf8");
  assert.match(census, /maskRawTextElementContents/);
  assert.match(census, /parseHtmlStructure\(maskRawTextElementContents\(htmlSource\)\)/);
});
