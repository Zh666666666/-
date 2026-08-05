const encoder = new TextEncoder();

export const maxRawJsonBytes = 32 * 1024;

export function isJsonWithinBytes(value: unknown, maxBytes = maxRawJsonBytes) {
  if (value === undefined) return true;
  try {
    const serialized = JSON.stringify(value);
    return serialized !== undefined && encoder.encode(serialized).byteLength <= maxBytes;
  } catch {
    return false;
  }
}
