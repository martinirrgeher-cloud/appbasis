import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export class UlcPreviewExerciseCatalogStorageModeError extends Error {
  constructor(message) {
    super(message);
    this.name = "UlcPreviewExerciseCatalogStorageModeError";
  }
}

export async function resolveUlcPreviewExerciseCatalogStorageMode(
  { baseURL } = {},
  { fetchImpl = globalThis.fetch } = {},
) {
  if (typeof fetchImpl !== "function") {
    throw new UlcPreviewExerciseCatalogStorageModeError(
      "ULC preview storage-mode fetch implementation is unavailable.",
    );
  }
  let origin;
  try {
    origin = new URL(baseURL);
  } catch {
    throw new UlcPreviewExerciseCatalogStorageModeError(
      "ULC preview storage-mode base URL is invalid.",
    );
  }
  if (
    origin.protocol !== "https:" ||
    origin.username !== "" ||
    origin.password !== "" ||
    origin.pathname !== "/" ||
    origin.search !== "" ||
    origin.hash !== ""
  ) {
    throw new UlcPreviewExerciseCatalogStorageModeError(
      "ULC preview storage-mode base URL must be a clean HTTPS origin.",
    );
  }

  const storageResponse = await fetchImpl(
    new URL("/api/health/exercise-catalog-storage", origin),
    {
      method: "GET",
      headers: { accept: "application/json" },
      redirect: "error",
    },
  );

  if (storageResponse.status === 200) {
    const payload = await safeJson(storageResponse);
    const mode = payload?.exerciseCatalogStorageMode;
    if (
      payload?.status !== "ok" ||
      payload?.appId !== "ulc-linz" ||
      (mode !== "legacy" &&
        mode !== "quiesced" &&
        mode !== "standard")
    ) {
      throw new UlcPreviewExerciseCatalogStorageModeError(
        "ULC preview storage health returned an invalid contract.",
      );
    }
    return mode;
  }

  if (storageResponse.status !== 404) {
    throw new UlcPreviewExerciseCatalogStorageModeError(
      "ULC preview storage health returned an unexpected status.",
    );
  }

  const baseResponse = await fetchImpl(new URL("/api/health", origin), {
    method: "GET",
    headers: { accept: "application/json" },
    redirect: "error",
  });
  if (baseResponse.status !== 200) {
    throw new UlcPreviewExerciseCatalogStorageModeError(
      "ULC preview legacy bootstrap health is unavailable.",
    );
  }
  const basePayload = await safeJson(baseResponse);
  if (
    basePayload?.status !== "ok" ||
    basePayload?.appId !== "ulc-linz"
  ) {
    throw new UlcPreviewExerciseCatalogStorageModeError(
      "ULC preview legacy bootstrap health is not the canonical ULC worker.",
    );
  }
  return "legacy";
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    throw new UlcPreviewExerciseCatalogStorageModeError(
      "ULC preview storage health is not valid JSON.",
    );
  }
}

function isMainModule() {
  if (typeof process.argv[1] !== "string") return false;
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMainModule()) {
  try {
    const mode = await resolveUlcPreviewExerciseCatalogStorageMode({
      baseURL: process.env.APPBASIS_GENERATED_PREVIEW_URL,
    });
    process.stdout.write(mode + "\n");
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "ULC preview storage-mode resolution failed.",
    );
    process.exitCode = 1;
  }
}
