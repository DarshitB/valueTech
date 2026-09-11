import { useCallback, useEffect, useState } from "react";
import { useSpreadsheetRealtime } from "../realtime/spreadsheet";
import { getSpreadsheetCollaborationConfig } from "../realtime/spreadsheet/collaborationConfig";
import {
  cellLeaseKey,
  DEFAULT_CELL_LEASE_TTL_MS,
  isRemoteLeaseBlocking,
} from "../realtime/spreadsheet/cellLease";

function readExpiresAt(payload, previousExpiresAt) {
  const expiresAt = Number(payload?.expires_at);
  if (Number.isFinite(expiresAt) && expiresAt > 0) {
    return expiresAt;
  }
  if (Number.isFinite(previousExpiresAt) && previousExpiresAt > 0) {
    return previousExpiresAt;
  }
  return Date.now() + DEFAULT_CELL_LEASE_TTL_MS;
}

export function useSpreadsheetCellLeases() {
  const { socket, spreadsheetId } = useSpreadsheetRealtime();
  const enabled = getSpreadsheetCollaborationConfig().cellLeasesEnabled;
  const [leasesByKey, setLeasesByKey] = useState(() => new Map());

  useEffect(() => {
    if (!enabled || !socket || !spreadsheetId) {
      setLeasesByKey(new Map());
      return undefined;
    }

    const upsert = (payload = {}) => {
      if (payload.spreadsheet_id !== spreadsheetId) return;
      if (
        typeof payload.worksheet_id !== "string" ||
        !Number.isInteger(payload.row) ||
        !Number.isInteger(payload.column)
      ) {
        return;
      }

      const key = cellLeaseKey(
        payload.worksheet_id,
        payload.row,
        payload.column
      );
      setLeasesByKey((current) => {
        const next = new Map(current);
        if (
          payload.state === "released" ||
          payload.state === "expired" ||
          payload.state === "invalidated"
        ) {
          next.delete(key);
          return next;
        }
        const existing = current.get(key);
        next.set(key, {
          userId: payload.userId,
          userName: payload.userName,
          worksheetId: payload.worksheet_id,
          row: payload.row,
          column: payload.column,
          state: payload.state,
          preview: existing?.preview || "",
          expiresAt: readExpiresAt(payload, existing?.expiresAt),
        });
        return next;
      });
    };

    const handleDraft = (payload = {}) => {
      if (payload.spreadsheet_id !== spreadsheetId) return;
      if (
        typeof payload.worksheet_id !== "string" ||
        !Number.isInteger(payload.row) ||
        !Number.isInteger(payload.column)
      ) {
        return;
      }
      const key = cellLeaseKey(
        payload.worksheet_id,
        payload.row,
        payload.column
      );
      setLeasesByKey((current) => {
        const existing = current.get(key);
        if (!existing) return current;
        const next = new Map(current);
        next.set(key, {
          ...existing,
          preview:
            typeof payload.preview === "string" ? payload.preview : "",
        });
        return next;
      });
    };

    socket.on("spreadsheet:lease", upsert);
    socket.on("spreadsheet:draft-preview", handleDraft);
    return () => {
      socket.off("spreadsheet:lease", upsert);
      socket.off("spreadsheet:draft-preview", handleDraft);
    };
  }, [enabled, socket, spreadsheetId]);

  useEffect(() => {
    if (!enabled) return undefined;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setLeasesByKey((current) => {
        let changed = false;
        const next = new Map();
        current.forEach((lease, key) => {
          if (Number.isFinite(lease.expiresAt) && lease.expiresAt <= now) {
            changed = true;
            return;
          }
          next.set(key, lease);
        });
        return changed ? next : current;
      });
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [enabled]);

  const isCellEditBlocked = useCallback(
    (location) => {
      if (!enabled) return false;
      return isRemoteLeaseBlocking(
        leasesByKey,
        location,
        location?.currentUserId
      );
    },
    [enabled, leasesByKey]
  );

  return { leasesByKey, isCellEditBlocked, cellLeasesEnabled: enabled };
}
