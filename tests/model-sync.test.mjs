import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS } from "../dist/firefox/core/constants.js";
import { chooseNewerRecord, createCrossSpaceSyncIntent, flattenState, makeSettingsRecordNormalized, makeTombstone, moveShortcutBetweenSpaces, normalizeState, stableStringify } from "../dist/firefox/core/model.js";

function baseState(){
  const t=1_700_000_000_000;
  return normalizeState({schemaVersion:16,activeSpaceId:"personal",spaces:{
    personal:{shortcuts:[{type:"shortcut",id:"s",title:"Site",url:"https://example.test/",image:"",imageSyncKind:"none",imageSourceKind:"none",imageStyle:"contain",position:0,createdAt:t,modifiedAt:t,source:"manual"}],settings:{...DEFAULT_SETTINGS,spaceName:"Personal",multipleSpacesEnabled:true},settingsModifiedAt:t,updatedAt:t},
    work:{shortcuts:[],settings:{...DEFAULT_SETTINGS,spaceName:"Work",multipleSpacesEnabled:true},settingsModifiedAt:t,updatedAt:t}
  }});
}

test("deletion tombstone beats an ordinary later stale edit",()=>{
  const deleted=makeTombstone("s","device-a",200);
  const stale={schemaVersion:8,kind:"shortcut",id:"s",title:"Edited offline",url:"https://example.test/",position:0,createdAt:1,modifiedAt:300,deviceId:"device-b"};
  assert.equal(chooseNewerRecord(deleted,stale).kind,"deleted");
  const moved={...stale,spaceMoveAt:400};
  assert.equal(chooseNewerRecord(deleted,moved).kind,"shortcut");
});

test("cross-Space move is atomic in the model and emits a two-Space intent",()=>{
  const before=baseState();
  const after=moveShortcutBetweenSpaces(before,{shortcutId:"s",fromSpaceId:"personal",toSpaceId:"work",position:0});
  assert.equal(after.spaces.personal.shortcuts.length,0);
  assert.equal(after.spaces.work.shortcuts[0].id,"s");
  assert.ok(after.spaces.work.shortcuts[0].spaceMoveAt>0);
  const intent=createCrossSpaceSyncIntent(before,after,{fromSpaceId:"personal",toSpaceId:"work",shortcutIds:["s"],deviceId:"dev",timestamp:10});
  assert.equal(intent.fromSpaceId,"personal"); assert.equal(intent.toSpaceId,"work");
  assert.ok(intent.destination.upserts.some(r=>r.id==="s"));
  assert.ok(intent.source.deletes.includes("s"));
});


test("cross-Space destination-first journal interruptions never lose the shortcut and replay idempotently", () => {
  const before = baseState();
  const after = moveShortcutBetweenSpaces(before, { shortcutId: "s", fromSpaceId: "personal", toSpaceId: "work", position: 0 });
  const intent = createCrossSpaceSyncIntent(before, after, {
    fromSpaceId: "personal", toSpaceId: "work", shortcutIds: ["s"], deviceId: "dev", timestamp: 20
  });

  const personal = new Map(flattenState(before, "dev"));
  const work = new Map();
  const movedRecord = intent.destination.upserts.find(record => record.id === "s");
  assert.ok(movedRecord?.spaceMoveAt > 0);

  // Interruption before any network phase: one live copy remains at the source.
  assert.equal(personal.get("s")?.kind, "shortcut");
  assert.equal(work.has("s"), false);

  // Interruption after destination publish: temporary duplication is allowed, disappearance is not.
  work.set("s", chooseNewerRecord(work.get("s"), movedRecord));
  assert.equal(personal.get("s")?.kind, "shortcut");
  assert.equal(work.get("s")?.kind, "shortcut");

  // Source phase completes the move. Replaying either phase must be idempotent.
  const sourceDelete = makeTombstone("s", "dev", intent.createdAt);
  personal.set("s", chooseNewerRecord(personal.get("s"), sourceDelete));
  assert.equal(personal.get("s")?.kind, "deleted");
  assert.equal(work.get("s")?.kind, "shortcut");

  const settled = stableStringify({ personal: [...personal], work: [...work] });
  work.set("s", chooseNewerRecord(work.get("s"), movedRecord));
  personal.set("s", chooseNewerRecord(personal.get("s"), sourceDelete));
  assert.equal(stableStringify({ personal: [...personal], work: [...work] }), settled);
});


test("equal-clock Sync settings records use deviceId deterministically, including missing deviceId", () => {
  const base = baseState();
  const lightState = structuredClone(base);
  lightState.spaces.personal.settings.theme = "light";
  lightState.spaces.personal.settingsModifiedAt = 900;
  lightState.spaces.personal.updatedAt = 900;
  lightState.settings = lightState.spaces.personal.settings;
  lightState.settingsModifiedAt = 900;
  lightState.updatedAt = 900;

  const darkState = structuredClone(base);
  darkState.spaces.personal.settings.theme = "dark";
  darkState.spaces.personal.settingsModifiedAt = 900;
  darkState.spaces.personal.updatedAt = 900;
  darkState.settings = darkState.spaces.personal.settings;
  darkState.settingsModifiedAt = 900;
  darkState.updatedAt = 900;

  const lightA = makeSettingsRecordNormalized(normalizeState(lightState), "device-a");
  const darkZ = makeSettingsRecordNormalized(normalizeState(darkState), "device-z");
  assert.equal(chooseNewerRecord(lightA, darkZ), darkZ, "higher deviceId wins an equal-clock Sync settings tie");
  assert.equal(chooseNewerRecord(darkZ, lightA), darkZ, "arrival order must not change that winner");

  const darkMissing = { ...darkZ, deviceId: "" };
  assert.equal(chooseNewerRecord(lightA, darkMissing), lightA, "a present higher deviceId deterministically beats a missing one");
  assert.equal(chooseNewerRecord(darkMissing, lightA), lightA);
});
