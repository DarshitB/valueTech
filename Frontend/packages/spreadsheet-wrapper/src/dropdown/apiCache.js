const providerOptionsCache = new Map();

export function getCachedProviderOptions(providerId, fetchOptions) {
  if (!providerId || typeof fetchOptions !== "function") {
    return Promise.resolve([]);
  }

  const cached = providerOptionsCache.get(providerId);
  if (cached) {
    return Promise.resolve(cached);
  }

  return Promise.resolve()
    .then(() => fetchOptions())
    .then((options) => {
      const normalized = Array.isArray(options) ? options : [];
      providerOptionsCache.set(providerId, normalized);
      return normalized;
    })
    .catch(() => []);
}

export function clearProviderOptionsCache(providerId) {
  if (providerId) {
    providerOptionsCache.delete(providerId);
    return;
  }

  providerOptionsCache.clear();
}
