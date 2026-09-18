import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const APP_THEME_FILE = "appbasis.theme.json";
export const DEFAULT_APP_ACCENT_COLOR = "#2563eb";

export function createAppTheme({
  displayName,
  brandMark,
  accentColor,
}) {
  const fallbackMark = defaultBrandMark(displayName);
  return parseAppTheme({
    schemaVersion: 1,
    brandMark:
      typeof brandMark === "string" && brandMark.length > 0
        ? brandMark
        : fallbackMark,
    accentColor:
      typeof accentColor === "string" && accentColor.length > 0
        ? accentColor
        : DEFAULT_APP_ACCENT_COLOR,
  });
}

export function parseAppTheme(value) {
  if (!isPlainObject(value)) {
    throw new Error("App theme must be a JSON object.");
  }

  const keys = Object.keys(value);
  const expected = ["accentColor", "brandMark", "schemaVersion"];
  if (
    keys.length !== expected.length ||
    keys.some((key) => !expected.includes(key))
  ) {
    throw new Error("App theme contains unknown or missing fields.");
  }

  if (value.schemaVersion !== 1) {
    throw new Error("App theme schemaVersion must be 1.");
  }

  if (
    typeof value.brandMark !== "string" ||
    value.brandMark.length === 0 ||
    value.brandMark.trim() !== value.brandMark ||
    Array.from(value.brandMark).length > 2 ||
    /[\u0000-\u001f\u007f]/.test(value.brandMark)
  ) {
    throw new Error(
      "App theme brandMark must be a trimmed one- or two-character string.",
    );
  }

  if (
    typeof value.accentColor !== "string" ||
    !/^#[0-9a-fA-F]{6}$/.test(value.accentColor)
  ) {
    throw new Error("App theme accentColor must be a six-digit hex color.");
  }

  return Object.freeze({
    schemaVersion: 1,
    brandMark: value.brandMark.toLocaleUpperCase("de-DE"),
    accentColor: value.accentColor.toLowerCase(),
  });
}

export async function readAppTheme(
  repositoryRoot,
  definition,
) {
  const path = join(
    repositoryRoot,
    "apps",
    definition.appId,
    APP_THEME_FILE,
  );

  try {
    return parseAppTheme(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return createAppTheme({ displayName: definition.displayName });
    }
    if (error instanceof SyntaxError) {
      throw new Error(
        `apps/${definition.appId}/${APP_THEME_FILE} is not valid JSON.`,
      );
    }
    throw error;
  }
}

export function renderAppTheme(theme) {
  const parsed = parseAppTheme(theme);
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

function defaultBrandMark(displayName) {
  if (
    typeof displayName !== "string" ||
    displayName.trim() !== displayName ||
    displayName.length === 0
  ) {
    throw new Error("App theme requires a valid displayName fallback.");
  }
  return Array.from(displayName)[0].toLocaleUpperCase("de-DE");
}

function isPlainObject(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}
