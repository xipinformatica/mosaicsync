import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
globalThis.crypto ||= webcrypto;

const constants = await import("../dist/firefox/core/constants.js");
const model = await import("../dist/firefox/core/model.js");
const profile = await import("../dist/firefox/core/profile.js");

function recordIds(workspace) {
  const ids = [];
  for (const item of workspace.shortcuts) {
    ids.push(item.id);
    if (item.type === "folder") ids.push(...item.items.map(child => child.id));
  }
  return ids;
}

async function recomputeIntegrity(pkg) {
  const { integrity, ...body } = pkg;
  const bytes = new TextEncoder().encode(model.stableStringify(body));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  pkg.integrity = {
    algorithm: "SHA-256",
    value: [...digest].map(byte => byte.toString(16).padStart(2, "0")).join("")
  };
  return pkg;
}

function shortcut(id, title, url, position) {
  return {
    type: "shortcut", id, title, url, image: "", imageSyncKind: "none", imageSourceKind: "none",
    imageStyle: "contain", position, createdAt: 100 + position, modifiedAt: 100 + position, source: "manual"
  };
}

test("1.24.14k normalization repairs duplicate record ids inside one workspace before Sync flattening", () => {
  const raw = {
    activeSpaceId: "personal",
    spaces: {
      personal: {
        shortcuts: [
          shortcut("dup", "A", "https://a.example/", 0),
          shortcut("dup", "B", "https://b.example/", 1),
          {
            type: "folder", id: "dup", title: "Folder", position: 2, createdAt: 120, modifiedAt: 120,
            items: [
              shortcut("dup", "C", "https://c.example/", 0),
              shortcut("child", "D", "https://d.example/", 1)
            ]
          },
          {
            type: "folder", id: "folder-two", title: "Folder 2", position: 3, createdAt: 130, modifiedAt: 130,
            items: [
              shortcut("child", "E", "https://e.example/", 0),
              shortcut("child-two", "F", "https://f.example/", 1)
            ]
          }
        ],
        settings: { ...constants.DEFAULT_SETTINGS }, settingsModifiedAt: 200, updatedAt: 200
      },
      work: { shortcuts: [], settings: { ...constants.DEFAULT_SETTINGS }, settingsModifiedAt: 0, updatedAt: 0 }
    }
  };

  const normalized = model.normalizeState(raw);
  const ids = recordIds(normalized.spaces.personal);
  assert.equal(new Set(ids).size, ids.length, "every folder and shortcut record id in a workspace must be unique");
  assert.equal(model.flattenStateNormalized(model.workspaceStateNormalized(normalized, "personal")).size, ids.length,
    "Sync flattening must preserve every normalized record instead of Map-collapsing duplicate ids");
  assert.equal(normalized.spaces.personal.shortcuts.length, 4, "repair must preserve every top-level item");
});

test("1.24.14k hostile profile import repairs the same record id appearing in both Spaces", async () => {
  const state = model.normalizeState({
    activeSpaceId: "personal",
    spaces: {
      personal: { shortcuts: [shortcut("personal-id", "Personal", "https://personal.example/", 0)], settings: { ...constants.DEFAULT_SETTINGS }, settingsModifiedAt: 10, updatedAt: 10 },
      work: { shortcuts: [shortcut("work-id", "Work", "https://work.example/", 0)], settings: { ...constants.DEFAULT_SETTINGS }, settingsModifiedAt: 10, updatedAt: 10 }
    }
  });
  const pkg = await profile.createProfilePackage(state, { uiLocale: "en" });
  pkg.profile.state.spaces.work.shortcuts[0].id = "personal-id";
  await recomputeIntegrity(pkg);

  const parsed = await profile.parseProfilePackage(profile.serializeProfilePackage(pkg));
  const allIds = [
    ...recordIds(parsed.state.spaces.personal),
    ...recordIds(parsed.state.spaces.work)
  ];
  assert.equal(new Set(allIds).size, allIds.length, "import must not leave an ambiguous cross-Space duplicate id");
  assert.equal(parsed.state.spaces.personal.shortcuts.length, 1);
  assert.equal(parsed.state.spaces.work.shortcuts.length, 1);
  assert.equal(parsed.state.spaces.personal.shortcuts[0].id, "personal-id", "first valid occurrence is preserved");
  assert.notEqual(parsed.state.spaces.work.shortcuts[0].id, "personal-id", "later corrupt duplicate receives a fresh id");
});
