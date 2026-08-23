/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/*
 * First-run setup controller. The wizard never publishes or restores a layout until
 * the user explicitly chooses the source for this Firefox profile.
 */
import "../core/platform.js";
import {
  DONATE_URL,
  FREQUENTLY_VISITED_PREF_KEY,
  SPACE_IDS,
  SUPPORT_URL,
  VERSION
} from "../core/constants.js";
import { fetchFirefoxShortcuts, prepareFirefoxShortcutFavicons, replaceWithFirefoxShortcuts } from "../core/importer.js";
import { nextMutationTime, normalizeMeta, normalizeState, now, stableStringify } from "../core/model.js";
import { ensureLocalStorage, writeLocalMeta, writeLocalState } from "../core/storage.js";
import { cleanupLegacyWebOriginPermissions, hasWebAccess, removeSyncConsent, requestSyncConsentFromGesture, requestTopSitesPermissionFromGesture, requestWebAccessFromGesture } from "../core/permissions.js";
import { getEffectiveLocale, localizeDocument, setLocalePreference, t, translateText } from "../core/i18n.js";
import { parseProfilePackage, readProfileImportText } from "../core/profile.js";
import { installViewportTooltips } from "../core/viewport-tooltip.js";

localizeDocument(document);
installViewportTooltips(document, { wrapperSelector: ".help-wrap", tooltipSelector: ".help-tooltip" });
document.title = t("welcomeTitle");

const introStep = document.getElementById("introStep");
const introContinueButton = document.getElementById("introContinueButton");
const syncStep = document.getElementById("syncStep");
const sourceStep = document.getElementById("sourceStep");
const syncContinueButton = document.getElementById("syncContinueButton");
const sourceFinishButton = document.getElementById("sourceFinishButton");
const welcomeProfileFile = document.getElementById("welcomeProfileFile");
const sourceIntro = document.getElementById("sourceIntro");
const cloudChoiceCard = document.getElementById("cloudChoiceCard");
const cloudChoiceInput = document.getElementById("cloudChoiceInput");
const cloudSnapshotHint = document.getElementById("cloudSnapshotHint");
const resolutionPanel = document.getElementById("resolutionPanel");
const resolutionTitle = document.getElementById("resolutionTitle");
const resolutionText = document.getElementById("resolutionText");
const chooseLocalButton = document.getElementById("chooseLocalButton");
const chooseCloudButton = document.getElementById("chooseCloudButton");
const syncHelp = document.getElementById("syncHelp");
const status = document.getElementById("status");
const welcomeDonateButton = document.getElementById("welcomeDonateButton");
const welcomeSupportLink = document.getElementById("welcomeSupportLink");
const choiceCards = [...document.querySelectorAll(".choice-card")];

let syncOptedIn = false;
let latestSyncStatus = null;
let finishing = false;
let webAccessGranted = false;
let webAccessPrompted = false;
let webAccessDecisionPromise = Promise.resolve(false);

function selected(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value || "";
}

function refreshChoiceCards() {
  choiceCards.forEach(card => card.classList.toggle("selected", Boolean(card.querySelector("input")?.checked)));
  syncContinueButton.disabled = !selected("syncChoice");
  sourceFinishButton.disabled = sourceStep.hidden || !selected("sourceChoice");
}
choiceCards.forEach(card => card.addEventListener("change", refreshChoiceCards));
welcomeDonateButton?.addEventListener("click", () => {
  void openDonationPage().catch(error => {
    console.warn("MosaicSync could not open the donation page.", error);
    setStatus(t("couldNotContinue"), "error");
  });
});
if (welcomeSupportLink) welcomeSupportLink.href = SUPPORT_URL;
refreshChoiceCards();

function setStatus(message = "", kind = "") {
  status.textContent = translateText(message);
  status.className = `status${kind ? ` ${kind}` : ""}`;
}

async function openDonationPage() {
  await browser.tabs.create({ url: DONATE_URL, active: true });
}

function formatTime(timestamp) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return t("unknownTime");
  try {
    return new Intl.DateTimeFormat(getEffectiveLocale(), {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(timestamp));
  } catch {
    return new Date(timestamp).toLocaleString();
  }
}

async function sendSyncMessage(type, payload = {}) {
  const response = await browser.runtime.sendMessage({ type, ...payload });
  if (!response) throw new Error(t("backgroundServiceNoResponse"));
  if (response.ok === false) throw new Error(response.error ? translateText(response.error) : t("firefoxSyncError"));
  return response;
}

async function importThisFirefox() {
  // Fetch/prepare first. Those awaits may give the background worker time to
  // receive and persist a newer synchronized state. Re-read immediately before
  // applying the import so setup can never overwrite that newer state with a
  // stale snapshot captured at the start of the operation.
  const imported = await prepareFirefoxShortcutFavicons(await fetchFirefoxShortcuts());
  if (!imported.length) {
    throw new Error(t("noFirefoxShortcuts"));
  }
  const loaded = await ensureLocalStorage();
  const state = loaded.state;
  const previousSettings = stableStringify(state.settings);
  replaceWithFirefoxShortcuts(state, imported);
  const timestamp = nextMutationTime(state.updatedAt, state.settingsModifiedAt);
  if (stableStringify(state.settings) !== previousSettings) state.settingsModifiedAt = timestamp;
  state.updatedAt = timestamp;
  await writeLocalState(state);
  return imported.length;
}

async function startEmpty() {
  const loaded = await ensureLocalStorage();
  const state = loaded.state;
  state.shortcuts = [];
  state.updatedAt = nextMutationTime(state.updatedAt);
  await writeLocalState(state);
}

function stampImportedProfileState(importedState) {
  const normalized = normalizeState(importedState);
  const observedClocks = [];
  for (const spaceId of SPACE_IDS) {
    const workspace = normalized.spaces[spaceId];
    observedClocks.push(workspace.updatedAt, workspace.settingsModifiedAt);
    for (const item of workspace.shortcuts || []) {
      observedClocks.push(item.modifiedAt, item.spaceMoveAt);
      if (item.type === "folder") {
        for (const child of item.items || []) observedClocks.push(child.modifiedAt, child.spaceMoveAt);
      }
    }
  }
  const timestamp = nextMutationTime(observedClocks);
  const spaces = {};
  for (const spaceId of SPACE_IDS) {
    const workspace = normalized.spaces[spaceId];
    const stampItem = item => item.type === "folder"
      ? { ...item, modifiedAt: timestamp, items: (item.items || []).map(child => ({ ...child, modifiedAt: timestamp })) }
      : { ...item, modifiedAt: timestamp };
    spaces[spaceId] = {
      ...workspace,
      shortcuts: workspace.shortcuts.map(stampItem),
      settingsModifiedAt: timestamp,
      updatedAt: timestamp
    };
  }
  return normalizeState({
    schemaVersion: normalized.schemaVersion,
    activeSpaceId: normalized.activeSpaceId,
    spaces
  });
}

async function importMosaicSyncProfile(file) {
  const parsed = await parseProfilePackage(await readProfileImportText(file));
  const importedState = stampImportedProfileState(parsed.state);
  await writeLocalState(importedState);
  await setLocalePreference(parsed.preferences.uiLocale || "auto");
  // Preserve the imported preference independently from this installation's
  // optional Top Sites permission. New Tab will expose a localized recovery
  // action if the user still needs to grant that permission here.
  try {
    localStorage.setItem(
      FREQUENTLY_VISITED_PREF_KEY,
      parsed.preferences.frequentlyVisitedEnabled ? "1" : "0"
    );
  } catch {}
  localizeDocument(document);
}

async function completeOnboarding(message = t("setupComplete")) {
  if (finishing) return;
  finishing = true;
  const loaded = await ensureLocalStorage();
  const meta = normalizeMeta({ ...loaded.meta, onboardingCompleted: true, onboardingVersion: VERSION });
  await writeLocalMeta(meta);
  setStatus(`${translateText(message)} ${t("openingMosaic")}`);
  await new Promise(resolve => setTimeout(resolve, 220));
  // Do not call tabs.create() here. A packaged extension page can navigate to
  // another packaged page directly; no new tab needs to be created here.
  window.location.replace(browser.runtime.getURL("newtab/newtab.html"));
}

function configureSourceStep(syncStatus = null) {
  latestSyncStatus = syncStatus;
  introStep.hidden = true;
  sourceStep.hidden = false;
  syncStep.hidden = true;
  resolutionPanel.hidden = true;

  if (!syncOptedIn) {
    cloudChoiceInput.disabled = true;
    cloudChoiceCard.classList.add("disabled");
    cloudSnapshotHint.textContent = t("syncOff");
    sourceIntro.textContent = t("pickSource");
  } else if (syncStatus?.hasRemoteData) {
    cloudChoiceInput.disabled = false;
    cloudChoiceCard.classList.remove("disabled");
    cloudSnapshotHint.textContent = syncStatus.remoteUpdatedAt
      ? t("copyReceived", { time: formatTime(syncStatus.remoteUpdatedAt) })
      : t("completeCopyAvailable");
    sourceIntro.textContent = t("completeCopyAvailable");
  } else {
    cloudChoiceInput.disabled = false;
    cloudChoiceCard.classList.remove("disabled");
    cloudSnapshotHint.textContent = syncStatus?.hasRemoteSignal
      ? t("syncStillDelivering")
      : t("waitForSync");
    sourceIntro.textContent = `${t("syncReady")} ${t("chooseStartingLayout")}`;
  }
  refreshChoiceCards();
}

function showConflictPanel(syncStatus) {
  latestSyncStatus = syncStatus;
  introStep.hidden = true;
  sourceStep.hidden = true;
  syncStep.hidden = true;
  resolutionPanel.hidden = false;
  chooseLocalButton.hidden = false;
  chooseCloudButton.hidden = false;
  syncHelp.hidden = false;

  if (syncStatus?.hasRemoteData) {
    resolutionTitle.textContent = t("completeCopyAvailable");
    resolutionText.textContent = syncStatus.remoteUpdatedAt
      ? t("completeCopyReceivedQuestion", { time: formatTime(syncStatus.remoteUpdatedAt) })
      : `${t("completeCopyAvailable")} ${t("chooseLayout")}`;
    chooseCloudButton.textContent = t("useSyncedCopy");
  } else {
    resolutionTitle.textContent = t("waitingForLayout");
    resolutionText.textContent = t("partialCopyWarning");
    chooseCloudButton.textContent = t("waitForSync");
  }
}

async function persistWebAccessDecision(granted) {
  webAccessGranted = granted === true;
  webAccessPrompted = true;
  try {
    const loaded = await ensureLocalStorage();
    if (loaded.state.settings.webAccessPrompted === true) return;
    loaded.state.settings.webAccessPrompted = true;
    loaded.state.updatedAt = Math.max(now(), (Number(loaded.state.updatedAt) || 0) + 1);
    await writeLocalState(loaded.state);
  } catch (error) {
    console.warn("MosaicSync could not persist the website-access decision.", error);
  }
}

introContinueButton.addEventListener("click", () => {
  // permissions.request() must be initiated directly by this user gesture.
  // Keep the Intro step visible until Firefox's native prompt has resolved so
  // the prompt cannot appear over an unrelated "Sync between computers?" step.
  const permissionPromise = (!webAccessGranted && !webAccessPrompted)
    ? requestWebAccessFromGesture()
    : Promise.resolve(webAccessGranted);

  introContinueButton.disabled = true;
  setStatus(!webAccessGranted && !webAccessPrompted ? t("autoIconsDescription") : "");
  webAccessDecisionPromise = Promise.resolve(permissionPromise)
    .then(async granted => {
      const allowed = granted === true;
      if (!webAccessPrompted) await persistWebAccessDecision(allowed);
      if (allowed) await cleanupLegacyWebOriginPermissions();
      return allowed;
    })
    .catch(async () => {
      if (!webAccessPrompted) await persistWebAccessDecision(false);
      return false;
    });

  void webAccessDecisionPromise.finally(() => {
    introContinueButton.disabled = false;
    introStep.hidden = true;
    syncStep.hidden = false;
    sourceStep.hidden = true;
    resolutionPanel.hidden = true;
    setStatus("");
  });
});

syncContinueButton.addEventListener("click", event => {
  const wantsSync = selected("syncChoice") === "yes";
  // Must happen synchronously inside this click handler.
  const permissionPromise = wantsSync ? requestSyncConsentFromGesture() : Promise.resolve(true);

  void (async () => {
    syncContinueButton.disabled = true;
    setStatus(wantsSync ? t("requestSyncPermission") : t("preparingLocalSetup"));
    try {
      const granted = await permissionPromise;
      await webAccessDecisionPromise;
      if (wantsSync && !granted) {
        setStatus(t("syncPermissionDeclined"), "warning");
        syncContinueButton.disabled = false;
        return;
      }

      syncOptedIn = wantsSync && granted;
      await sendSyncMessage("mosaicsync:set-sync-enabled", { enabled: syncOptedIn });
      if (!syncOptedIn) await removeSyncConsent();
      const syncStatus = syncOptedIn ? await sendSyncMessage("mosaicsync:get-sync-status") : null;
      configureSourceStep(syncStatus);
      setStatus(syncOptedIn ? t("syncPermissionGrantedSource") : t("stayLocal"));
    } catch (error) {
      console.error(error);
      setStatus(error.message || t("couldNotContinue"), "error");
    } finally {
      syncContinueButton.disabled = false;
    }
  })();
});

async function continueAfterStartingSource(source) {
  if (!syncOptedIn) {
    const message = source === "local"
      ? t("firefoxShortcutsImported")
      : source === "profile"
        ? t("profileImported")
        : t("localSetupComplete");
    await completeOnboarding(message);
    return;
  }

  const syncStatus = await sendSyncMessage("mosaicsync:get-sync-status");
  latestSyncStatus = syncStatus;

  if (source === "cloud") {
    const response = await sendSyncMessage("mosaicsync:wait-for-remote");
    if (response.pending) {
      await completeOnboarding(t("syncStarted"));
      return;
    }
    await completeOnboarding(response.remoteUpdatedAt
      ? t("syncedLayoutFromRestored", { time: formatTime(response.remoteUpdatedAt) })
      : t("syncRestored"));
    return;
  }

  if (syncStatus.hasRemoteSignal) {
    showConflictPanel(syncStatus);
    setStatus(syncStatus.hasRemoteData
      ? t("chooseWinningCopy")
      : t("partialCopyWarning"),
    syncStatus.hasRemoteData ? "" : "warning");
    return;
  }

  setStatus(t("publishingFirst"));
  const published = await sendSyncMessage("mosaicsync:bootstrap-local");
  await completeOnboarding(published.meta?.lastSyncWarning || t("computerSource"));
}

sourceFinishButton.addEventListener("click", () => {
  const source = selected("sourceChoice");
  if (source === "profile") {
    welcomeProfileFile?.click();
    return;
  }

  // Top Sites is optional and requested only when the user deliberately
  // chooses the browser's native shortcuts. The request must happen before awaits.
  const topSitesPermissionPromise = source === "local"
    ? requestTopSitesPermissionFromGesture()
    : Promise.resolve(true);

  void (async () => {
    sourceFinishButton.disabled = true;
    try {
      const topSitesGranted = await topSitesPermissionPromise;
      if (source === "local" && !topSitesGranted) {
        setStatus(t("shortcutAccessDeclined"), "warning");
        sourceFinishButton.disabled = false;
        return;
      }
      if (source === "local") {
        setStatus(t("importingFirefox"));
        await importThisFirefox();
      } else if (source === "empty") {
        await startEmpty();
      }
      await continueAfterStartingSource(source);
    } catch (error) {
      console.error(error);
      setStatus(error.message || t("couldNotContinue"), "error");
      sourceFinishButton.disabled = false;
    }
  })();
});

welcomeProfileFile?.addEventListener("change", () => {
  const file = welcomeProfileFile.files?.[0];
  welcomeProfileFile.value = "";
  if (!file) return;

  void (async () => {
    sourceFinishButton.disabled = true;
    setStatus(t("importMosaicProfile"));
    try {
      await importMosaicSyncProfile(file);
    } catch (error) {
      console.error(error);
      setStatus(error?.code === "PROFILE_TOO_LARGE" ? t("profileImportTooLarge") : t("profileImportFailed"), "error");
      sourceFinishButton.disabled = false;
      return;
    }

    try {
      await continueAfterStartingSource("profile");
    } catch (error) {
      console.error(error);
      setStatus(t("couldNotContinue"), "error");
      sourceFinishButton.disabled = false;
    }
  })();
});

chooseLocalButton.addEventListener("click", async () => {
  chooseLocalButton.disabled = true;
  chooseCloudButton.disabled = true;
  try {
    setStatus(t("usingComputerSource"));
    const response = await sendSyncMessage("mosaicsync:bootstrap-local");
    await completeOnboarding(response.meta?.lastSyncWarning || t("computerSource"));
  } catch (error) {
    setStatus(error.message || t("firefoxSyncError"), "error");
    chooseLocalButton.disabled = false;
    chooseCloudButton.disabled = false;
  }
});

chooseCloudButton.addEventListener("click", async () => {
  chooseLocalButton.disabled = true;
  chooseCloudButton.disabled = true;
  try {
    const complete = Boolean(latestSyncStatus?.hasRemoteData);
    setStatus(complete ? t("restoringSync") : t("waitingCompleteSync"));
    const response = await sendSyncMessage(complete ? "mosaicsync:bootstrap-remote" : "mosaicsync:wait-for-remote");
    if (response.pending) {
      await completeOnboarding(t("syncStarted"));
      return;
    }
    await completeOnboarding(response.remoteUpdatedAt
      ? t("syncedLayoutFromRestored", { time: formatTime(response.remoteUpdatedAt) })
      : t("syncRestored"));
  } catch (error) {
    setStatus(error.message || t("couldNotRestore"), "error");
    chooseLocalButton.disabled = false;
    chooseCloudButton.disabled = false;
  }
});

async function initializeWelcome() {
  try {
    const loaded = await ensureLocalStorage();
    const existingMeta = loaded.meta;
    webAccessPrompted = loaded.state.settings.webAccessPrompted === true;
    webAccessGranted = await hasWebAccess();
    webAccessDecisionPromise = Promise.resolve(webAccessGranted);

    if (existingMeta.onboardingCompleted) {
      // Welcome can be opened manually, but a completed installation should
      // not accidentally rerun setup simply because an old Welcome tab was
      // restored by the browser.
      setStatus(t("setupAlreadyComplete"));
      window.location.replace(browser.runtime.getURL("newtab/newtab.html"));
      return;
    }

    if (!existingMeta.syncEnabled) {
      introStep.hidden = false;
      syncStep.hidden = true;
      sourceStep.hidden = true;
      return;
    }

    introStep.hidden = true;
    syncOptedIn = true;
    const syncStatus = await sendSyncMessage("mosaicsync:get-sync-status");
    latestSyncStatus = syncStatus;

    if (existingMeta.syncBootstrapMode === "await-remote" && !existingMeta.syncInitialized) {
      await completeOnboarding(t("syncAlreadyInProgress"));
      return;
    }

    configureSourceStep(syncStatus);
    setStatus(t("syncPermissionAlreadyEnabled"));
  } catch (error) {
    console.error(error);
    setStatus(error.message || t("couldNotResume"), "error");
  }
}

void initializeWelcome();
