let fallbackSequence = 0;

export function createSpreadsheetRequestId(prefix = "request") {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}:${globalThis.crypto.randomUUID()}`;
  }

  fallbackSequence += 1;
  return `${prefix}:${Date.now()}:${fallbackSequence}`;
}
