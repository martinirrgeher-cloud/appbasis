const MAX_PRIVATE_VIDEO_BYTES = 100 * 1024 * 1024;

export const ULC_EXERCISE_CATALOG_PRIVATE_VIDEO_MAX_BYTES =
  MAX_PRIVATE_VIDEO_BYTES;

export interface UlcExerciseCatalogStoredObject {
  readonly body: ReadableStream<Uint8Array> | ArrayBuffer | Uint8Array;
  readonly size?: number;
  readonly httpEtag?: string;
  readonly range?: { readonly offset?: number; readonly length?: number };
}

export interface UlcExerciseCatalogObjectStore {
  put(
    key: string,
    value: ArrayBuffer | Uint8Array,
    options?: {
      readonly httpMetadata?: { readonly contentType?: string };
      readonly customMetadata?: Readonly<Record<string, string>>;
    },
  ): PromiseLike<unknown>;
  get(
    key: string,
    options?: { readonly range?: Headers },
  ): PromiseLike<UlcExerciseCatalogStoredObject | null>;
  delete(key: string): PromiseLike<unknown>;
}

export function resolveUlcExerciseCatalogObjectStore(
  value: unknown,
): UlcExerciseCatalogObjectStore | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const candidate = value as Partial<UlcExerciseCatalogObjectStore>;
  return typeof candidate.put === "function" &&
    typeof candidate.get === "function" &&
    typeof candidate.delete === "function"
    ? (candidate as UlcExerciseCatalogObjectStore)
    : null;
}

export function privateExerciseVideoStorageKey(
  organizationId: string,
  exerciseId: string,
  mediaId: string,
): string {
  return [
    "exercise-catalog",
    safeSegment(organizationId),
    safeSegment(exerciseId),
    safeSegment(mediaId),
  ].join("/");
}

export function normalizedPrivateVideoContentType(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Private exercise video content type is invalid.");
  }
  const normalized = value.split(";", 1)[0]!.trim().toLocaleLowerCase("en");
  if (
    !/^video\/[a-z0-9][a-z0-9.+-]{0,79}$/.test(normalized) ||
    normalized.length > 100
  ) {
    throw new Error("Private exercise video content type is invalid.");
  }
  return normalized;
}

export function normalizedPrivateVideoFileName(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Private exercise video file name is invalid.");
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new Error("Private exercise video file name is invalid.");
  }
  const normalized = decoded.trim();
  if (
    normalized.length === 0 ||
    Array.from(normalized).length > 255 ||
    /[\u0000-\u001f\u007f/\\]/u.test(normalized)
  ) {
    throw new Error("Private exercise video file name is invalid.");
  }
  return normalized;
}

function safeSegment(value: string): string {
  if (
    value.length === 0 ||
    value.length > 200 ||
    value.trim() !== value ||
    /[\u0000-\u001f\u007f/\\]/u.test(value)
  ) {
    throw new Error("Private exercise video storage scope is invalid.");
  }
  return encodeURIComponent(value);
}
