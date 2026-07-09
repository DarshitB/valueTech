import { getBanks } from "../../api/bank.api";
import { getBranches } from "../../api/bankBranch.api";
import { getStates } from "../../api/state.api";
import { getCities } from "../../api/city.api";
import { getOfficers } from "../../api/officers.api";
import { getCategories } from "../../api/category.api";
import { getSubCategories } from "../../api/subcategory.api";
import { getChildCategories } from "../../api/childCategory.api";

/**
 * API fetchers for spreadsheet Database Dropdown providers.
 * Responses are cached in memory inside the spreadsheet wrapper.
 */
export const databaseDropdownFetchers = {
  bank: async () => (await getBanks()).data,
  branch: async () => (await getBranches()).data,
  state: async () => (await getStates()).data,
  city: async () => (await getCities()).data,
  officer: async () => (await getOfficers()).data,
  category: async () => (await getCategories()).data,
  assetCategory: async () => (await getSubCategories()).data,
  subCategory: async () => (await getChildCategories()).data,
};
