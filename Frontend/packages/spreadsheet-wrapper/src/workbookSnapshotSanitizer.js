/**
 * Zoom and other viewport-only keys that must never be persisted in workbook_data.
 * Univer stores sheet zoom on each worksheet snapshot (see IWorksheetData.zoomRatio).
 */
export const ZOOM_RELATED_SNAPSHOT_KEYS = new Set([
  "zoomRatio",
  "zoom",
  "zoomLevel",
]);

function cloneWorkbookSnapshot(workbookData) {
  if (workbookData == null) {
    return workbookData;
  }

  if (typeof structuredClone === "function") {
    return structuredClone(workbookData);
  }

  return JSON.parse(JSON.stringify(workbookData));
}

function removeZoomKeysDeep(value) {
  if (value == null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => removeZoomKeysDeep(entry));
  }

  const result = {};

  Object.entries(value).forEach(([key, entryValue]) => {
    if (ZOOM_RELATED_SNAPSHOT_KEYS.has(key)) {
      return;
    }

    result[key] = removeZoomKeysDeep(entryValue);
  });

  return result;
}

function sanitizeResourceEntry(resource) {
  if (!resource || typeof resource !== "object") {
    return resource;
  }

  if (typeof resource.data !== "string") {
    return removeZoomKeysDeep(resource);
  }

  try {
    const parsed = JSON.parse(resource.data);
    return {
      ...resource,
      data: JSON.stringify(removeZoomKeysDeep(parsed)),
    };
  } catch {
    return resource;
  }
}

/**
 * Deep-clone a workbook snapshot and remove zoom/viewport preference fields
 * before persistence, sync, or hydration from stored workbook_data.
 *
 * Does not mutate the input snapshot or the live Univer workbook instance.
 *
 * @param {object|null|undefined} workbookData
 * @returns {object|null|undefined}
 */
export function sanitizeWorkbookSnapshotForPersistence(workbookData) {
  if (workbookData == null) {
    return workbookData;
  }

  const cloned = cloneWorkbookSnapshot(workbookData);
  const sanitized = removeZoomKeysDeep(cloned);

  if (Array.isArray(sanitized.resources)) {
    sanitized.resources = sanitized.resources.map(sanitizeResourceEntry);
  }

  return sanitized;
}
