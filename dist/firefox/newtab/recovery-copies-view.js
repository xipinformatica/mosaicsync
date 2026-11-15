/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
// Lazy presentation-only module. No storage, Sync or Recovery permissions.
// The New Tab controller owns session authority, transport and destructive actions.

export function renderRecoveryCopiesView(model, context) {
  const {
    document, recoveryCopiesList, recoveryCopiesSummary, recoverySafeCleanupTitle,
    recoverySafeCleanupDetail, recoverySafeCleanupButton, recoverySafeCleanup,
    recoveryCopiesFootnote, t, formatLocalizedBytes, recoveryDeviceDisplayName,
    recoveryDeviceCopyCountText, formatSyncTime, confirmMosaic, performRecoveryCleanup,
    setRecoveryCopiesBusy, isRecoveryCopiesBusy
  } = context;
  if (!recoveryCopiesList || !recoveryCopiesSummary) return;
  const devices = Array.isArray(model?.devices) ? model.devices : [];
  const completeCount = devices.reduce((sum, device) => sum + (Array.isArray(device.generations) ? device.generations.length : 0), 0);
  recoveryCopiesSummary.textContent = t("recoveryCopiesSummary", {
    count: completeCount,
    size: formatLocalizedBytes(model?.managedBytes || 0)
  });
  if ((Number(model?.unmanagedBytes) || 0) > 0) {
    recoveryCopiesSummary.textContent += ` ${t("recoveryCopiesUnmanaged", { size: formatLocalizedBytes(model.unmanagedBytes) })}`;
  }
  if (recoverySafeCleanupTitle) recoverySafeCleanupTitle.textContent = t("recoverySafeCleanupTitle");
  if (recoverySafeCleanupDetail) recoverySafeCleanupDetail.textContent = t("recoverySafeCleanupDetail", {
    count: Number(model?.safeCleanupCount) || 0
  });
  if (recoverySafeCleanupButton) {
    recoverySafeCleanupButton.textContent = t("recoveryFreeSafely", { size: formatLocalizedBytes(model?.safeCleanupBytes || 0) });
    recoverySafeCleanupButton.dataset.recoveryAction = "superseded";
    recoverySafeCleanupButton.dataset.recoveryCount = String(Number(model?.safeCleanupCount) || 0);
    recoverySafeCleanupButton.dataset.recoveryBytes = String(Number(model?.safeCleanupBytes) || 0);
  }
  if (recoverySafeCleanup) recoverySafeCleanup.hidden = !(Number(model?.safeCleanupCount) > 0 && Number(model?.safeCleanupBytes) > 0);
  if (recoveryCopiesFootnote) recoveryCopiesFootnote.textContent = t("recoveryManagerFootnote");

  recoveryCopiesList.replaceChildren();
  if (!devices.length) {
    const empty = document.createElement("div");
    empty.className = "recovery-copies-empty";
    empty.textContent = t("recoveryNoCompleteCopies");
    recoveryCopiesList.append(empty);
    return;
  }

  for (const device of devices) {
    const card = document.createElement("section");
    card.className = "recovery-device-card";

    const heading = document.createElement("div");
    heading.className = "recovery-device-heading";
    const title = document.createElement("div");
    title.className = "recovery-device-title";
    const strong = document.createElement("strong");
    strong.textContent = recoveryDeviceDisplayName(device);
    const small = document.createElement("small");
    const generations = Array.isArray(device.generations) ? device.generations : [];
    small.textContent = `${recoveryDeviceCopyCountText(generations.length, t)} · ${formatLocalizedBytes(device.bytes || 0)}`;
    title.append(strong, small);
    heading.append(title);

    if (device.canRemoveDevice) {
      const actions = document.createElement("div");
      actions.className = "recovery-device-actions";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "danger-button";
      remove.dataset.recoveryAction = "device";
      remove.textContent = t("recoveryRemoveDeviceCopies");
      remove.addEventListener("click", async () => {
        const label = recoveryDeviceDisplayName(device);
        const confirmed = await confirmMosaic(t("recoveryConfirmDevice", {
          device: label,
          size: formatLocalizedBytes(device.bytes || 0)
        }), { danger: true });
        if (confirmed) void performRecoveryCleanup({ mode: "device", deviceId: device.deviceId });
      });
      actions.append(remove);
      heading.append(actions);
    }
    card.append(heading);

    const list = document.createElement("div");
    list.className = "recovery-generation-list";
    generations.forEach((generation, index) => {
      const row = document.createElement("div");
      row.className = "recovery-generation-row";
      const copy = document.createElement("div");
      copy.className = "recovery-generation-copy";
      const name = document.createElement("strong");
      name.textContent = generation.latest ? t("recoveryLatestCopy") : t("recoveryPreviousCopy");
      if (generation.latest) {
        const badge = document.createElement("span");
        badge.className = "recovery-generation-badge";
        badge.textContent = t("recoveryProtected");
        name.append(badge);
      }
      const detail = document.createElement("small");
      detail.textContent = `${formatSyncTime(generation.publishedAt || generation.updatedAt)} · ${formatLocalizedBytes(generation.bytes || 0)}`;
      copy.append(name, detail);
      row.append(copy);

      if (generation.canDelete) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "danger-button";
        remove.dataset.recoveryAction = "generation";
        remove.textContent = t("recoveryDeletePrevious");
        remove.addEventListener("click", async () => {
          const confirmed = await confirmMosaic(t("recoveryConfirmGeneration", { size: formatLocalizedBytes(generation.bytes || 0) }), { danger: true });
          if (confirmed) void performRecoveryCleanup({ mode: "generation", rootKey: generation.rootKey });
        });
        row.append(remove);
      }
      // The newest badge already explains why this generation has no Delete button.
      list.append(row);
    });
    card.append(list);
    recoveryCopiesList.append(card);
  }
  setRecoveryCopiesBusy(isRecoveryCopiesBusy());
}
