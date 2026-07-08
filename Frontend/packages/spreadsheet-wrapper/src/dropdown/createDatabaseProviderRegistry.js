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

  return createProviderRegistry(providers);
}
