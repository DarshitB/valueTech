/**
 * Bulk R2 sync for orders in a created_at date range (status 13 or 14 only).
 *
 * Usage:
 *   NODE_ENV=production node scripts/sync-r2-by-date.js --from 2025-01-01 --to 2025-03-31
 *   NODE_ENV=production node scripts/sync-r2-by-date.js --from 2025-01-01 --to 2025-03-31 --dry-run
 *   NODE_ENV=production node scripts/sync-r2-by-date.js --from 2025-01-01 --to 2025-03-31 --skip-completed
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const db = require("../db");
const {
  syncOrderToR2,
  isSyncEnabled,
  STATUSES_THAT_TRIGGER_SYNC,
} = require("../src/utils/r2Helper");

const R2_SYNC_STATUS_TABLE = "order_r2_sync_status";

function printUsage() {
  console.log(`
Usage:
  node scripts/sync-r2-by-date.js --from YYYY-MM-DD --to YYYY-MM-DD [options]

Options:
  --from            Start date (inclusive, server local midnight)
  --to              End date (inclusive, server local end of day)
  --dry-run         List matching orders only; do not sync
  --skip-completed  Skip orders whose R2 sync status is already "completed"
  --help            Show this help

Example (on VPS, from Backend folder):
  NODE_ENV=production node scripts/sync-r2-by-date.js --from 2025-01-01 --to 2025-03-31
`);
}

function parseArgs(argv) {
  const out = {
    from: null,
    to: null,
    dryRun: false,
    skipCompleted: false,
    help: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      out.help = true;
    } else if (arg === "--dry-run") {
      out.dryRun = true;
    } else if (arg === "--skip-completed") {
      out.skipCompleted = true;
    } else if (arg === "--from") {
      out.from = argv[++i];
    } else if (arg === "--to") {
      out.to = argv[++i];
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return out;
}

function parseDateInclusive(dateStr, endOfDay) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error(`Invalid date "${dateStr}". Use YYYY-MM-DD.`);
  }
  const suffix = endOfDay ? "T23:59:59.999" : "T00:00:00";
  const d = new Date(`${dateStr}${suffix}`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date "${dateStr}".`);
  }
  return d;
}

async function fetchOrdersInRange(fromDate, toDate) {
  return db("orders")
    .select("id", "order_number", "current_status_id", "created_at")
    .whereNull("deleted_at")
    .whereIn("current_status_id", STATUSES_THAT_TRIGGER_SYNC)
    .where("created_at", ">=", fromDate)
    .where("created_at", "<=", toDate)
    .orderBy("created_at", "asc");
}

async function fetchCompletedOrderIds(orderIds) {
  if (!orderIds.length) return new Set();

  let rows = [];
  try {
    rows = await db(R2_SYNC_STATUS_TABLE)
      .select("order_id")
      .whereIn("order_id", orderIds)
      .where("status", "completed");
  } catch (err) {
    if (!String(err.message || "").toLowerCase().includes("order_r2_sync_status")) {
      throw err;
    }
  }

  return new Set(rows.map((r) => Number(r.order_id)));
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  if (!args.from || !args.to) {
    printUsage();
    process.exit(1);
  }

  const fromDate = parseDateInclusive(args.from, false);
  const toDate = parseDateInclusive(args.to, true);

  if (fromDate > toDate) {
    throw new Error("--from must be on or before --to");
  }

  const env = process.env.NODE_ENV || "development";
  console.log(`Environment: ${env}`);
  console.log(`Date range (created_at): ${args.from} through ${args.to}`);

  if (!isSyncEnabled()) {
    console.error("R2 sync is disabled or misconfigured. Check R2_* env vars and R2_SYNC_ENABLED.");
    process.exit(1);
  }

  const orders = await fetchOrdersInRange(fromDate, toDate);
  console.log(`Found ${orders.length} order(s) with status 13 or 14 in range.`);

  let toProcess = orders;

  if (args.skipCompleted && orders.length > 0) {
    const completedIds = await fetchCompletedOrderIds(orders.map((o) => o.id));
    toProcess = orders.filter((o) => !completedIds.has(Number(o.id)));
    console.log(
      `Skipping ${orders.length - toProcess.length} already completed; ${toProcess.length} remaining.`
    );
  }

  if (args.dryRun) {
    for (const o of toProcess) {
      console.log(
        `[dry-run] id=${o.id} order_number=${o.order_number} status=${o.current_status_id} created_at=${o.created_at}`
      );
    }
    await db.destroy();
    process.exit(0);
  }

  if (toProcess.length === 0) {
    console.log("Nothing to sync.");
    await db.destroy();
    process.exit(0);
  }

  let ok = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const o = toProcess[i];
    const label = `${i + 1}/${toProcess.length} id=${o.id} ${o.order_number}`;
    console.log(`\n--- Syncing ${label} ---`);

    try {
      const summary = await syncOrderToR2(o.id);
      if (summary.error || summary.failed > 0) {
        failed++;
        console.log(`Result: FAILED`, summary);
      } else if (summary.skipped_reason && !summary.ran) {
        skipped++;
        console.log(`Result: SKIPPED`, summary.skipped_reason);
      } else {
        ok++;
        console.log(
          `Result: OK uploaded=${summary.uploaded} db_urls=${summary.db_urls_updated} deleted=${summary.files_deleted}`
        );
      }
    } catch (err) {
      failed++;
      console.error(`Result: ERROR`, err.message);
    }
  }

  console.log(`\nDone. ok=${ok} skipped=${skipped} failed=${failed}`);
  await db.destroy();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err.message || err);
  try {
    await db.destroy();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
