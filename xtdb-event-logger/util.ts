import crypto from "node:crypto";

/**
 * Generate a UUIDv4 string.
 */
export function uuid(): string {
  return crypto.randomUUID();
}

/**
 * Truncate a string to maxLen characters.
 * Appends "…[truncated]" marker if truncation occurred.
 */
export function trunc(value: string, maxLen: number): string {
  if (value.length <= maxLen) return value;
  const marker = "…[truncated]";
  return value.slice(0, maxLen - marker.length) + marker;
}

/**
 * Safely measure the JSON byte length of an unknown value.
 * Returns 0 if serialization fails.
 */
export function safeJsonSize(value: unknown): number {
  try {
    return JSON.stringify(value ?? {}).length;
  } catch {
    return 0;
  }
}
