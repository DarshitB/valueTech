import { IClipboardInterfaceService } from "@univerjs/ui";

/**
 * Univer's internal copy cache still succeeds when the browser rejects the
 * optional Clipboard API write. Avoid showing a misleading failure toast for
 * that recoverable browser-permission result.
 */
export function suppressClipboardPermissionWarning(univerAPI) {
  const injector = univerAPI?._injector;
  if (!injector?.get) {
    return () => {};
  }

  try {
    const clipboardService = injector.get(IClipboardInterfaceService);
    if (
      !clipboardService ||
      typeof clipboardService._showClipboardAuthenticationNotification !==
        "function"
    ) {
      return () => {};
    }

    const original =
      clipboardService._showClipboardAuthenticationNotification;
    const suppressed = () => {};
    clipboardService._showClipboardAuthenticationNotification = suppressed;

    return () => {
      if (
        clipboardService._showClipboardAuthenticationNotification ===
        suppressed
      ) {
        clipboardService._showClipboardAuthenticationNotification = original;
      }
    };
  } catch {
    return () => {};
  }
}
