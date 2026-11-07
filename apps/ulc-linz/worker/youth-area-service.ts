import type { AthleteMasterdataSnapshot } from "@appbasis/athletes";
import { createUlcU12Service, type UlcU12MasterdataReader, type UlcU12SessionStore } from "./u12-service";
import type { UlcLinzTrainingModuleGroupReader } from "./training-module-group-postgres";
import type { PostgresUlcYouthCategoryRepository } from "./youth-category-postgres";

/** The existing Kindertraining/Irrgeher weekly service is deliberately not modified. */
export type UlcDetailedYouthArea = "u14" | "kindertraining";

export class UlcYouthAreaMappingError extends Error {
  readonly code = "YOUTH_AREA_GROUP_AMBIGUOUS";
  constructor() {
    super("Youth attendance group mapping is ambiguous.");
  }
}

/**
 * Only a single explicitly configured U14 group or an exact-name match may
 * enter the U12-style attendance editor. Never silently select the old
 * Kindertraining/Irrgeher weekly group or merge the two attendance flows.
 */
export function createUlcYouthAreaService(input: {
  area: UlcDetailedYouthArea;
  masterdata: UlcU12MasterdataReader;
  sessions: UlcU12SessionStore;
  moduleGroups: UlcLinzTrainingModuleGroupReader;
  categories: Pick<PostgresUlcYouthCategoryRepository, "validateSessionContents">;
}) {
  const { area, masterdata, sessions, moduleGroups, categories } = input;
  async function configuredYouthGroup(organizationId: string): Promise<string | null> {
    const mapping = await moduleGroups.readGroupId(organizationId, area);
    const snapshot: AthleteMasterdataSnapshot =
      await masterdata.readOrganizationSnapshot(organizationId);
    const groups = snapshot.trainingGroups.filter(
      (group) => group.organizationId === organizationId && group.isActive,
    );
    // A dedicated child training group is never the "Irrgeher" group.
    const matching = groups.filter((group) => {
      const name = group.name.trim().toLocaleLowerCase("de-AT");
      const shortName = (group.shortName ?? "").trim().toLocaleLowerCase("de-AT");
      return area === "u14"
        ? name === "u14" || shortName === "u14"
        : name === "kindertraining";
    });
    if (matching.length > 1) throw new UlcYouthAreaMappingError();
    if (area === "kindertraining") {
      // Legacy Kindertraining can have an unrelated module mapping; never use it.
      return matching[0]?.id ?? null;
    }
    if (mapping !== null) {
      if (!groups.some((group) => group.id === mapping)) return null;
      return mapping;
    }
    return matching[0]?.id ?? null;
  }

  const scopedModuleGroups: UlcLinzTrainingModuleGroupReader = {
    async readGroupId(organizationId, moduleId) {
      if (moduleId !== area) throw new UlcYouthAreaMappingError();
      return configuredYouthGroup(organizationId);
    },
  };

  return createUlcU12Service({
    masterdata,
    sessions,
    moduleGroups: scopedModuleGroups,
    categories,
    moduleId: area,
  });
}
