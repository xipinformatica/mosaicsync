import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

function read(rel) {
  return fs.readFileSync(rel, "utf8");
}

function section(src, startText, endText) {
  const start = src.indexOf(startText);
  assert.ok(start >= 0, `missing section start: ${startText}`);
  const end = src.indexOf(endText, start + startText.length);
  return src.slice(start, end >= 0 ? end : undefined);
}

test("1.32.0.8 Welcome stages all local starting-source candidates instead of making them authoritative immediately", () => {
  const src = read("src/shared/welcome/welcome.js");
  assert.match(src, /let pendingSourceCandidate = null;/);
  assert.match(src, /function stageStartingSourceCandidate\(/);
  assert.match(src, /async function commitPendingSourceCandidate\(/);

  const firefoxImport = section(src, "async function importThisFirefox()", "async function startEmpty()");
  const empty = section(src, "async function startEmpty()", "function stampImportedProfileState");
  const profile = section(src, "async function importMosaicSyncProfile(file)", "async function completeOnboarding");

  for (const [name, body] of [["Firefox import", firefoxImport], ["empty", empty], ["profile import", profile]]) {
    assert.match(body, /stageStartingSourceCandidate\(/, `${name} must stage a candidate`);
    assert.doesNotMatch(body, /await writeLocalState\(/, `${name} must not write authoritative local state before source resolution`);
  }
});

test("1.32.0.8 Welcome commits a staged candidate only when local authority is actually selected", () => {
  const src = read("src/shared/welcome/welcome.js");
  const continuation = section(src, "async function continueAfterStartingSource", 'sourceFinishButton.addEventListener("click"');
  const conflictCheck = continuation.indexOf("if (syncStatus.hasRemoteSignal)");
  const noSignalCommit = continuation.indexOf("await commitPendingSourceCandidate(source)", conflictCheck);
  assert.ok(conflictCheck >= 0, "remote-signal conflict branch must exist");
  assert.ok(noSignalCommit > conflictCheck, "candidate must not commit until after the remote-signal conflict branch has declined to show a conflict");
  assert.match(continuation, /if \(!syncOptedIn\)[\s\S]*?await commitPendingSourceCandidate\(source\)[\s\S]*?completeOnboarding/);

  const localChoice = section(src, 'chooseLocalButton.addEventListener("click"', 'chooseCloudButton.addEventListener("click"');
  assert.match(localChoice, /await commitPendingSourceCandidate\(pendingSourceCandidate\?\.source\)/);
  assert.ok(localChoice.indexOf("commitPendingSourceCandidate") < localChoice.indexOf('sendSyncMessage("mosaicsync:bootstrap-local")'), "local candidate must become authoritative before local bootstrap publishes it");

  const cloudChoice = section(src, 'chooseCloudButton.addEventListener("click"', 'welcomeFrequentPermissionButton?.addEventListener');
  assert.doesNotMatch(cloudChoice, /commitPendingSourceCandidate/);
  assert.match(cloudChoice, /discardPendingSourceCandidate\(\)/, "choosing synchronized authority must discard the provisional local candidate after the remote choice succeeds");
});

test("1.32.0.8 Welcome keeps profile-import device preferences provisional with the profile candidate", () => {
  const src = read("src/shared/welcome/welcome.js");
  const profile = section(src, "async function importMosaicSyncProfile(file)", "async function completeOnboarding");
  assert.doesNotMatch(profile, /await setLocalePreference\(/);
  assert.doesNotMatch(profile, /localStorage\.setItem\(/);

  const commit = section(src, "async function commitPendingSourceCandidate", "function discardPendingSourceCandidate");
  assert.match(commit, /await writeLocalState\(candidate\.state\)/);
  assert.match(commit, /await setLocalePreference\(/);
  assert.match(commit, /FREQUENTLY_VISITED_PREF_KEY/);
});
