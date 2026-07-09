import { DATABASE_PROVIDER_IDS } from "./constants.js";
import { createProviderRegistry } from "./providerRegistry.js";

export function createDatabaseProviderRegistry(fetchers = {}) {
  const providers = [];

  if (typeof fetchers.bank === "function") {
    providers.push({
      id: DATABASE_PROVIDER_IDS.BANK,
      label: "Bank",
      fetchRecords: fetchers.bank,
      optionFields: { labelField: "name", valueField: "name" },
    });
  }

  if (typeof fetchers.branch === "function") {
    providers.push({
      id: DATABASE_PROVIDER_IDS.BRANCH,
      label: "Branch",
      fetchRecords: fetchers.branch,
      optionFields: { labelField: "name", valueField: "name" },
    });
  }

  if (typeof fetchers.state === "function") {
    providers.push({
      id: DATABASE_PROVIDER_IDS.STATE,
      label: "State",
      fetchRecords: fetchers.state,
      optionFields: { labelField: "name", valueField: "name" },
    });
  }

  if (typeof fetchers.city === "function") {
    providers.push({
      id: DATABASE_PROVIDER_IDS.CITY,
      label: "City",
      fetchRecords: fetchers.city,
      optionFields: { labelField: "name", valueField: "name" },
    });
  }

  if (typeof fetchers.officer === "function") {
    providers.push({
      id: DATABASE_PROVIDER_IDS.OFFICER,
      label: "Officer",
      fetchRecords: fetchers.officer,
      optionFields: { labelField: "name", valueField: "name" },
    });
  }

  if (typeof fetchers.category === "function") {
    providers.push({
      id: DATABASE_PROVIDER_IDS.CATEGORY,
      label: "Category",
      fetchRecords: fetchers.category,
      optionFields: { labelField: "name", valueField: "name" },
    });
  }

  if (typeof fetchers.assetCategory === "function") {
    providers.push({
      id: DATABASE_PROVIDER_IDS.ASSET_CATEGORY,
      label: "Asset Category",
      fetchRecords: fetchers.assetCategory,
      optionFields: { labelField: "name", valueField: "name" },
    });
  }

  if (typeof fetchers.subCategory === "function") {
    providers.push({
      id: DATABASE_PROVIDER_IDS.SUB_CATEGORY,
      label: "Sub Category",
      fetchRecords: fetchers.subCategory,
      optionFields: { labelField: "name", valueField: "name" },
    });
  }

  return createProviderRegistry(providers);
}
