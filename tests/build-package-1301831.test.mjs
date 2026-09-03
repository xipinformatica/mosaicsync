import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

function runPython(script, args = [], cwd = root) {
  const result = spawnSync("python", ["-c", script, ...args], {
    cwd,
    encoding: "utf8",
    timeout: 30_000
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

test("1.30.18.31 release contract derives its version from the canonical source VERSION", () => {
  const temp = fs.mkdtempSync(join(os.tmpdir(), "mosaicsync-release-version-"));
  try {
    fs.mkdirSync(join(temp, "tools"), { recursive: true });
    fs.mkdirSync(join(temp, "src/shared/core"), { recursive: true });
    fs.copyFileSync(join(root, "tools/release_contract.py"), join(temp, "tools/release_contract.py"));
    fs.writeFileSync(
      join(temp, "src/shared/core/constants.js"),
      'export const VERSION = "9.8.7.6";\n',
      "utf8"
    );
    const output = runPython(
      "import importlib.util, sys; p=sys.argv[1]; spec=importlib.util.spec_from_file_location('contract',p); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m); print(m.VERSION)",
      [join(temp, "tools/release_contract.py")],
      temp
    );
    assert.equal(output, "9.8.7.6");
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("1.30.18.31 all ZIP modes share one deterministic metadata/order writer", () => {
  const temp = fs.mkdtempSync(join(os.tmpdir(), "mosaicsync-zip-policy-"));
  try {
    const script = String.raw`
import importlib.util, json, sys
from pathlib import Path
from zipfile import ZipFile
spec=importlib.util.spec_from_file_location('pkg', sys.argv[1])
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
out=Path(sys.argv[2])
a=m.write_deterministic_zip(out/'a.zip', [('b\\two.txt', b'B'), ('a.txt', b'A')])
b=m.write_deterministic_zip(out/'b.zip', [('a.txt', b'A'), ('b/two.txt', b'B')])
with ZipFile(a, 'r') as z:
    info=[(i.filename, i.date_time, i.external_attr) for i in z.infolist()]
print(json.dumps({'same': a.read_bytes()==b.read_bytes(), 'info': info}))
`;
    const output = JSON.parse(runPython(script, [join(root, "tools/package.py"), temp]));
    assert.equal(output.same, true, "entry order/path separators must not change package bytes");
    assert.deepEqual(output.info.map(item => item[0]), ["a.txt", "b/two.txt"]);
    for (const [, dateTime, externalAttr] of output.info) {
      assert.deepEqual(dateTime, [2026, 1, 1, 0, 0, 0]);
      assert.equal(externalAttr, 0o100644 * 2 ** 16);
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("1.30.18.31 release packaging rebuilds before reading dist and drops stale generated files", () => {
  const temp = fs.mkdtempSync(join(os.tmpdir(), "mosaicsync-package-rebuild-"));
  try {
    for (const rel of ["src", "tools"]) fs.cpSync(join(root, rel), join(temp, rel), { recursive: true });
    for (const rel of ["README.md", "README-DEVELOPMENT.md", "CHANGELOG.md"]) {
      fs.copyFileSync(join(root, rel), join(temp, rel));
    }
    fs.mkdirSync(join(temp, "dist/firefox"), { recursive: true });
    fs.mkdirSync(join(temp, "dist/chrome"), { recursive: true });
    fs.writeFileSync(join(temp, "dist/firefox/STALE-PREPACKAGE.txt"), "must disappear\n");
    fs.writeFileSync(join(temp, "dist/chrome/STALE-PREPACKAGE.txt"), "must disappear\n");

    const result = spawnSync("python", ["tools/package.py"], {
      cwd: temp,
      encoding: "utf8",
      timeout: 30_000
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Built dist\/firefox and dist\/chrome/,
      "package.py must run the canonical build before packaging");

    const version = "1.30.18.36";
    for (const browser of ["firefox", "chrome"]) {
      const zip = join(temp, `artifacts/mosaicsync-${version}-${browser}.zip`);
      assert.equal(fs.existsSync(zip), true);
      const listing = runPython(
        "from zipfile import ZipFile; import sys; print('\\n'.join(ZipFile(sys.argv[1]).namelist()))",
        [zip],
        temp
      );
      assert.doesNotMatch(listing, /STALE-PREPACKAGE\.txt/);
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
