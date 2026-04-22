/**
 * Cloudflare R2 helper
 *
 * Responsibilities:
 *  - Push the contents of a local order folder (`uploads/YYYY/MMM/<orderNumber>/...`)
 *    to an R2 bucket, preserving the same key structure.
 *  - Rewrite `media_url` values stored in the DB so that the app reads the
 *    files from the R2 public URL instead of the VPS disk.
 *  - Remove the local files only AFTER each file is byte-for-byte confirmed
 *    on R2, using a per-file HEAD check right before `unlink`.
 *
 * Safety model (no file can be lost):
 *   1. Per-file upload has 3 retries with exponential backoff.
 *   2. Every successful PUT is verified by HEAD + ContentLength === localSize.
 *   3. If ANY file fails -> DB is NOT rewritten and NOTHING local is deleted.
 *   4. Pre-delete verification pass HEADs every local file again.
 *   5. DB rewrite runs inside a single transaction (all-or-nothing).
 *   6. Physical delete is per-file (not `rm -rf`), with a LAST HEAD check per
 *      file. Any file that fails this final check is kept locally.
 *   7. Only files that existed at walk time are candidates for delete, so
 *      newly-arrived files (written during the sync) are never touched.
 *   8. A per-order in-memory mutex prevents concurrent syncs of the same
 *      order from racing each other.
 *
 * All work is best-effort from the controller's POV: failures are logged but
 * never thrown back so the API response is not blocked.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const mime = require("mime-types");
const {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} = require("@aws-sdk/client-s3");

const db = require("../../db");
const { UPLOADS_BASE_DIR } = require("./localFileHelper");

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_ENDPOINT,
  R2_BUCKET_PROD,
  R2_BUCKET_SANDBOX,
  R2_PUBLIC_BASE_URL,
  R2_SYNC_ENABLED,
  R2_DELETE_LOCAL_AFTER_UPLOAD,
  NODE_ENV,
} = process.env;

const STATUSES_THAT_TRIGGER_SYNC = [13, 14];
const R2_SYNC_STATUS_TABLE = "order_r2_sync_status";

// In-memory per-order mutex. Prevents two concurrent syncs for the same
// order from racing. Process-local only — if the app is clustered, upgrade
// this to a row-level lock in the DB.
const syncInFlight = new Set();

function isMissingStatusTableError(err) {
  if (!err || !err.message) return false;
  return String(err.message).toLowerCase().includes("order_r2_sync_status");
}

function isPostgresClient() {
  const clientName = db?.client?.config?.client || "";
  return String(clientName).toLowerCase().includes("pg");
}

function extractRawRow(rawRes) {
  if (!rawRes) return null;
  if (Array.isArray(rawRes.rows) && rawRes.rows.length > 0) return rawRes.rows[0];
  if (Array.isArray(rawRes) && rawRes.length > 0) return rawRes[0];
  return null;
}

async function tryAcquireDistributedOrderLock(orderId) {
  if (!isPostgresClient()) return true;
  const raw = await db.raw("SELECT pg_try_advisory_lock(?) AS locked", [
    Number(orderId),
  ]);
  const row = extractRawRow(raw);
  return Boolean(row?.locked);
}

async function releaseDistributedOrderLock(orderId) {
  if (!isPostgresClient()) return;
  try {
    await db.raw("SELECT pg_advisory_unlock(?)", [Number(orderId)]);
  } catch (err) {
    console.warn(`[r2] failed to release distributed lock for order=${orderId}:`, err.message);
  }
}

async function ensureStatusRow(orderId) {
  const existing = await db(R2_SYNC_STATUS_TABLE).where("order_id", Number(orderId)).first();
  if (existing) return existing;

  await db(R2_SYNC_STATUS_TABLE).insert({
    order_id: Number(orderId),
    status: "idle",
    message: "Waiting to start",
    uploaded_count: 0,
    skipped_count: 0,
    failed_count: 0,
    deleted_count: 0,
  });

  return db(R2_SYNC_STATUS_TABLE).where("order_id", Number(orderId)).first();
}

async function updateSyncStatus(orderId, patch = {}) {
  try {
    await ensureStatusRow(orderId);
    const now = new Date();
    await db(R2_SYNC_STATUS_TABLE)
      .where("order_id", Number(orderId))
      .update({
        ...patch,
        heartbeat_at: now,
        updated_at: now,
      });
  } catch (err) {
    if (!isMissingStatusTableError(err)) throw err;
  }
}

async function markSyncQueued(orderId) {
  await updateSyncStatus(orderId, {
    status: "queued",
    message: "Queued for R2 transfer",
    completed_at: null,
  });
}

async function getOrderR2SyncStatus(orderId) {
  let row = null;
  try {
    row = await db(R2_SYNC_STATUS_TABLE).where("order_id", Number(orderId)).first();
  } catch (err) {
    if (!isMissingStatusTableError(err)) throw err;
  }

  if (!row) {
    return {
      order_id: Number(orderId),
      status: "idle",
      message: "No transfer started yet",
      uploaded_count: 0,
      skipped_count: 0,
      failed_count: 0,
      deleted_count: 0,
      started_at: null,
      completed_at: null,
      heartbeat_at: null,
      updated_at: null,
    };
  }

  return row;
}

function isSyncEnabled() {
  if (String(R2_SYNC_ENABLED).toLowerCase() === "false") return false;

  const missing = [];
  if (!R2_ACCESS_KEY_ID) missing.push("R2_ACCESS_KEY_ID");
  if (!R2_SECRET_ACCESS_KEY) missing.push("R2_SECRET_ACCESS_KEY");
  if (!R2_ENDPOINT && !R2_ACCOUNT_ID) missing.push("R2_ENDPOINT or R2_ACCOUNT_ID");
  if (!R2_PUBLIC_BASE_URL) missing.push("R2_PUBLIC_BASE_URL");
  if (missing.length) {
    console.warn(`[r2] sync disabled, missing env vars: ${missing.join(", ")}`);
    return false;
  }
  return true;
}

function pickBucket() {
  if (NODE_ENV === "production") {
    return R2_BUCKET_PROD || R2_BUCKET_SANDBOX;
  }
  return R2_BUCKET_SANDBOX || R2_BUCKET_PROD;
}

function getEndpoint() {
  if (R2_ENDPOINT) return R2_ENDPOINT;
  if (R2_ACCOUNT_ID) return `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  return null;
}

let _client = null;
function getClient() {
  if (_client) return _client;
  _client = new S3Client({
    region: "auto",
    endpoint: getEndpoint(),
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
    // We do our own retry loop with a fresh stream on each attempt.
    // Letting the SDK retry would re-use an already-consumed stream
    // and produce inconsistent results.
    maxAttempts: 1,
  });
  return _client;
}

function trimTrailingSlash(url) {
  if (!url) return url;
  return url.replace(/\/+$/, "");
}

function toR2Key(filePath) {
  return path
    .relative(UPLOADS_BASE_DIR, filePath)
    .split(path.sep)
    .join("/");
}

/**
 * Walk a directory recursively and return every file path.
 * Safe if the dir disappears mid-walk (returns partial list).
 */
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
  } catch (err) {
    console.warn(`[r2] walkFiles error at ${dir}: ${err.message}`);
  }
  return out;
}

/**
 * Search uploads/YYYY/MMM/<orderNumber>/ for all year/month combinations.
 * Returns absolute folder paths (usually 0 or 1, but supports the rare case
 * where an order has folders across months).
 */
function findOrderFolders(orderNumber) {
  if (!orderNumber) return [];
  if (!fs.existsSync(UPLOADS_BASE_DIR)) return [];

  const matches = [];
  let years;
  try {
    years = fs.readdirSync(UPLOADS_BASE_DIR, { withFileTypes: true });
  } catch (err) {
    console.warn(`[r2] cannot read uploads dir: ${err.message}`);
    return [];
  }
  for (const y of years) {
    if (!y.isDirectory()) continue;
    const yearPath = path.join(UPLOADS_BASE_DIR, y.name);
    let months;
    try {
      months = fs.readdirSync(yearPath, { withFileTypes: true });
    } catch (_) {
      continue;
    }
    for (const m of months) {
      if (!m.isDirectory()) continue;
      const candidate = path.join(yearPath, m.name, String(orderNumber));
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
          matches.push(candidate);
        }
      } catch (_) {
        /* inaccessible candidate, skip */
      }
    }
  }
  return matches;
}

async function getRemoteObjectInfo(bucket, key) {
  try {
    const res = await getClient().send(
      new HeadObjectCommand({ Bucket: bucket, Key: key })
    );
    return {
      size: typeof res.ContentLength === "number" ? res.ContentLength : null,
      sha256: res?.Metadata?.sha256 || null,
    };
  } catch (_) {
    return { size: null, sha256: null };
  }
}

async function computeFileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

/**
 * Upload a single file to R2 using a stream (safe for large videos).
 * Verifies via HEAD that remoteSize === localSize after PUT.
 * Retries up to `attempts` times with exponential backoff, creating a
 * fresh read stream on each attempt.
 *
 * Also detects concurrent modification: if the file's size or mtime
 * changed between the pre-upload stat and the post-upload stat, the
 * upload is treated as failed (local is kept, next sync will retry).
 *
 * Returns { outcome: 'uploaded'|'skipped', size, mtimeMs, sha256 }.
 * Throws if all attempts fail.
 */
async function uploadFileVerified(bucket, key, filePath, attempts = 3) {
  const statBefore = fs.statSync(filePath);
  const localSize = statBefore.size;
  const localMtime = statBefore.mtimeMs;
  const localSha256 = await computeFileSha256(filePath);

  // Strict skip check: both size and checksum must match.
  const existing = await getRemoteObjectInfo(bucket, key);
  if (existing.size === localSize && existing.sha256 === localSha256) {
    return {
      outcome: "skipped",
      size: localSize,
      mtimeMs: localMtime,
      sha256: localSha256,
    };
  }

  const contentType = mime.lookup(filePath) || "application/octet-stream";

  let lastErr = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const body = fs.createReadStream(filePath);
      await getClient().send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          ContentLength: localSize,
          Metadata: {
            sha256: localSha256,
          },
        })
      );

      // Post-upload remote check
      const remote = await getRemoteObjectInfo(bucket, key);
      if (remote.size !== localSize || remote.sha256 !== localSha256) {
        lastErr = new Error(
          `integrity mismatch after upload (localSize=${localSize}, remoteSize=${remote.size}, localSha=${localSha256}, remoteSha=${remote.sha256})`
        );
        continue;
      }

      // Post-upload LOCAL stability check: was the file written to
      // while we were uploading? If yes, the bytes on R2 may not
      // reflect the final local content. Treat as failure.
      const statAfter = fs.statSync(filePath);
      if (
        statAfter.size !== localSize ||
        statAfter.mtimeMs !== localMtime
      ) {
        lastErr = new Error(
          `file changed during upload (sizeBefore=${localSize}, sizeAfter=${statAfter.size}, mtimeBefore=${localMtime}, mtimeAfter=${statAfter.mtimeMs})`
        );
        continue;
      }

      return {
        outcome: "uploaded",
        size: localSize,
        mtimeMs: localMtime,
        sha256: localSha256,
      };
    } catch (err) {
      lastErr = err;
    }

    if (attempt < attempts) {
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  throw lastErr || new Error("upload failed");
}

/**
 * Upload every file in the folder. Returns:
 *   { uploaded, skipped, failed: [{key,error}],
 *     candidates: [{filePath, size, mtimeMs, sha256}...] }
 * `candidates` is the list of files that succeeded (uploaded or skipped),
 * snapshotted at upload time. These are the ONLY deletion candidates, and
 * each must still match its snapshot at delete time.
 */
async function uploadFolderToR2(folderAbsPath) {
  const bucket = pickBucket();
  if (!bucket) throw new Error("No R2 bucket configured");

  const files = walkFiles(folderAbsPath);
  const results = { uploaded: 0, skipped: 0, failed: [], candidates: [] };

  for (const filePath of files) {
    const key = toR2Key(filePath);
    try {
      const res = await uploadFileVerified(bucket, key, filePath);
      if (res.outcome === "skipped") results.skipped += 1;
      else results.uploaded += 1;
      results.candidates.push({
        filePath,
        size: res.size,
        mtimeMs: res.mtimeMs,
        sha256: res.sha256,
      });
    } catch (err) {
      results.failed.push({ key, error: err.message });
      console.error(`[r2] failed to upload ${key}:`, err.message);
    }
  }

  return results;
}

/**
 * Rewrite `/uploads/...` URLs in the DB to the R2 public URL.
 * Runs inside a single Knex transaction — either all rows change or none.
 */
async function rewriteMediaUrlsForOrder(orderId) {
  const publicBase = trimTrailingSlash(R2_PUBLIC_BASE_URL);
  if (!publicBase) return { updated: 0 };

  const tablesWithMediaUrl = [
    "order_media_image_video",
    "order_media_documents",
  ];

  let updated = 0;

  const rewriteStringValue = (value) => {
    if (typeof value !== "string") return value;
    const raw = value.trim();
    if (!raw) return value;

    const toR2UrlFromPath = (uploadsPath) =>
      `${publicBase}${uploadsPath.replace(/^\/uploads/, "")}`;

    // Already an R2/public URL
    if (raw.startsWith(publicBase)) return value;

    // Relative local path
    if (raw.startsWith("/uploads/")) return toR2UrlFromPath(raw);

    // Absolute local URL, e.g. http://localhost:5000/uploads/...
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      try {
        const parsed = new URL(raw);
        if (parsed.pathname && parsed.pathname.startsWith("/uploads/")) {
          return toR2UrlFromPath(parsed.pathname);
        }
      } catch (_) {
        // Not a valid URL, keep as-is
      }
    }

    // JSON payload support:
    //  - {"path":"/uploads/..."}
    //  - {"link":"http://localhost:5000/uploads/..."}
    //  - nested arrays/objects containing such values
    try {
      const parsed = JSON.parse(raw);
      const rewriteDeep = (node) => {
        if (typeof node === "string") {
          return rewriteStringValue(node);
        }
        if (Array.isArray(node)) {
          return node.map(rewriteDeep);
        }
        if (node && typeof node === "object") {
          const out = {};
          for (const [k, v] of Object.entries(node)) {
            out[k] = rewriteDeep(v);
          }
          return out;
        }
        return node;
      };
      const rewritten = rewriteDeep(parsed);
      return JSON.stringify(rewritten);
    } catch (_) {
      // Plain non-JSON text
      return value;
    }
  };

  const maybeUpdateTextColumns = async (
    trx,
    tableName,
    rows,
    primaryKey = "id",
    skipColumns = []
  ) => {
    if (!rows || rows.length === 0) return;

    const columnInfo = await trx(tableName).columnInfo();
    const textColumns = Object.entries(columnInfo)
      .filter(([name, info]) => {
        if (name === primaryKey) return false;
        if (skipColumns.includes(name)) return false;
        return info?.type === "text" || info?.type === "string";
      })
      .map(([name]) => name);

    for (const row of rows) {
      const patch = {};
      for (const col of textColumns) {
        const current = row[col];
        if (typeof current !== "string") continue;
        const next = rewriteStringValue(current);
        if (next !== current) {
          patch[col] = next;
        }
      }
      if (Object.keys(patch).length > 0) {
        await trx(tableName).where(primaryKey, row[primaryKey]).update(patch);
        updated += Object.keys(patch).length;
      }
    }
  };

  await db.transaction(async (trx) => {
    // 1) Core media/document tables
    for (const table of tablesWithMediaUrl) {
      const rows = await trx(table)
        .select("id", "media_url")
        .where("order_id", orderId)
        .whereNotNull("media_url");

      for (const row of rows) {
        if (typeof row.media_url !== "string") continue;
        if (!row.media_url.startsWith("/uploads/")) continue;
        const newUrl = `${publicBase}${row.media_url.replace("/uploads", "")}`;
        await trx(table).where("id", row.id).update({ media_url: newUrl });
        updated += 1;
      }
    }

    // 2) Report master tables that contain image/file paths
    const reportMasterTables = [
      "report_cv",
      "report_avr",
      "report_ce",
      "report_machinery",
      "report_marine",
    ];

    for (const table of reportMasterTables) {
      const rows = await trx(table).select("*").where("order_id", orderId);
      await maybeUpdateTextColumns(trx, table, rows, "id", [
        "created_at",
        "updated_at",
      ]);
    }

    // 3) Flexible-field tables linked by report_id
    const reportFlexibleMappings = [
      { master: "report_cv", flex: "report_cv_flexible_fields" },
      { master: "report_avr", flex: "report_avr_flexible_fields" },
      { master: "report_ce", flex: "report_ce_flexible_fields" },
      { master: "report_machinery", flex: "report_machinery_flexible_fields" },
      { master: "report_marine", flex: "report_marine_flexible_fields" },
    ];

    for (const mapping of reportFlexibleMappings) {
      const reportIds = await trx(mapping.master)
        .select("id")
        .where("order_id", orderId);
      const ids = reportIds.map((r) => r.id);
      if (ids.length === 0) continue;

      const rows = await trx(mapping.flex).select("*").whereIn("report_id", ids);
      await maybeUpdateTextColumns(trx, mapping.flex, rows, "id", [
        "report_id",
        "created_at",
        "updated_at",
      ]);
    }
  });

  return { updated };
}

/**
 * Verify that every candidate exists on R2 with the size snapshotted at
 * upload time AND that the local file still matches that snapshot
 * (size + mtime). Returns { ok, missing: [...] }.
 */
async function verifyFilesOnR2(candidates) {
  const bucket = pickBucket();
  const missing = [];
  for (const c of candidates) {
    const key = toR2Key(c.filePath);

    // Local side: must still match the snapshot we took at upload.
    if (!fs.existsSync(c.filePath)) {
      missing.push({ key, reason: "local file missing", ...c });
      continue;
    }
    const stat = fs.statSync(c.filePath);
    if (stat.size !== c.size || stat.mtimeMs !== c.mtimeMs) {
      missing.push({
        key,
        reason: "local changed since upload",
        expectedSize: c.size,
        actualSize: stat.size,
        expectedMtime: c.mtimeMs,
        actualMtime: stat.mtimeMs,
      });
      continue;
    }

    // Remote side: must match snapshotted size and checksum.
    const remote = await getRemoteObjectInfo(bucket, key);
    if (remote.size !== c.size || remote.sha256 !== c.sha256) {
      missing.push({
        key,
        reason: "remote integrity mismatch",
        expectedSize: c.size,
        remoteSize: remote.size,
        expectedSha256: c.sha256,
        remoteSha256: remote.sha256,
      });
    }
  }
  return { ok: missing.length === 0, missing };
}

/**
 * Delete the given candidates one by one. Right before each unlink we
 * confirm THREE things:
 *   1. local file still exists and size+mtime match the upload snapshot
 *   2. R2 HEAD returns the same size as the snapshot
 *   3. unlink succeeds
 * If any check fails, the local file is kept and we continue.
 *
 * After deleting files, prune empty directories from the leaves up. Any
 * directory still containing other files (e.g. new uploads that arrived
 * during the sync) is left alone.
 *
 * Returns { deletedFiles, keptFiles: [{file, reason}] }.
 */
async function deleteLocalFilesAfterConfirm(candidates, folderRoots) {
  const bucket = pickBucket();
  const deletedFiles = [];
  const keptFiles = [];

  for (const c of candidates) {
    const { filePath } = c;
    try {
      if (!fs.existsSync(filePath)) continue;

      const stat = fs.statSync(filePath);
      if (stat.size !== c.size || stat.mtimeMs !== c.mtimeMs) {
        keptFiles.push({
          file: filePath,
          reason: "local file changed since upload snapshot",
        });
        continue;
      }

      const key = toR2Key(filePath);
      const remote = await getRemoteObjectInfo(bucket, key);
      if (remote.size !== c.size || remote.sha256 !== c.sha256) {
        keptFiles.push({
          file: filePath,
          reason: `final integrity mismatch (expectedSize=${c.size}, remoteSize=${remote.size}, expectedSha=${c.sha256}, remoteSha=${remote.sha256})`,
        });
        continue;
      }

      fs.unlinkSync(filePath);
      deletedFiles.push(filePath);
    } catch (err) {
      keptFiles.push({ file: filePath, reason: err.message });
    }
  }

  // Prune empty dirs bottom-up. Never touch anything non-empty.
  for (const root of folderRoots) {
    pruneEmptyDirs(root);
  }

  return { deletedFiles, keptFiles };
}

/**
 * Recursively remove empty directories starting from the leaves. A dir
 * containing even a single file is left alone.
 */
function pruneEmptyDirs(dir) {
  try {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        pruneEmptyDirs(path.join(dir, entry.name));
      }
    }
    const remaining = fs.readdirSync(dir);
    if (remaining.length === 0) {
      fs.rmdirSync(dir);
    }
  } catch (err) {
    console.warn(`[r2] pruneEmptyDirs error at ${dir}: ${err.message}`);
  }
}

/**
 * End-to-end sync for a single order. Never throws.
 */
async function syncOrderToR2(orderId) {
  const summary = {
    order_id: Number(orderId),
    ran: false,
    skipped_reason: null,
    folders: [],
    uploaded: 0,
    skipped: 0,
    failed: 0,
    db_urls_updated: 0,
    files_deleted: 0,
    files_kept: [],
    error: null,
  };

  let hasDistributedLock = false;
  if (syncInFlight.has(Number(orderId))) {
    summary.skipped_reason = "another sync already in flight for this order";
    console.warn(`[r2] ${summary.skipped_reason} (order_id=${orderId})`);
    await updateSyncStatus(orderId, {
      status: "running",
      message: "R2 transfer already running for this order",
    });
    return summary;
  }
  syncInFlight.add(Number(orderId));

  try {
    hasDistributedLock = await tryAcquireDistributedOrderLock(orderId);
    if (!hasDistributedLock) {
      summary.skipped_reason =
        "another sync already running on another server instance";
      await updateSyncStatus(orderId, {
        status: "running",
        message: summary.skipped_reason,
      });
      return summary;
    }

    await updateSyncStatus(orderId, {
      status: "running",
      message: "R2 transfer started",
      started_at: new Date(),
      completed_at: null,
      uploaded_count: 0,
      skipped_count: 0,
      failed_count: 0,
      deleted_count: 0,
    });

    if (!isSyncEnabled()) {
      summary.skipped_reason = "R2 sync disabled or misconfigured";
      await updateSyncStatus(orderId, {
        status: "stopped",
        message: summary.skipped_reason,
        completed_at: new Date(),
      });
      return summary;
    }

    const order = await db("orders")
      .select("id", "order_number", "current_status_id")
      .where("id", orderId)
      .first();

    if (!order) {
      summary.error = "order not found";
      await updateSyncStatus(orderId, {
        status: "failed",
        message: summary.error,
        completed_at: new Date(),
      });
      return summary;
    }

    const folders = findOrderFolders(order.order_number);
    summary.folders = folders;
    if (folders.length === 0) {
      summary.ran = true;
      summary.skipped_reason = "no local folder found for this order";
      await updateSyncStatus(orderId, {
        status: "completed",
        message: "No local files found, nothing to transfer",
        completed_at: new Date(),
      });
      return summary;
    }

    // ---------- Phase 1: Upload ----------
    const allCandidates = [];
    for (const folder of folders) {
      const res = await uploadFolderToR2(folder);
      summary.uploaded += res.uploaded;
      summary.skipped += res.skipped;
      summary.failed += res.failed.length;
      allCandidates.push(...res.candidates);

      await updateSyncStatus(orderId, {
        status: "running",
        message: "Uploading files to R2",
        uploaded_count: summary.uploaded,
        skipped_count: summary.skipped,
        failed_count: summary.failed,
      });
    }

    if (summary.failed > 0) {
      summary.ran = true;
      console.warn(
        `[r2] order=${order.order_number} had ${summary.failed} upload failure(s); local kept, DB not rewritten`
      );
      await updateSyncStatus(orderId, {
        status: "failed",
        message: `${summary.failed} file(s) failed during upload`,
        uploaded_count: summary.uploaded,
        skipped_count: summary.skipped,
        failed_count: summary.failed,
        completed_at: new Date(),
      });
      return summary;
    }

    // ---------- Phase 2: Independent verify pass ----------
    const verify = await verifyFilesOnR2(allCandidates);
    if (!verify.ok) {
      summary.failed += verify.missing.length;
      summary.ran = true;
      console.error(
        `[r2] verification failed for order=${order.order_number}, missing:`,
        verify.missing
      );
      await updateSyncStatus(orderId, {
        status: "failed",
        message: "Verification failed after upload",
        uploaded_count: summary.uploaded,
        skipped_count: summary.skipped,
        failed_count: summary.failed,
        completed_at: new Date(),
      });
      return summary;
    }

    // ---------- Phase 3: DB rewrite (transactional) ----------
    try {
      await updateSyncStatus(orderId, {
        status: "running",
        message: "Updating database URLs to R2",
      });
      const dbRes = await rewriteMediaUrlsForOrder(orderId);
      summary.db_urls_updated = dbRes.updated;
    } catch (err) {
      summary.error = `db rewrite failed: ${err.message}`;
      console.error(`[r2] DB rewrite failed for order=${order.order_number}:`, err);
      summary.ran = true;
      await updateSyncStatus(orderId, {
        status: "failed",
        message: summary.error,
        uploaded_count: summary.uploaded,
        skipped_count: summary.skipped,
        failed_count: summary.failed,
        completed_at: new Date(),
      });
      return summary; // DO NOT delete local if DB rewrite didn't succeed
    }

    // ---------- Phase 4: Per-file final confirm + delete ----------
    if (String(R2_DELETE_LOCAL_AFTER_UPLOAD).toLowerCase() === "true") {
      await updateSyncStatus(orderId, {
        status: "running",
        message: "Cleaning local files after final verification",
      });
      const del = await deleteLocalFilesAfterConfirm(allCandidates, folders);
      summary.files_deleted = del.deletedFiles.length;
      summary.files_kept = del.keptFiles;
      if (del.keptFiles.length > 0) {
        console.warn(
          `[r2] order=${order.order_number} kept ${del.keptFiles.length} local file(s) due to final-check issues:`,
          del.keptFiles
        );
      }
    }

    summary.ran = true;
    await updateSyncStatus(orderId, {
      status: "completed",
      message: "R2 transfer completed",
      uploaded_count: summary.uploaded,
      skipped_count: summary.skipped,
      failed_count: summary.failed,
      deleted_count: summary.files_deleted,
      completed_at: new Date(),
    });
    console.log(
      `[r2] sync done order=${order.order_number} uploaded=${summary.uploaded} skipped=${summary.skipped} db_urls_updated=${summary.db_urls_updated} files_deleted=${summary.files_deleted} files_kept=${summary.files_kept.length}`
    );
  } catch (err) {
    summary.error = err.message;
    console.error(`[r2] sync error order=${orderId}:`, err);
    await updateSyncStatus(orderId, {
      status: "failed",
      message: summary.error || "Unexpected sync error",
      uploaded_count: summary.uploaded,
      skipped_count: summary.skipped,
      failed_count: summary.failed,
      deleted_count: summary.files_deleted,
      completed_at: new Date(),
    });
  } finally {
    if (hasDistributedLock) {
      await releaseDistributedOrderLock(orderId);
    }
    syncInFlight.delete(Number(orderId));
  }

  return summary;
}

/**
 * Fire-and-forget wrapper used by controllers. Runs on next tick so the
 * HTTP response is not blocked.
 */
function triggerR2SyncIfNeeded(orderId, newStatusId) {
  const statusId = Number(newStatusId);
  if (!STATUSES_THAT_TRIGGER_SYNC.includes(statusId)) return;
  if (!orderId) return;

  setImmediate(async () => {
    try {
      await markSyncQueued(orderId);
      await syncOrderToR2(orderId);
    } catch (err) {
      console.error(`[r2] unexpected sync failure for order ${orderId}:`, err);
    }
  });
}

async function resumePendingR2SyncJobs() {
  if (!isSyncEnabled()) return;

  let resumable = [];
  try {
    resumable = await db(R2_SYNC_STATUS_TABLE)
      .select("order_id")
      .whereIn("status", ["queued", "running"])
      .orderBy("updated_at", "asc");
  } catch (err) {
    if (!isMissingStatusTableError(err)) throw err;
  }

  for (const row of resumable) {
    const orderId = Number(row.order_id);
    if (!orderId) continue;
    setImmediate(() => {
      syncOrderToR2(orderId).catch((err) => {
        console.error(`[r2] failed resuming order ${orderId}:`, err);
      });
    });
  }
}

module.exports = {
  STATUSES_THAT_TRIGGER_SYNC,
  isSyncEnabled,
  syncOrderToR2,
  triggerR2SyncIfNeeded,
  getOrderR2SyncStatus,
  resumePendingR2SyncJobs,
  uploadFolderToR2,
  rewriteMediaUrlsForOrder,
  findOrderFolders,
};
