/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/*
 * First-run setup controller. The wizard never publishes or restores a layout until
 * the user explicitly chooses the source for this Firefox profile.
 */
import { PLATFORM_ID } from "../core/platform.js";
import {
  DONATE_URL,
  FREQUENTLY_VISITED_PREF_KEY,
  FREQUENTLY_VISITED_PERMISSION_PROMPTED_KEY,
  SPACE_IDS,
  SETTINGS_SYNC_CLOCK_KEYS,
  SUPPORT_URL,
  VERSION
} from "../core/constants.js";
import { fetchFirefoxShortcuts, prepareFirefoxShortcutFavicons, replaceWithFirefoxShortcuts } from "../core/importer.js";
import { defaultDeviceName, nextMutationTime, normalizeDeviceName, normalizeState, now, stableStringify } from "../core/model.js";
import { ensureLocalStorage, updateLocalMeta, writeLocalState } from "../core/storage.js";
import { cleanupLegacyWebOriginPermissions, hasTopSitesPermission, hasWebAccess, removeSyncConsent, requestSyncConsentFromGesture, requestTopSitesPermissionFromGesture, requestWebAccessFromGesture } from "../core/permissions.js";
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
const welcomeDeviceNameCard = document.getElementById("welcomeDeviceNameCard");
const welcomeDeviceNameInput = document.getElementById("welcomeDeviceNameInput");
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
const frequentPermissionStep = document.getElementById("frequentPermissionStep");
const welcomeFrequentPermissionTitle = document.getElementById("welcomeFrequentPermissionTitle");
const welcomeFrequentPermissionText = document.getElementById("welcomeFrequentPermissionText");
const welcomeFrequentPermissionButton = document.getElementById("welcomeFrequentPermissionButton");
const welcomeFrequentPermissionContinue = document.getElementById("welcomeFrequentPermissionContinue");
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
let pendingFrequentPermissionCompletionMessage = "";

function selected(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value || "";
}

let suggestedDeviceNamePromise = null;

async function suggestedDeviceName() {
  if (!suggestedDeviceNamePromise) {
    suggestedDeviceNamePromise = Promise.resolve(browser.runtime.getPlatformInfo?.())
      .catch(() => null)
      .then(info => defaultDeviceName(PLATFORM_ID, info?.os));
  }
  return suggestedDeviceNamePromise;
}

function refreshChoiceCards() {
  choiceCards.forEach(card => card.classList.toggle("selected", Boolean(card.querySelector("input")?.checked)));
  const wantsSync = selected("syncChoice") === "yes";
  if (welcomeDeviceNameCard) welcomeDeviceNameCard.hidden = !wantsSync;
  if (wantsSync && welcomeDeviceNameInput && !normalizeDeviceName(welcomeDeviceNameInput.value)) {
    void suggestedDeviceName().then(name => {
      if (selected("syncChoice") === "yes" && !normalizeDeviceName(welcomeDeviceNameInput.value)) welcomeDeviceNameInput.value = name;
    });
  }
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

function markFrequentlyVisitedPermissionPrompted() {
  try { localStorage.setItem(FREQUENTLY_VISITED_PERMISSION_PROMPTED_KEY, "1"); } catch {}
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
      settingsClock: Object.fromEntries(SETTINGS_SYNC_CLOCK_KEYS.map(key => [key, [timestamp, ""]])),
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
  await ensureLocalStorage();
  await updateLocalMeta({ onboardingCompleted: true, onboardingVersion: VERSION });
  setStatus(`${translateText(message)} ${t("openingMosaic")}`);
  await new Promise(resolve => setTimeout(resolve, 220));
  // Do not call tabs.create() here. A packaged extension page can navigate to
  // another packaged page directly; no new tab needs to be created here.
  window.location.replace(browser.runtime.getURL("newtab/newtab.html"));
}

function configureSourceStep(syncStatus = null) {
  latestSyncStatus = syncStatus;
  if (frequentPermissionStep) frequentPermissionStep.hidden = true;
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
      if (syncOptedIn) {
        const deviceName = normalizeDeviceName(welcomeDeviceNameInput?.value) || await suggestedDeviceName();
        const named = await sendSyncMessage("mosaicsync:set-device-name", { deviceName });
        if (welcomeDeviceNameInput) welcomeDeviceNameInput.value = named.deviceName || deviceName;
      }
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

function requestStartingSourceTopSitesPermissionFromGesture(source, syncStatus = latestSyncStatus) {
  const shouldRequest = source === "local" || (
    source === "cloud" &&
    syncStatus?.hasRemoteData === true &&
    syncStatus?.remoteFrequentlyVisitedEnabled === true
  );
  if (shouldRequest && source === "cloud") markFrequentlyVisitedPermissionPrompted();
  return {
    attempted: shouldRequest,
    promise: shouldRequest ? requestTopSitesPermissionFromGesture() : Promise.resolve(true)
  };
}

function showFrequentlyVisitedPermissionStep(completionMessage) {
  if (!frequentPermissionStep) return false;
  markFrequentlyVisitedPermissionPrompted();
  pendingFrequentPermissionCompletionMessage = completionMessage || t("setupComplete");
  introStep.hidden = true;
  syncStep.hidden = true;
  sourceStep.hidden = true;
  resolutionPanel.hidden = true;
  welcomeFrequentPermissionTitle.textContent = t("frequentlyVisited");
  welcomeFrequentPermissionText.textContent = `${t("frequentPermissionRequired")} ${t("frequentDeviceLocalStatus")}`;
  welcomeFrequentPermissionButton.textContent = t("grantFrequentlyVisitedPermission");
  welcomeFrequentPermissionContinue.textContent = t("continue");
  frequentPermissionStep.hidden = false;
  setStatus("");
  return true;
}

async function completeOrOfferFrequentlyVisitedPermission(completionMessage, { permissionAttempted = false } = {}) {
  if (!permissionAttempted) {
    try {
      const loaded = await ensureLocalStorage();
      const enabled = loaded.state?.spaces?.personal?.settings?.frequentlyVisitedEnabled === true;
      if (enabled && !(await hasTopSitesPermission())) {
        if (showFrequentlyVisitedPermissionStep(completionMessage)) return;
      }
    } catch {}
  }
  await completeOnboarding(completionMessage);
}

async function continueAfterStartingSource(source, { frequentPermissionAttempted = false } = {}) {
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
    await completeOrOfferFrequentlyVisitedPermission(response.remoteUpdatedAt
      ? t("syncedLayoutFromRestored", { time: formatTime(response.remoteUpdatedAt) })
      : t("syncRestored"), { permissionAttempted: frequentPermissionAttempted });
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

  // Firefox only allows optional permissions to be requested from a user
  // gesture. Use this Finish setup click for native shortcuts and, when a
  // complete synchronized copy has already arrived with FV enabled, for that
  // device-local Top Sites permission too.
  const topSitesRequest = requestStartingSourceTopSitesPermissionFromGesture(source, latestSyncStatus);
  const topSitesPermissionPromise = topSitesRequest.promise;

  void (async () => {
    sourceFinishButton.disabled = true;
    try {
      const topSitesGranted = await Promise.resolve(topSitesPermissionPromise).catch(() => false);
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
      await continueAfterStartingSource(source, { frequentPermissionAttempted: topSitesRequest.attempted });
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

chooseCloudButton.addEventListener("click", () => {
  // Start the optional Top Sites request synchronously from this explicit
  // synchronized-copy choice when the complete remote preference is known.
  const topSitesRequest = requestStartingSourceTopSitesPermissionFromGesture("cloud", latestSyncStatus);
  void (async () => {
    chooseLocalButton.disabled = true;
    chooseCloudButton.disabled = true;
    try {
      await Promise.resolve(topSitesRequest.promise).catch(() => false); // denial never blocks restoring the profile
      const complete = Boolean(latestSyncStatus?.hasRemoteData);
      setStatus(complete ? t("restoringSync") : t("waitingCompleteSync"));
      const response = await sendSyncMessage(complete ? "mosaicsync:bootstrap-remote" : "mosaicsync:wait-for-remote");
      if (response.pending) {
        await completeOnboarding(t("syncStarted"));
        return;
      }
      await completeOrOfferFrequentlyVisitedPermission(response.remoteUpdatedAt
        ? t("syncedLayoutFromRestored", { time: formatTime(response.remoteUpdatedAt) })
        : t("syncRestored"), { permissionAttempted: topSitesRequest.attempted });
    } catch (error) {
      setStatus(error.message || t("couldNotRestore"), "error");
      chooseLocalButton.disabled = false;
      chooseCloudButton.disabled = false;
    }
  })();
});

welcomeFrequentPermissionButton?.addEventListener("click", () => {
  const permissionPromise = requestTopSitesPermissionFromGesture();
  markFrequentlyVisitedPermissionPrompted();
  void (async () => {
    welcomeFrequentPermissionButton.disabled = true;
    welcomeFrequentPermissionContinue.disabled = true;
    try {
      const granted = await permissionPromise;
      if (!granted) {
        setStatus(t("frequentPermissionDenied"), "warning");
        welcomeFrequentPermissionButton.disabled = false;
        welcomeFrequentPermissionContinue.disabled = false;
        return;
      }
      await completeOnboarding(pendingFrequentPermissionCompletionMessage || t("setupComplete"));
    } catch (error) {
      console.error(error);
      setStatus(t("frequentEnableFailed"), "error");
      welcomeFrequentPermissionButton.disabled = false;
      welcomeFrequentPermissionContinue.disabled = false;
    }
  })();
});

welcomeFrequentPermissionContinue?.addEventListener("click", () => {
  void completeOnboarding(pendingFrequentPermissionCompletionMessage || t("setupComplete"));
});

async function initializeWelcome() {
  try {
    const loaded = await ensureLocalStorage();
    const existingMeta = loaded.meta;
    if (welcomeDeviceNameInput) welcomeDeviceNameInput.value = normalizeDeviceName(existingMeta.deviceName) || await suggestedDeviceName();
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
