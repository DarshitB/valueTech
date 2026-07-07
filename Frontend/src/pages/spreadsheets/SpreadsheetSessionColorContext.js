import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSpreadsheetPresence } from "../../hooks/useSpreadsheetPresence";
import { useSpreadsheetRealtime } from "../../realtime/spreadsheet";
import { buildUserIdentity } from "./spreadsheetPresenceColors";
import {
  compareUserIds,
  createSpreadsheetSessionColorRegistry,
} from "./spreadsheetSessionColorRegistry";
import {
  loadSessionColorSnapshot,
  saveSessionColorSnapshot,
} from "./spreadsheetSessionColorStorage";

const FALLBACK_IDENTITY_COLOR = "#6b7280";

const SpreadsheetSessionColorContext = createContext({
  getUserIdentity: (userId, userName = "", initials = null) =>
    buildUserIdentity(FALLBACK_IDENTITY_COLOR, userName, initials),
});

function buildOnlineUsersSignature(onlineUsers = []) {
  const userIds = onlineUsers
    .map((user) => String(user?.userId ?? "").trim())
    .filter(Boolean);

  userIds.sort(compareUserIds);
  return userIds.join("\n");
}

/**
 * Single source of truth for per-session presence colors.
 * Must render inside SpreadsheetRealtimeProvider.
 *
 * Persistence lifecycle:
 *   Restore on spreadsheet mount → sync with presence → persist only when the
 *   registry snapshot changes → persist again on unmount if needed.
 */
export function SpreadsheetSessionColorProvider({ children }) {
  const { spreadsheetId } = useSpreadsheetRealtime();
  const onlineUsers = useSpreadsheetPresence();
  const registryRef = useRef(null);
  const spreadsheetIdRef = useRef(spreadsheetId);
  const onlineUsersSignatureRef = useRef("");
  const lastPersistedSnapshotSignatureRef = useRef("");
  const [assignmentVersion, setAssignmentVersion] = useState(0);

  if (!registryRef.current) {
    registryRef.current = createSpreadsheetSessionColorRegistry();
  }

  const onlineUsersSignature = useMemo(
    () => buildOnlineUsersSignature(onlineUsers),
    [onlineUsers]
  );

  const persistRegistrySnapshotIfChanged = useCallback(() => {
    if (!spreadsheetIdRef.current) {
      return false;
    }

    const registry = registryRef.current;
    const snapshot = registry.toSnapshot();
    const snapshotSignature = registry.getSnapshotSignature();

    if (snapshotSignature === lastPersistedSnapshotSignatureRef.current) {
      return false;
    }

    saveSessionColorSnapshot(spreadsheetIdRef.current, snapshot);
    lastPersistedSnapshotSignatureRef.current = snapshotSignature;
    return true;
  }, []);

  const handleRegistryPersist = useCallback(() => {
    persistRegistrySnapshotIfChanged();
  }, [persistRegistrySnapshotIfChanged]);

  const applySyncResult = useCallback(
    (syncResult) => {
      if (syncResult.snapshotChanged) {
        persistRegistrySnapshotIfChanged();
      }

      if (syncResult.onlineAssignmentsChanged) {
        setAssignmentVersion((version) => version + 1);
      }
    },
    [persistRegistrySnapshotIfChanged]
  );

  // Spreadsheet switch: restore sessionStorage snapshot for this sheet only.
  useEffect(() => {
    spreadsheetIdRef.current = spreadsheetId;
    const registry = registryRef.current;

    registry.reset();
    onlineUsersSignatureRef.current = "";
    lastPersistedSnapshotSignatureRef.current = "";

    if (!spreadsheetId) {
      setAssignmentVersion(0);
      return undefined;
    }

    const snapshot = loadSessionColorSnapshot(spreadsheetId);
    if (snapshot) {
      registry.restoreFromSnapshot(snapshot);
      lastPersistedSnapshotSignatureRef.current =
        registry.getSnapshotSignature();
    }

    registry.setPersistHandler(handleRegistryPersist);

    return () => {
      registry.setPersistHandler(null);
      persistRegistrySnapshotIfChanged();
      registry.reset();
    };
  }, [spreadsheetId, handleRegistryPersist, persistRegistrySnapshotIfChanged]);

  // Presence updates: sync only when the normalized online-user set changes.
  useEffect(() => {
    if (!spreadsheetId) {
      return;
    }

    if (onlineUsersSignature === onlineUsersSignatureRef.current) {
      return;
    }

    onlineUsersSignatureRef.current = onlineUsersSignature;
    applySyncResult(registryRef.current.syncOnlineUsers(onlineUsers));
  }, [spreadsheetId, onlineUsers, onlineUsersSignature, applySyncResult]);

  const getUserIdentity = useCallback(
    (userId, userName = "", initials = null) => {
      const sessionColor =
        registryRef.current.getColorForUser(userId) || FALLBACK_IDENTITY_COLOR;

      return buildUserIdentity(sessionColor, userName, initials);
    },
    [assignmentVersion]
  );

  const value = useMemo(
    () => ({
      getUserIdentity,
    }),
    [getUserIdentity]
  );

  return (
    <SpreadsheetSessionColorContext.Provider value={value}>
      {children}
    </SpreadsheetSessionColorContext.Provider>
  );
}

export function useSpreadsheetSessionColors() {
  return useContext(SpreadsheetSessionColorContext);
}
