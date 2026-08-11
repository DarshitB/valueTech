import { toast } from "react-toastify";
import { getReportEditLock } from "../api/orderReport.api";

export const MARINE_REPORT_TYPE = "report_marine";

/**
 * Pre-check before navigating into Marine report.
 * Returns true if the current user may enter; shows info toast and returns false if locked by someone else.
 */
export async function assertCanEnterMarineReport(orderId, currentUserId) {
  if (!orderId) return false;

  try {
    const res = await getReportEditLock(orderId, MARINE_REPORT_TYPE);
    const data = res?.data || {};

    if (
      data.locked &&
      currentUserId != null &&
      Number(data.user_id) !== Number(currentUserId)
    ) {
      const name = data.user_name || "Another user";
      toast.info(
        `${name} is already on this Marine report, so you cannot open it right now.`
      );
      return false;
    }

    return true;
  } catch (err) {
    // Fail open on status check errors so a flaky check does not block entry;
    // MarineReport still enforces acquire on mount.
    console.error("Marine report lock pre-check failed:", err);
    return true;
  }
}
