import {
  DATABASE_DROPDOWN_MENU_IDS,
} from "./constants.js";
import {
  applyDatabaseDropdownShell,
  clearDatabaseDropdownShell,
  syncDatabaseDropdownShell,
  repairExistingDatabaseDropdownShells,
  SHOW_DATA_VALIDATION_DROPDOWN_COMMAND_ID,
} from "./dataValidationShell.js";
import {
  DEBUG_DATABASE_DROPDOWN,
  clearDatabaseProviderId,
  getDatabaseProviderAt,
  getDatabaseProviderId,
  setDatabaseProviderId,
} from "./metadata.js";
import {
  openDatabaseDropdownForCell,
} from "./openDatabaseDropdown.js";
import { createSelectionAnchor } from "./selectionAnchor.js";

function registerDatabaseDropdownMenus(
  univerAPI,
  registry,
  onWorkbookDataChange,
  resolveRangeForMenuAction
) {
  if (
    typeof univerAPI.createSubmenu !== "function" ||
    typeof univerAPI.createMenu !== "function"
  ) {
    return;
  }

  const providerMenus = registry.list().map((provider) =>
    univerAPI.createMenu({
      id: `company.database-dropdown.${provider.id}`,
      title: provider.label,
      action: () => {
        const range = resolveRangeForMenuAction();
        if (!range) {
          if (DEBUG_DATABASE_DROPDOWN) {
            console.log(
              "[DatabaseDropdown] Bank/Branch click: no target range resolved"
            );
          }
          return;
        }

        const assigned = setDatabaseProviderId(range, provider.id);
        const shellApplied = applyDatabaseDropdownShell(univerAPI, range);

        if (assigned || shellApplied) {
          onWorkbookDataChange?.();
        }
      },
    })
  );

  const databaseDropdownSubmenu = univerAPI.createSubmenu({
    id: DATABASE_DROPDOWN_MENU_IDS.ROOT,
    title: "Database Dropdown",
    order: 1200,
  });

  providerMenus.forEach((menu) => {
    databaseDropdownSubmenu.addSubmenu(menu);
  });

  databaseDropdownSubmenu.appendTo(["contextMenu.mainArea", "contextMenu.others"]);

  univerAPI
    .createMenu({
      id: DATABASE_DROPDOWN_MENU_IDS.REMOVE,
      title: "Remove Database Dropdown",
      order: 1201,
      action: () => {
        const range = resolveRangeForMenuAction();
        if (!range) {
          return;
        }

        const cleared = clearDatabaseProviderId(range);
        const shellCleared = clearDatabaseDropdownShell(range);

        if (cleared || shellCleared) {
          onWorkbookDataChange?.();
        }
      },
    })
    .appendTo(["contextMenu.mainArea", "contextMenu.others"]);
}

function createActiveDropdownController() {
  let activeDropdownDisposable = null;

  return {
    disposeActiveDropdown: () => {
      activeDropdownDisposable?.dispose?.();
      activeDropdownDisposable = null;
    },
    setActiveDropdownDisposable: (disposable) => {
      activeDropdownDisposable = disposable;
    },
    dispose: () => {
      activeDropdownDisposable?.dispose?.();
      activeDropdownDisposable = null;
    },
  };
}

function attachDatabaseDropdownOpenHandlers(
  univerAPI,
  registry,
  onWorkbookDataChange,
  dropdownController
) {
  const disposables = [];

  const openAt = async ({ workbook, worksheet, row, column }) => {
    const providerId =
      getDatabaseProviderAt(worksheet, row, column) ??
      getDatabaseProviderId(worksheet.getRange(row, column));

    if (!providerId) {
      return false;
    }

    const range = worksheet.getRange(row, column);
    syncDatabaseDropdownShell(univerAPI, range);

    return openDatabaseDropdownForCell({
      univerAPI,
      workbook,
      worksheet,
      row,
      column,
      providerId,
      registry,
      onWorkbookDataChange,
      disposeActiveDropdown: dropdownController.disposeActiveDropdown,
      setActiveDropdownDisposable: dropdownController.setActiveDropdownDisposable,
    });
  };

  if (univerAPI?.addEvent && univerAPI?.Event?.BeforeCommandExecute) {
    disposables.push(
      univerAPI.addEvent(univerAPI.Event.BeforeCommandExecute, (event) => {
        if (event.id !== SHOW_DATA_VALIDATION_DROPDOWN_COMMAND_ID) {
          return;
        }

        const { unitId, subUnitId, row, column } = event.params ?? {};
        if (
          unitId == null ||
          subUnitId == null ||
          row == null ||
          column == null
        ) {
          return;
        }

        const workbook = univerAPI.getActiveWorkbook?.();
        if (!workbook || workbook.getId?.() !== unitId) {
          return;
        }

        const worksheet = workbook.getSheetBySheetId?.(subUnitId);
        if (!worksheet) {
          return;
        }

        const providerId = getDatabaseProviderAt(worksheet, row, column);
        if (!providerId || !registry.has(providerId)) {
          return;
        }

        event.cancel = true;

        void openAt({
          workbook,
          worksheet,
          row,
          column,
        });
      })
    );
  }

  if (univerAPI?.addEvent && univerAPI?.Event?.SheetEditStarted) {
    disposables.push(
      univerAPI.addEvent(univerAPI.Event.SheetEditStarted, (params) => {
        const { workbook, worksheet, row, column } = params ?? {};
        if (!workbook || !worksheet) {
          return;
        }

        void openAt({
          workbook,
          worksheet,
          row,
          column,
        });
      })
    );
  }

  return () => {
    disposables.forEach((disposable) => disposable?.dispose?.());
  };
}

/**
 * Register Database Dropdown context-menu items and edit-time dropdown behavior.
 * Does not modify workbook sync, autosave, or realtime layers.
 */
export function installDatabaseDropdown(univerAPI, options = {}) {
  const { registry, onWorkbookDataChange } = options;

  if (!univerAPI || !registry || registry.list().length === 0) {
    return () => {};
  }

  const selectionAnchor = createSelectionAnchor(univerAPI);
  const dropdownController = createActiveDropdownController();
  const setupDisposables = [];

  if (univerAPI?.addEvent && univerAPI?.Event?.WorkbookCreated) {
    setupDisposables.push(
      univerAPI.addEvent(univerAPI.Event.WorkbookCreated, () => {
        repairExistingDatabaseDropdownShells(
          univerAPI,
          univerAPI.getActiveWorkbook?.()
        );
      })
    );
  } else {
    repairExistingDatabaseDropdownShells(
      univerAPI,
      univerAPI.getActiveWorkbook?.()
    );
  }

  registerDatabaseDropdownMenus(
    univerAPI,
    registry,
    onWorkbookDataChange,
    selectionAnchor.resolveRangeForMenuAction
  );

  const disposeOpenHandlers = attachDatabaseDropdownOpenHandlers(
    univerAPI,
    registry,
    onWorkbookDataChange,
    dropdownController
  );

  return () => {
    setupDisposables.forEach((disposable) => disposable?.dispose?.());
    disposeOpenHandlers?.();
    dropdownController.dispose();
    selectionAnchor.dispose();
  };
}
