import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

async function walk(root, dir=root, out=[]) {
  for (const name of await readdir(dir)) {
    const p=join(dir,name), s=await stat(p);
    if (s.isDirectory()) await walk(root,p,out); else out.push(relative(root,p).replaceAll("\\\\","/"));
  }
  return out;
}

const persistedLiterals = [
  "mosaicsync.frequently-visited.v1",
  "mosaicsync.frequently-visited-hidden-domains.v1",
  "mosaicsync.ui-locale.v1",
  "mosaicsync.session.local-ignore",
  "mosaicsync.session.sync-expectations",
  "mosaicsync.session.pending-shortcut-navigation",
  "mosaicsync.session.icon-hydration-failures.v1",
  "mosaicsync.icon-recovery-queue.v2",
  "mosaicsync.icon-recovery-status.v2",
  "mosaicsync.maintenance-migrations.v1",
  "mosaicsync.local-assets.write.v1"
];

test("persistent runtime keys are defined once in constants.js", async () => {
  const root=resolve("src");
  const files=(await walk(root)).filter(f=>f.endsWith(".js"));
  for (const literal of persistedLiterals) {
    const locations=[];
    for (const rel of files) {
      const text=await readFile(join(root,rel),"utf8");
      if (text.includes(`"${literal}"`) || text.includes(`'${literal}'`)) locations.push(rel);
    }
    assert.deepEqual(locations,["shared/core/constants.js"], `${literal} must not be duplicated outside constants.js`);
  }
});
