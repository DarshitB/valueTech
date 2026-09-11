import { DesktopConfirmService } from "@univerjs/ui";

export const REMOVE_SHEET_CONFIRM_COMMAND_ID =
  "sheet.command.remove-sheet-confirm";
export const REMOVE_SHEET_CONFIRM_DIALOG_ID = "sheet.confirm.remove-sheet";

const DEFAULT_DELETE_SHEET_MESSAGE = "Confirm to delete this worksheet?";
const LARGE_DELETE_SHEET_SNIPPET = "will not be retrieved";

export function buildDeleteWorksheetConfirmMessage(originalTitle, sheetName) {
  const name = typeof sheetName === "string" ? sheetName.trim() : "";
  if (!name) {
    return originalTitle;
  }

  const original =
    typeof originalTitle === "string" ? originalTitle.trim() : "";
  if (original.includes(LARGE_DELETE_SHEET_SNIPPET)) {
    return `Confirm to delete "${name}"? It will not be retrieved after deletion. Are you sure you want to delete it?`;
  }

  return `Confirm to delete "${name}"?`;
}

function readSheetName(sheet) {
  if (!sheet) {
    return "";
  }
  const name = sheet.getSheetName?.() || sheet.getName?.();
  return typeof name === "string" ? name.trim() : "";
}

export function resolveWorksheetName(univerAPI, subUnitId) {
  const workbook = univerAPI?.getActiveWorkbook?.();
  if (!workbook) {
    return "";
  }

  const requestedId =
    typeof subUnitId === "string" && subUnitId.trim() ? subUnitId.trim() : "";
  const sheet =
    (requestedId && workbook.getSheetBySheetId?.(requestedId)) ||
    workbook.getActiveSheet?.();
  return readSheetName(sheet);
}

function isConfirmService(value) {
  return Boolean(
    value &&
      typeof value.confirm === "function" &&
      value.confirmOptions$ &&
      typeof value.confirmOptions$.subscribe === "function"
  );
}

function findConfirmService(injector) {
  const collection = injector?.resolvedDependencyCollection;
  const resolved = collection?.resolvedDependencies;
  if (!resolved || typeof resolved.values !== "function") {
    return null;
  }

  for (const items of resolved.values()) {
    const list = Array.isArray(items) ? items : [items];
    for (const item of list) {
      if (isConfirmService(item)) {
        return item;
      }
    }
  }
  return null;
}

function rewriteConfirmParams(params, univerAPI, pendingSubUnitIdRef) {
  if (params?.id !== REMOVE_SHEET_CONFIRM_DIALOG_ID) {
    return params;
  }

  const originalTitle = params?.children?.title;
  if (
    typeof originalTitle === "string" &&
    /^Confirm to delete "/.test(originalTitle.trim())
  ) {
    return params;
  }

  const sheetName = resolveWorksheetName(
    univerAPI,
    pendingSubUnitIdRef.current
  );
  pendingSubUnitIdRef.current = null;
  const nextTitle = buildDeleteWorksheetConfirmMessage(
    originalTitle,
    sheetName
  );
  if (!nextTitle || nextTitle === originalTitle) {
    return params;
  }

  return {
    ...params,
    children: {
      ...(params.children && typeof params.children === "object"
        ? params.children
        : {}),
      title: nextTitle,
    },
  };
}

function wrapConfirmMethod(confirmService, univerAPI, pendingSubUnitIdRef) {
  if (!confirmService || confirmService.__namedDeleteSheetConfirm) {
    return () => {};
  }

  const originalConfirm = confirmService.confirm.bind(confirmService);
  const namedConfirm = (params) =>
    originalConfirm(
      rewriteConfirmParams(params, univerAPI, pendingSubUnitIdRef)
    );
  confirmService.confirm = namedConfirm;
  confirmService.__namedDeleteSheetConfirm = true;

  return () => {
    if (confirmService.confirm === namedConfirm) {
      confirmService.confirm = originalConfirm;
    }
    delete confirmService.__namedDeleteSheetConfirm;
  };
}

function capturePendingSheetId(command, pendingSubUnitIdRef) {
  if (String(command?.id ?? "") !== REMOVE_SHEET_CONFIRM_COMMAND_ID) {
    return;
  }
  pendingSubUnitIdRef.current =
    typeof command?.params?.subUnitId === "string"
      ? command.params.subUnitId
      : null;
}

function rewriteDialogDom(root, sheetName) {
  const name = typeof sheetName === "string" ? sheetName.trim() : "";
  if (!name || !root?.querySelectorAll) {
    return;
  }

  root.querySelectorAll("*").forEach((node) => {
    if (node.childNodes.length !== 1 || node.firstChild?.nodeType !== 3) {
      return;
    }
    const text = String(node.textContent || "").trim();
    if (text === DEFAULT_DELETE_SHEET_MESSAGE) {
      node.textContent = `Confirm to delete "${name}"?`;
      return;
    }
    if (text.includes(LARGE_DELETE_SHEET_SNIPPET) && text.includes("worksheet")) {
      node.textContent = buildDeleteWorksheetConfirmMessage(text, name);
    }
  });
}

/**
 * Puts the worksheet tab name into Univer's delete-sheet confirm dialog.
 */
export function installDeleteSheetConfirmName(univerAPI, overrides = {}) {
  if (!univerAPI) {
    return () => {};
  }

  const pendingSubUnitIdRef = { current: null };
  const disposers = [];

  const commandService =
    overrides.commandService || univerAPI._commandService || null;
  if (commandService?.beforeCommandExecuted) {
    const disposable = commandService.beforeCommandExecuted((command) => {
      capturePendingSheetId(command, pendingSubUnitIdRef);
    });
    disposers.push(() => disposable?.dispose?.());
  } else if (typeof commandService?.executeCommand === "function") {
    const originalExecute = commandService.executeCommand.bind(commandService);
    commandService.executeCommand = (id, params, options) => {
      capturePendingSheetId({ id, params }, pendingSubUnitIdRef);
      return originalExecute(id, params, options);
    };
    disposers.push(() => {
      commandService.executeCommand = originalExecute;
    });
  }

  if (typeof univerAPI.addEvent === "function" && univerAPI.Event?.BeforeCommandExecute) {
    const disposable = univerAPI.addEvent(
      univerAPI.Event.BeforeCommandExecute,
      (event) => {
        capturePendingSheetId(event, pendingSubUnitIdRef);
      }
    );
    disposers.push(() => disposable?.dispose?.());
  }

  const proto = DesktopConfirmService?.prototype;
  if (proto && typeof proto.confirm === "function" && !proto.__namedDeleteSheetConfirmProto) {
    const originalProtoConfirm = proto.confirm;
    proto.confirm = function namedDeleteSheetConfirm(params) {
      return originalProtoConfirm.call(
        this,
        rewriteConfirmParams(params, univerAPI, pendingSubUnitIdRef)
      );
    };
    proto.__namedDeleteSheetConfirmProto = true;
    disposers.push(() => {
      if (proto.confirm !== originalProtoConfirm) {
        proto.confirm = originalProtoConfirm;
      }
      delete proto.__namedDeleteSheetConfirmProto;
    });
  }

  const confirmService =
    overrides.confirmService ||
    findConfirmService(univerAPI._injector);
  disposers.push(
    wrapConfirmMethod(confirmService, univerAPI, pendingSubUnitIdRef)
  );

  if (
    typeof MutationObserver === "function" &&
    typeof document !== "undefined" &&
    document.body
  ) {
    const observer = new MutationObserver(() => {
      const sheetName = resolveWorksheetName(
        univerAPI,
        pendingSubUnitIdRef.current
      );
      rewriteDialogDom(document.body, sheetName);
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    disposers.push(() => observer.disconnect());
  }

  return () => {
    disposers.forEach((dispose) => dispose());
  };
}
