import { spawnSync } from "node:child_process";
import { listTestGroups, testFilesForGroup } from "./test-groups.mjs";

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const argument = process.argv[2] || "";
if (argument === "--list" || !argument) {
  for (const { name, description } of listTestGroups()) console.log(`${name.padEnd(9)} ${description}`);
  if (!argument) process.exit(0);
}

if (argument === "--list") process.exit(0);

let files;
try {
  files = testFilesForGroup(argument);
} catch (error) {
  console.error(error.message);
  console.error("Use `node tools/run-test-group.mjs --list` to see available groups.");
  process.exit(2);
}

if (!files.length) {
  console.error(`Test group ${argument} selected no tests.`);
  process.exit(2);
}

console.log(`Building MosaicSync before ${argument} tests...`);
run(process.execPath, ["tools/build.mjs"]);
console.log(`Running ${files.length} ${argument} test files...`);
run(process.execPath, ["--test", ...files]);
