import { ExerciseCatalogValidationError } from "./catalog-error";

export function requiredKey(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 80 ||
    value.trim() !== value ||
    !/^[a-z][a-z0-9_-]*$/.test(value)
  ) {
    throw new ExerciseCatalogValidationError(label + " is invalid.");
  }
  return value;
}

export function requiredIdentifier(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    unicodeLength(value) < 1 ||
    unicodeLength(value) > 200 ||
    value.trim() !== value ||
    value.includes("\0")
  ) {
    throw new ExerciseCatalogValidationError(label + " is invalid.");
  }
  return value;
}

export function requiredText(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): string {
  if (typeof value !== "string") {
    throw new ExerciseCatalogValidationError(label + " must be text.");
  }
  const normalized = value.trim();
  const normalizedLength = unicodeLength(normalized);
  if (
    normalized.includes("\0") ||
    normalizedLength < minimum ||
    normalizedLength > maximum
  ) {
    throw new ExerciseCatalogValidationError(label + " has invalid length.");
  }
  return normalized;
}

export function optionalText(
  value: unknown,
  label: string,
  maximum: number,
): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new ExerciseCatalogValidationError(label + " must be text.");
  }
  const normalized = value.trim();
  const normalizedLength = unicodeLength(normalized);
  if (normalizedLength === 0) return null;
  if (normalized.includes("\0") || normalizedLength > maximum) {
    throw new ExerciseCatalogValidationError(label + " is too long.");
  }
  return normalized;
}

function unicodeLength(value: string): number {
  return Array.from(value).length;
}
