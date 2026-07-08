import { getCachedProviderOptions } from "./apiCache.js";

export function mapRecordsToDropdownOptions(
  records,
  { labelField = "name", valueField = "name" } = {}
) {
  if (!Array.isArray(records)) {
    return [];
  }

  return records
    .map((record) => {
      const label = String(record?.[labelField] ?? "").trim();
      if (!label) {
        return null;
      }

      const value = String(record?.[valueField] ?? label).trim();
      return {
        label,
        value,
        // Univer list dropdown treats missing color as dark → white text on light UI.
        color: "transparent",
      };
    })
    .filter(Boolean);
}

export function createProviderRegistry(providers = []) {
  const registry = new Map();

  providers.forEach((provider) => {
    if (!provider?.id) {
      return;
    }

    registry.set(provider.id, provider);
  });

  return {
    list() {
      return Array.from(registry.values());
    },

    get(providerId) {
      return registry.get(providerId) ?? null;
    },

    has(providerId) {
      return registry.has(providerId);
    },

    async fetchDropdownOptions(providerId) {
      const provider = registry.get(providerId);
      if (!provider) {
        return [];
      }

      const records = await getCachedProviderOptions(
        providerId,
        provider.fetchRecords
      );

      if (typeof provider.mapOptions === "function") {
        return provider.mapOptions(records);
      }

      const options = mapRecordsToDropdownOptions(
        records,
        provider.optionFields
      );

      return options;
    },
  };
}
