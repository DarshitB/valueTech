import { useEffect, useRef } from "react";

const UNSAVED_CHANGES_MESSAGE =
  "You have unsaved changes. Leave without saving?";

const SAVE_IN_PROGRESS_MESSAGE =
  "A save is still in progress. Leave without saving?";

/**
 * Blocks accidental navigation while a spreadsheet has unsaved changes
 * or while a save request is in flight.
 *
 * Covers browser refresh/close (beforeunload) and in-app navigation
 * (React Router links, programmatic navigation, browser back/forward).
 */
export function useSpreadsheetUnsavedNavigationGuard({
  shouldBlockNavigation,
  isSavingInProgress = false,
}) {
  const shouldBlockNavigationRef = useRef(shouldBlockNavigation);
  const isSavingInProgressRef = useRef(isSavingInProgress);
  const allowNavigationRef = useRef(false);

  shouldBlockNavigationRef.current = shouldBlockNavigation;
  isSavingInProgressRef.current = isSavingInProgress;

  useEffect(() => {
    if (!shouldBlockNavigation) {
      return undefined;
    }

    const handleBeforeUnload = (event) => {
      if (allowNavigationRef.current) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [shouldBlockNavigation]);

  useEffect(() => {
    if (!shouldBlockNavigation) {
      return undefined;
    }

    const originalPushState = window.history.pushState.bind(window.history);

    const confirmLeave = () => {
      const message = isSavingInProgressRef.current
        ? SAVE_IN_PROGRESS_MESSAGE
        : UNSAVED_CHANGES_MESSAGE;
      const shouldLeave = window.confirm(message);
      if (shouldLeave) {
        allowNavigationRef.current = true;
      }
      return shouldLeave;
    };

    originalPushState(null, "", window.location.href);

    window.history.pushState = function pushStateInterceptor(state, title, url) {
      if (allowNavigationRef.current || !shouldBlockNavigationRef.current) {
        return originalPushState(state, title, url);
      }

      if (!confirmLeave()) {
        return;
      }

      originalPushState(state, title, url);
      window.dispatchEvent(new PopStateEvent("popstate", { state }));
    };

    const handlePopState = () => {
      if (allowNavigationRef.current || !shouldBlockNavigationRef.current) {
        return;
      }

      originalPushState(null, "", window.location.href);

      if (confirmLeave()) {
        window.history.back();
      }
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.history.pushState = originalPushState;
      window.removeEventListener("popstate", handlePopState);
      allowNavigationRef.current = false;
    };
  }, [shouldBlockNavigation]);
}
