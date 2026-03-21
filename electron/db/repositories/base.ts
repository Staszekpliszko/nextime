import crypto from 'crypto';

/**
 * Generuje UUID v4 do użycia jako PRIMARY KEY.
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Konwertuje SQLite INTEGER (0/1) na boolean.
 */
export function toBool(value: number | null | undefined): boolean {
  return value === 1;
}

/**
 * Konwertuje boolean na SQLite INTEGER (0/1).
 */
export function fromBool(value: boolean): number {
  return value ? 1 : 0;
}

/**
 * Parsuje JSON z TEXT pola SQLite. Zwraca fallback jeśli null/undefined.
 */
export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (value == null) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/**
 * Serializuje obiekt do JSON string.
 */
export function toJson(value: unknown): string {
  return JSON.stringify(value);
}
