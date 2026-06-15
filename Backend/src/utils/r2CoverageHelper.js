const fs = require("fs");
const path = require("path");
const db = require("../../db");
const { findOrderFolders } = require("./r2Helper");

const R2_SYNC_STATUS_TABLE = "order_r2_sync_status";

function trimTrailingSlash(url) {
  if (!url) return url;
  return url.replace(/\/+$/, "");
}

function walkFiles(dir) {
  const out = [];
  try {
    if (!fs.existsSync(dir)) return out;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        out.push(...walkFiles(full));
      } else if (entry.isFile()) {
        out.push(full);
      }
    }
  } catch (_) {
    /* ignore */
  }
  return out;
}

function orderHasLocalFilesOnDisk(orderNumber) {
  const folders = findOrderFolders(orderNumber);
  for (const folder of folders) {
    if (walkFiles(folder).length > 0) {
      return true;
    }
  }
  return false;
}

function isR2PublicUrl(value, publicBase) {
  if (!value || typeof value !== "string" || !publicBase) return false;
  return value.trim().startsWith(publicBase);
}

function isLocalUploadsUrl(value) {
  if (!value || typeof value !== "string") return false;
  const raw = value.trim();
  if (raw.startsWith("/uploads/")) return true;
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try {
      const parsed = new URL(raw);
      return parsed.pathname && parsed.pathname.startsWith("/uploads/");
    } catch (_) {
      return false;
    }
  }
  return false;
}

async function countMediaUrlMatches(orderIds, predicate) {
  const ids = [...new Set(orderIds.map(Number).filter(Boolean))];
  if (ids.length === 0) {
    return new Map();
  }

  const counts = new Map(ids.map((id) => [id, { r2: 0, local: 0 }]));
  const tables = ["order_media_image_video", "order_media_documents"];

  for (const table of tables) {
    const rows = await db(table)
      .select("order_id", "media_url")
      .whereIn("order_id", ids)
      .whereNotNull("media_url")
      .whereNull("deleted_at");

    for (const row of rows) {
      const bucket = counts.get(Number(row.order_id));
      if (!bucket) continue;
      if (predicate.isR2(row.media_url)) bucket.r2 += 1;
      if (predicate.isLocal(row.media_url)) bucket.local += 1;
    }
  }

  return counts;
}

async function getSyncStatusByOrderIds(orderIds) {
  const ids = [...new Set(orderIds.map(Number).filter(Boolean))];
  const map = new Map();
  if (ids.length === 0) return map;

  try {
    const rows = await db(R2_SYNC_STATUS_TABLE)
      .select("order_id", "status", "uploaded_count", "skipped_count")
      .whereIn("order_id", ids);
    for (const row of rows) {
      map.set(Number(row.order_id), row);
    }
  } catch (err) {
    if (!String(err.message || "").toLowerCase().includes("order_r2_sync_status")) {
      throw err;
    }
  }

  return map;
}

function resolveR2State(hasR2, hasLocalPending) {
  if (hasR2 && !hasLocalPending) return "full";
  if (hasR2 && hasLocalPending) return "partial";
  if (!hasR2 && hasLocalPending) return "remaining";
  return null;
}

async function computeR2CoverageForOrders(orders) {
  const publicBase = trimTrailingSlash(process.env.R2_PUBLIC_BASE_URL || "");
  const normalized = (orders || [])
    .map((o) => ({
      id: Number(o.id),
      order_number: o.order_number,
      current_status_id: Number(o.current_status_id),
    }))
    .filter((o) => o.id && o.order_number);

  const orderIds = normalized.map((o) => o.id);
  const [mediaCounts, syncMap] = await Promise.all([
    countMediaUrlMatches(orderIds, {
      isR2: (url) => isR2PublicUrl(url, publicBase),
      isLocal: (url) => isLocalUploadsUrl(url),
    }),
    getSyncStatusByOrderIds(orderIds),
  ]);

  const result = new Map();

  for (const order of normalized) {
    const media = mediaCounts.get(order.id) || { r2: 0, local: 0 };
    const hasLocalDisk = orderHasLocalFilesOnDisk(order.order_number);
    const hasLocalPending = hasLocalDisk || media.local > 0;

    const syncRow = syncMap.get(order.id);
    const syncHadUploads =
      syncRow &&
      syncRow.status === "completed" &&
      Number(syncRow.uploaded_count || 0) + Number(syncRow.skipped_count || 0) > 0;

    const hasR2 = media.r2 > 0 || syncHadUploads;
    const r2_state = resolveR2State(hasR2, hasLocalPending);
    const isFinalized =
      order.current_status_id === 13 || order.current_status_id === 14;
    const can_sync_r2 =
      isFinalized && (r2_state === "partial" || r2_state === "remaining");

    result.set(order.id, {
      r2_state,
      has_local_files: hasLocalPending,
      has_r2_content: hasR2,
      can_sync_r2,
    });
  }

  return result;
}

async function computeR2CoverageForOrder(order) {
  if (!order?.id || !order?.order_number) {
    return {
      r2_state: null,
      has_local_files: false,
      has_r2_content: false,
      can_sync_r2: false,
    };
  }

  const map = await computeR2CoverageForOrders([order]);
  return (
    map.get(Number(order.id)) || {
      r2_state: null,
      has_local_files: false,
      has_r2_content: false,
      can_sync_r2: false,
    }
  );
}

module.exports = {
  computeR2CoverageForOrder,
  computeR2CoverageForOrders,
  resolveR2State,
};
