/**
 * Reusable, auditable ULC module-permission presets.
 *
 * A permission profile is NOT a technical identity role. In particular,
 * "Funktionär" cannot grant organization-admin authority or bypass the
 * membership/subject authorization checks.
 */
export const ULC_USER_ACCESS_MODULES = Object.freeze([
  { key: "kindertraining", label: "Anwesenheit" },
  { key: "u12", label: "Kindertraining U12" },
  { key: "athletes", label: "Stammdaten" },
  { key: "exercise_catalog", label: "Übungskatalog" },
  { key: "training_blocks", label: "Trainingsblöcke" },
  { key: "training_planning", label: "Trainingsplanung" },
  { key: "training_documentation", label: "Trainingsdokumentation" },
  { key: "countdown", label: "Countdown" },
] as const);

export type UlcUserSourceRole = "admin" | "trainer" | "athlete" | "parent";
export type UlcUserAccessChoice = "none" | "view" | "edit";

export interface UlcPermissionPreset {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly sourceRole: UlcUserSourceRole;
  readonly modules: readonly { readonly key: string; readonly level: UlcUserAccessChoice }[];
}

const MODULE_KEYS = ULC_USER_ACCESS_MODULES.map(module => module.key);

// Organization-level module APIs are deliberately inaccessible to athlete/parent
// identities, even if someone gives them a capability. Only expose the
// subject-safe documentation module and the personal countdown as editable.
export const ULC_PERMISSION_EDITABLE_BY_ROLE: Readonly<Record<UlcUserSourceRole, readonly string[]>> =
  Object.freeze({
    admin: Object.freeze([...MODULE_KEYS]),
    trainer: Object.freeze([...MODULE_KEYS]),
    athlete: Object.freeze(["training_documentation", "countdown"]),
    parent: Object.freeze(["training_documentation", "countdown"]),
  });

function preset(
  id: string,
  name: string,
  description: string,
  sourceRole: UlcPermissionPreset["sourceRole"],
  levels: Readonly<Partial<Record<(typeof MODULE_KEYS)[number], UlcUserAccessChoice>>>,
): UlcPermissionPreset {
  const editable = ULC_PERMISSION_EDITABLE_BY_ROLE[sourceRole];
  return Object.freeze({
    id, name, description, sourceRole,
    modules: Object.freeze(ULC_USER_ACCESS_MODULES.map(({ key }) => Object.freeze({
      key, level: editable.includes(key) ? (levels[key] ?? "none") : "none",
    }))),
  });
}

export const ULC_PERMISSION_PRESETS: readonly UlcPermissionPreset[] = Object.freeze([
  preset("administrator", "Administrator", "Alle App-Module, technische Administratorrolle bleibt separat", "admin", {
    kindertraining: "edit", u12: "edit", athletes: "edit",
    exercise_catalog: "edit", training_blocks: "edit", training_planning: "edit",
    training_documentation: "edit", countdown: "edit",
  }),
  preset("kindertrainer", "Kindertrainer", "Anwesenheit und U12 betreuen", "trainer", {
    kindertraining: "edit", u12: "edit", countdown: "edit",
  }),
  preset("leistungstrainer", "Leistungstrainer", "Planung, Katalog und Training", "trainer", {
    kindertraining: "view", athletes: "edit", exercise_catalog: "edit",
    training_blocks: "edit", training_planning: "edit",
    training_documentation: "edit", countdown: "edit",
  }),
  preset("funktionaer", "Funktionär", "Vereinsorganisation und Einsicht – ohne Systemadministration", "trainer", {
    kindertraining: "view", u12: "view", athletes: "view",
    exercise_catalog: "view", training_blocks: "view",
    training_planning: "view", training_documentation: "view", countdown: "view",
  }),
  preset("athlet", "Athlet", "Persönliche Trainingsdokumentation und Countdown", "athlete", {
    training_documentation: "view", countdown: "edit",
  }),
  preset("eltern", "Eltern", "Einsicht in zugeordnete Trainingsdokumentation", "parent", {
    training_documentation: "view", countdown: "view",
  }),
]);

export function permissionPresetsForRole(sourceRole: UlcUserSourceRole): readonly UlcPermissionPreset[] {
  return ULC_PERMISSION_PRESETS.filter(profile => profile.sourceRole === sourceRole);
}
