import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
globalThis.crypto ||= webcrypto;

const model = await import("../dist/firefox/core/model.js");
const constants = await import("../dist/firefox/core/constants.js");

function live({ id = "x", modifiedAt = 1, spaceMoveAt = 0, deviceId = "a", title = "X" } = {}) {
  return { schemaVersion: 2, kind: "shortcut", id, title, url: `https://${id}.example/`, position: 0, createdAt: 1, modifiedAt, spaceMoveAt, deviceId };
}
function deleted({ id = "x", deletedAt = 1, deviceId = "a" } = {}) {
  return { schemaVersion: 2, kind: "deleted", id, deletedAt, modifiedAt: deletedAt, deviceId };
}
function same(a,b){ return model.stableStringify(a) === model.stableStringify(b); }

test("1.24.14m live-record move generation makes three-device merge associative", () => {
  const staleEdit = live({ modifiedAt: 30, spaceMoveAt: 0, deviceId: "stale", title: "stale edit" });
  const movedBack = live({ modifiedAt: 25, spaceMoveAt: 25, deviceId: "moved", title: "moved back" });
  const tombstone = deleted({ deletedAt: 15, deviceId: "delete" });
  const left = model.chooseNewerRecord(model.chooseNewerRecord(staleEdit, movedBack), tombstone);
  const right = model.chooseNewerRecord(staleEdit, model.chooseNewerRecord(movedBack, tombstone));
  const third = model.chooseNewerRecord(model.chooseNewerRecord(tombstone, staleEdit), movedBack);
  assert.equal(left.kind, "shortcut");
  assert.equal(left.spaceMoveAt, 25);
  assert.ok(same(left, right));
  assert.ok(same(left, third));
});

test("1.24.14m chooseNewerRecord is commutative, associative and idempotent over randomized three-device records", () => {
  let seed = 0x14_14_0d;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  const devices = ["", "a", "b", "c"];
  function randomRecord() {
    if (rnd() < 0.28) return deleted({ deletedAt: Math.floor(rnd()*80), deviceId: devices[Math.floor(rnd()*devices.length)] });
    return live({
      modifiedAt: Math.floor(rnd()*80),
      spaceMoveAt: rnd() < 0.45 ? Math.floor(rnd()*80) : 0,
      deviceId: devices[Math.floor(rnd()*devices.length)],
      title: `t${Math.floor(rnd()*4)}`
    });
  }
  for (let i=0;i<25000;i++) {
    const a=randomRecord(), b=randomRecord(), c=randomRecord();
    assert.ok(same(model.chooseNewerRecord(a,b), model.chooseNewerRecord(b,a)), `commutativity ${i}`);
    assert.ok(same(model.chooseNewerRecord(model.chooseNewerRecord(a,b),c), model.chooseNewerRecord(a,model.chooseNewerRecord(b,c))), `associativity ${i}`);
    assert.ok(same(model.chooseNewerRecord(a,a), a), `idempotence ${i}`);
  }
});

test("1.24.14m ordinary edits within the same move generation still use modifiedAt", () => {
  const earlier = live({ modifiedAt: 50, spaceMoveAt: 20, deviceId: "a", title: "early" });
  const later = live({ modifiedAt: 60, spaceMoveAt: 20, deviceId: "b", title: "later" });
  assert.equal(model.chooseNewerRecord(earlier, later).title, "later");
  const stale = live({ modifiedAt: 999, spaceMoveAt: 0, deviceId: "z", title: "stale" });
  assert.equal(model.chooseNewerRecord(stale, earlier).title, "early", "newer namespace generation must outrank stale edit clock");
});

test("1.24.14m mutation clocks advance beyond observed future clocks", () => {
  const future = 4_102_444_800_000;
  assert.ok(model.nextMutationTime(future) > future);
  assert.ok(model.nextMutationTime([1, future, 4]) > future);
});

class Area {
  constructor(){ this.data={}; this.failNextSet=false; }
  async get(keys){
    if(keys==null) return structuredClone(this.data);
    if(typeof keys === "string") return Object.hasOwn(this.data,keys)?{[keys]:structuredClone(this.data[keys])}:{};
    const out={}; for(const key of Array.isArray(keys)?keys:Object.keys(keys||{})) if(Object.hasOwn(this.data,key)) out[key]=structuredClone(this.data[key]); return out;
  }
  async set(items){ if(this.failNextSet){this.failNextSet=false; throw new Error("fail");} Object.assign(this.data,structuredClone(items)); }
  async remove(keys){ for(const k of Array.isArray(keys)?keys:[keys]) delete this.data[k]; }
}

test("1.24.14m local Sync journal is atomic and cumulatively preserves the oldest unsent before-state", async () => {
  globalThis.browser={storage:{local:new Area(),session:new Area()}};
  const storage = await import(`../dist/firefox/core/storage.js?journal=${Date.now()}`);
  const base=model.normalizeState({shortcuts:[{type:"shortcut",id:"a",title:"A",url:"https://a.example/",position:0,createdAt:1,modifiedAt:1}],settings:{...constants.DEFAULT_SETTINGS},settingsModifiedAt:1,updatedAt:1});
  await storage.writeLocalState(base);
  const first=structuredClone(base); first.shortcuts[0].title="A1"; first.shortcuts[0].modifiedAt=10; first.updatedAt=10; first.spaces.personal.shortcuts=first.shortcuts; first.spaces.personal.updatedAt=10;
  await storage.writeLocalState(first,{baseState:storage.createWriteBaseline(base),recordSyncMutation:true});
  const j1=structuredClone(browser.storage.local.data[constants.LOCAL_PENDING_SYNC_MUTATION_KEY]);
  assert.equal(model.normalizeState(j1.before).shortcuts[0].title,"A");
  assert.equal(model.normalizeState(j1.after).shortcuts[0].title,"A1");
  const second=structuredClone(first); second.shortcuts[0].title="A2"; second.shortcuts[0].modifiedAt=11; second.updatedAt=11; second.spaces.personal.shortcuts=second.shortcuts; second.spaces.personal.updatedAt=11;
  await storage.writeLocalState(second,{baseState:storage.createWriteBaseline(first),recordSyncMutation:true});
  const j2=browser.storage.local.data[constants.LOCAL_PENDING_SYNC_MUTATION_KEY];
  assert.equal(model.normalizeState(j2.before).shortcuts[0].title,"A", "oldest unsent before-state must survive a second local edit");
  assert.equal(model.normalizeState(j2.after).shortcuts[0].title,"A2");
  assert.notEqual(j2.journalId,j1.journalId,"newer journal identity prevents an older successful retry from clearing newer work");
});

test("1.24.14m cross-Space transactions do not create a competing generic outbound journal", async () => {
  globalThis.browser={storage:{local:new Area(),session:new Area()}};
  const storage = await import(`../dist/firefox/core/storage.js?cross=${Date.now()}`);
  const base=model.normalizeState({shortcuts:[{type:"shortcut",id:"a",title:"A",url:"https://a.example/",position:0,createdAt:1,modifiedAt:1}],settings:{...constants.DEFAULT_SETTINGS},settingsModifiedAt:1,updatedAt:1});
  await storage.writeLocalState(base);
  const moved=model.moveShortcutBetweenSpaces(base,{shortcutId:"a",fromSpaceId:"personal",toSpaceId:"work"});
  const intent=model.createCrossSpaceSyncIntent(base,moved,{fromSpaceId:"personal",toSpaceId:"work",shortcutIds:["a"],deviceId:"dev"});
  await storage.writeLocalState(moved,{baseState:storage.createWriteBaseline(base),recordSyncMutation:true,crossSpaceSyncIntent:intent});
  assert.equal(browser.storage.local.data[constants.LOCAL_PENDING_SYNC_MUTATION_KEY],undefined);
  assert.ok(Object.keys(browser.storage.local.data).some(k=>k.startsWith(constants.LOCAL_PENDING_CROSS_SPACE_SYNC_PREFIX)));
});

for (const browser of ["firefox","chrome"]) {
  test(`${browser}: 1.24.14m production snapshot decoder is wired to the decompression ceiling`, () => {
    const src=fs.readFileSync(`dist/${browser}/background/background.js`,"utf8");
    const start=src.indexOf("async function decodeDeviceSnapshotData");
    assert.ok(start>=0);
    const block=src.slice(start,src.indexOf("\n}\n",start)+3);
    assert.match(block,/readBoundedStreamBytes\(stream,\s*DEVICE_SNAPSHOT_MAX_DECOMPRESSED_BYTES\)/);
  });
}

function extractFunction(src, name) {
  const start = src.indexOf(`async function ${name}`) >= 0 ? src.indexOf(`async function ${name}`) : src.indexOf(`function ${name}`);
  if (start < 0) throw new Error(`missing ${name}`);
  const brace = src.indexOf("{", start);
  let depth=0, quote="", esc=false, line=false, block=false;
  for(let i=brace;i<src.length;i++){
    const c=src[i],n=src[i+1];
    if(line){if(c==="\n")line=false;continue;} if(block){if(c==="*"&&n==="/"){block=false;i++;}continue;}
    if(quote){if(esc){esc=false;continue;} if(c==="\\"){esc=true;continue;} if(c===quote)quote="";continue;}
    if(c==="/"&&n==="/"){line=true;i++;continue;} if(c==="/"&&n==="*"){block=true;i++;continue;}
    if(c==='"'||c==="'"||c==='`'){quote=c;continue;} if(c==="{")depth++; else if(c==="}"&&--depth===0)return src.slice(start,i+1);
  }
  throw new Error(`unterminated ${name}`);
}

for (const browser of ["firefox","chrome"]) {
  test(`${browser}: 1.24.14m failed outbound publication retains its durable local mutation for retry`, async () => {
    const src=fs.readFileSync(`dist/${browser}/background/background.js`,"utf8");
    const pending={journalId:"j1",before:{a:1},after:{a:2}};
    let fail=true, clears=0, pushes=0;
    const context={
      readPendingLocalSyncMutation:async()=>pending,
      pushLocalMutation:async()=>{pushes++; if(fail) throw new Error("quota");},
      clearPendingLocalSyncMutation:async id=>{assert.equal(id,"j1");clears++;},
      readLocalMeta:async()=>({syncEnabled:true,syncInitialized:true})
    };
    vm.createContext(context); vm.runInContext(extractFunction(src,"retryPendingLocalSyncMutation"),context);
    await assert.rejects(()=>context.retryPendingLocalSyncMutation({syncEnabled:true,syncInitialized:true}),/quota/);
    assert.equal(clears,0,"failed publish must leave durable work intact");
    fail=false;
    await context.retryPendingLocalSyncMutation({syncEnabled:true,syncInitialized:true});
    assert.equal(pushes,2); assert.equal(clears,1);
  });

  test(`${browser}: 1.24.14m Sync watch retries dirty local work before remote-revision short-circuit`, () => {
    const src=fs.readFileSync(`dist/${browser}/background/background.js`,"utf8");
    const block=extractFunction(src,"reconcileIfNewCommit");
    const retry=block.indexOf("retryPendingLocalSyncMutation");
    const remote=block.indexOf("browser.storage.sync.get(null)");
    assert.ok(retry>=0 && remote>retry);
  });

  test(`${browser}: 1.24.14m legacy pre-Spaces backup is retired only by post-migration maintenance`, () => {
    const src=fs.readFileSync(`dist/${browser}/background/background.js`,"utf8");
    const block=extractFunction(src,"runOneTimeLegacyMaintenance");
    assert.match(block,/LOCAL_PRE_SPACES_BACKUP_KEY/);
    assert.match(block,/LOCAL_MAINTENANCE_MIGRATIONS_KEY\]: 2/);
    assert.ok(block.indexOf("remove(LOCAL_PRE_SPACES_BACKUP_KEY)") < block.indexOf("LOCAL_MAINTENANCE_MIGRATIONS_KEY]: 2"));
  });
}
