export function isStaleCheckpointError(error) {
  const status = Number(error?.response?.status ?? error?.status);
  const code = String(error?.response?.data?.code ?? error?.code ?? "");
  return status === 409 && code === "STALE_CHECKPOINT";
}

export function readCheckpointRevision(payload) {
  const revision = Number(
    payload?.current_revision ?? payload?.data?.current_revision
  );
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : null;
}

export function readStaleCheckpointRevision(error) {
  return readCheckpointRevision(error?.response?.data?.details);
}

export function buildCheckpointSavePayload({
  workbookData,
  baseRevision,
  personalDraft,
}) {
  return {
    workbook_data: workbookData,
    base_revision: Number.isSafeInteger(baseRevision) ? baseRevision : 0,
    personal_draft: personalDraft || null,
  };
}
