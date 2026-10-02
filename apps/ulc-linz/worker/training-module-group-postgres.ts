import type { UlcTrainingModule } from "./training-session-domain";

type SqlParameter = string | number | boolean | null;

export interface UlcLinzTrainingModuleGroupSqlClient {
  unsafe(
    query: string,
    parameters?: SqlParameter[],
  ): PromiseLike<readonly Record<string, unknown>[]>;
}

export interface UlcLinzTrainingModuleGroupReader {
  readGroupId(
    organizationId: string,
    moduleId: UlcTrainingModule,
  ): Promise<string | null>;
}

export class PostgresUlcLinzTrainingModuleGroupReader
  implements UlcLinzTrainingModuleGroupReader
{
  readonly #sql: UlcLinzTrainingModuleGroupSqlClient;

  constructor(sql: UlcLinzTrainingModuleGroupSqlClient) {
    this.#sql = sql;
  }

  async readGroupId(
    organizationId: string,
    moduleId: UlcTrainingModule,
  ): Promise<string | null> {
    const normalizedOrganizationId = requiredIdentifier(
      organizationId,
      "Organization id",
    );
    const normalizedModuleId = requiredModuleId(moduleId);
    const rows = await this.#sql.unsafe(
      `SELECT group_id
         FROM ulc_linz_training_module_group
        WHERE organization_id = $1
          AND module_id = $2`,
      [normalizedOrganizationId, normalizedModuleId],
    );
    if (!Array.isArray(rows) || rows.length > 1) {
      throw new Error("ULC Linz training module group mapping is inconsistent.");
    }
    if (rows.length === 0) return null;
    return requiredIdentifier(rows[0]?.group_id, "Training group id");
  }
}

function requiredModuleId(value: unknown): UlcTrainingModule {
  if (value !== "kindertraining" && value !== "u12" && value !== "u14") {
    throw new Error("Training module id is invalid.");
  }
  return value;
}

function requiredIdentifier(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 200 ||
    value.trim() !== value
  ) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}
