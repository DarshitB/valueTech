import { getBanks } from "../../api/bank.api";
import { getBranches } from "../../api/bankBranch.api";

/**
 * API fetchers for spreadsheet Database Dropdown providers.
 * Responses are cached in memory inside the spreadsheet wrapper.
 */
export const databaseDropdownFetchers = {
  bank: async () => (await getBanks()).data,
  branch: async () => (await getBranches()).data,
};
