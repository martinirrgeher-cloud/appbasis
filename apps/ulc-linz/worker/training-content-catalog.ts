import { UlcTrainingValidationError } from "./training-session-domain";

/** Stable identifiers, not user-entered labels, are used for youth-training statistics. */
export const ULC_YOUTH_CONTENT_CATALOG = Object.freeze([
  Object.freeze({ code: "warmup", label: "Aufwärmen" }),
  Object.freeze({ code: "coordination", label: "Koordination" }),
  Object.freeze({ code: "sprint", label: "Sprint / Schnelligkeit" }),
  Object.freeze({ code: "jump", label: "Sprung" }),
  Object.freeze({ code: "throw", label: "Wurf / Stoß" }),
  Object.freeze({ code: "technique", label: "Technik" }),
  Object.freeze({ code: "strength", label: "Kraft" }),
  Object.freeze({ code: "endurance", label: "Ausdauer" }),
  Object.freeze({ code: "mobility", label: "Beweglichkeit" }),
  Object.freeze({ code: "games", label: "Spiel / Staffel" }),
  Object.freeze({ code: "other", label: "Sonstiges" }),
] as const);

export type UlcYouthContentCode =
  (typeof ULC_YOUTH_CONTENT_CATALOG)[number]["code"] | "";

export interface UlcYouthContentItem {
  readonly code: UlcYouthContentCode;
  /** Optional contextual detail; not used as a statistical category. */
  readonly detail: string;
}

const CONTENT_LABELS: ReadonlyMap<string, string> = new Map(
  ULC_YOUTH_CONTENT_CATALOG.map((entry) => [entry.code, entry.label]),
);

export function normalizeUlcYouthContentItems(
  titles: readonly string[],
  items: readonly UlcYouthContentItem[],
): readonly UlcYouthContentItem[] {
  if (!Array.isArray(titles) || titles.length > 5 ||
      !Array.isArray(items) || items.length !== titles.length) {
    throw new UlcTrainingValidationError("Training content metadata must match the titles.");
  }
  return Object.freeze(items.map((entry, index) => {
    if (entry === null || typeof entry !== "object" ||
        Array.isArray(entry) ||
        Object.keys(entry).sort().join(",") !== "code,detail" ||
        typeof entry.code !== "string" ||
        typeof entry.detail !== "string" ||
        entry.detail.length > 200 || entry.detail.trim() !== entry.detail ||
        [...entry.detail].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) ||
        (entry.code !== "" && CONTENT_LABELS.get(entry.code) !== titles[index])) {
      throw new UlcTrainingValidationError("Invalid training content category or detail.");
    }
    return Object.freeze({ code: entry.code as UlcYouthContentCode, detail: entry.detail });
  }));
}

/** An unmigrated/legacy U12 session contains titles but has no metadata. */
export function youthContentItemsForLegacyTitles(
  titles: readonly string[],
): readonly UlcYouthContentItem[] {
  return Object.freeze(titles.map(() => Object.freeze({ code: "" as const, detail: "" })));
}
