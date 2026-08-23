import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");

async function walk(base, dir=base, out=[]) {
  for (const name of (await readdir(dir)).sort()) {
    const path=join(dir,name), info=await stat(path);
    if (info.isDirectory()) await walk(base,path,out);
    else out.push(relative(base,path).replaceAll("\\", "/"));
  }
  return out;
}

async function fileHashes(dir) {
  const hashes={};
  for (const rel of await walk(dir)) {
    const bytes=await readFile(join(dir,rel));
    hashes[rel]=createHash("sha256").update(bytes).digest("hex");
  }
  return hashes;
}

await rm(dist, { recursive: true, force: true });
for (const browser of ["firefox", "chrome"]) {
  const target = resolve(dist, browser);
  await mkdir(target, { recursive: true });
  await cp(resolve(root, "src/shared"), target, { recursive: true });
  await cp(resolve(root, `src/${browser}`), target, { recursive: true, force: true });
}

const manifests={};
for (const browser of ["firefox","chrome"]) {
  const target=resolve(dist,browser);
  const manifest=JSON.parse(await readFile(join(target,"manifest.json"),"utf8"));
  manifests[browser]={version:manifest.version, files:await fileHashes(target)};
}
await writeFile(resolve(root,"build-manifest.json"), `${JSON.stringify({schemaVersion:1,generatedFrom:"shared source + browser overlays",browsers:manifests},null,2)}\n`);
console.log("Built dist/firefox and dist/chrome from shared source + browser overlays; wrote SHA-256 build-manifest.json.");
