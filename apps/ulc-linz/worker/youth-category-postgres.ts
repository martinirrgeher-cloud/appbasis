import { UlcTrainingValidationError } from "./training-session-domain";
import {
  ULC_YOUTH_CONTENT_CATALOG,
  ULC_U14_CONTENT_CATALOG,
  ULC_KINDERTRAINING_CONTENT_CATALOG,
} from "./training-content-catalog";
import type { UlcYouthContentItem, UlcYouthTrainingArea } from "./training-content-catalog";

type Parameter = string | number | boolean | null;
export interface UlcYouthCategorySqlClient {
  unsafe(sql: string, parameters?: Parameter[]): PromiseLike<readonly Record<string, unknown>[]>;
}

export interface UlcYouthCategory {
  readonly code: string;
  readonly label: string;
  readonly isActive: boolean;
  readonly revision: number;
}

export class UlcYouthCategoryValidationError extends Error {
  readonly code = "INVALID_YOUTH_CATEGORY";
  constructor() {
    super("Invalid youth training category.");
    this.name = "UlcYouthCategoryValidationError";
  }
}

export class UlcYouthCategoryConflictError extends Error {
  readonly code = "YOUTH_CATEGORY_CONFLICT";
  constructor() {
    super("Training category changed or name already exists.");
    this.name = "UlcYouthCategoryConflictError";
  }
}

export function safeYouthTrainingArea(area: unknown): UlcYouthTrainingArea {
  if (area !== "u12" && area !== "u14" && area !== "kindertraining") {
    throw new UlcYouthCategoryValidationError();
  }
  return area;
}

const safeOrganization = (id: string) => {
  if (typeof id !== "string" || id.length < 1 || id.length > 200 ||
      id.trim() !== id) throw new UlcYouthCategoryValidationError();
  return id;
};

function safeLabel(label: string): string {
  if (typeof label !== "string" || !label || label.length > 120 ||
      label.trim() !== label || /[\x00-\x1f\x7f]/.test(label)) {
    throw new UlcYouthCategoryValidationError();
  }
  return label;
}

function safeCode(code: string): string {
  if (typeof code !== "string" || !/^[a-z][a-z0-9_]{0,79}$/.test(code)) {
    throw new UlcYouthCategoryValidationError();
  }
  return code;
}

function safeRevision(revision: number): number {
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new UlcYouthCategoryValidationError();
  }
  return revision;
}

function parseCategory(row: Record<string, unknown>): UlcYouthCategory {
  const code = safeCode(row.code as string);
  const label = safeLabel(row.label as string);
  if (typeof row.is_active !== "boolean") {
    throw new UlcYouthCategoryValidationError();
  }
  return Object.freeze({
    code, label, isActive: row.is_active, revision: safeRevision(Number(row.revision)),
  });
}

const defaultsForArea = (area: UlcYouthTrainingArea) =>
  area === "u12" ? ULC_YOUTH_CONTENT_CATALOG :
  area === "u14" ? ULC_U14_CONTENT_CATALOG : ULC_KINDERTRAINING_CONTENT_CATALOG;

/**
 * U12 intentionally keeps the populated schema-v14 table unchanged.
 * U14 and Kindertraining are independent catalogs stored in schema-v15,
 * isolated by both organization and training area.
 */
export class PostgresUlcYouthCategoryRepository {
  constructor(
    private readonly sql: UlcYouthCategorySqlClient,
    private readonly createCode: () => string =
      () => "custom_" + crypto.randomUUID().replaceAll("-", ""),
  ) {}

  async list(organizationId: string, requestedArea: UlcYouthTrainingArea): Promise<readonly UlcYouthCategory[]> {
    const org = safeOrganization(organizationId);
    const area = safeYouthTrainingArea(requestedArea);
    const defaults = JSON.stringify(defaultsForArea(area));
    if (area === "u12") {
      await this.sql.unsafe(
        `INSERT INTO ulc_linz_youth_content_category (organization_id, code, label)
         SELECT $1, defaults.code, defaults.label
           FROM jsonb_to_recordset($2::jsonb) AS defaults(code text, label text)
         ON CONFLICT DO NOTHING`,
        [org, defaults],
      );
      const rows = await this.sql.unsafe(
        `SELECT code, label, is_active, revision
           FROM ulc_linz_youth_content_category
          WHERE organization_id = $1
          ORDER BY is_active DESC, lower(label) ASC, code ASC`,
        [org],
      );
      return Object.freeze(rows.map(parseCategory));
    }

    await this.sql.unsafe(
      `INSERT INTO ulc_linz_youth_group_category (organization_id, training_area, code, label)
       SELECT $1, $2, defaults.code, defaults.label
         FROM jsonb_to_recordset($3::jsonb) AS defaults(code text, label text)
       ON CONFLICT DO NOTHING`,
      [org, area, defaults],
    );
    const rows = await this.sql.unsafe(
      `SELECT code, label, is_active, revision
         FROM ulc_linz_youth_group_category
        WHERE organization_id = $1 AND training_area = $2
        ORDER BY is_active DESC, lower(label) ASC, code ASC`,
      [org, area],
    );
    return Object.freeze(rows.map(parseCategory));
  }

  async create(
    organizationId: string, requestedArea: UlcYouthTrainingArea, label: string,
  ): Promise<UlcYouthCategory> {
    const org = safeOrganization(organizationId);
    const area = safeYouthTrainingArea(requestedArea);
    const name = safeLabel(label);
    const code = safeCode(this.createCode());
    try {
      const rows = area === "u12" ? await this.sql.unsafe(
        `INSERT INTO ulc_linz_youth_content_category (organization_id, code, label)
         VALUES ($1, $2, $3)
         RETURNING code, label, is_active, revision`,
        [org, code, name],
      ) : await this.sql.unsafe(
        `INSERT INTO ulc_linz_youth_group_category
           (organization_id, training_area, code, label)
         VALUES ($1, $2, $3, $4)
         RETURNING code, label, is_active, revision`,
        [org, area, code, name],
      );
      if (rows.length !== 1) throw new UlcYouthCategoryConflictError();
      return parseCategory(rows[0]!);
    } catch (error) {
      if ((error as { code?: string })?.code === "23505") {
        throw new UlcYouthCategoryConflictError();
      }
      throw error;
    }
  }

  async update(
    organizationId: string,
    requestedArea: UlcYouthTrainingArea,
    code: string,
    input: { label: string; isActive: boolean; expectedRevision: number },
  ): Promise<UlcYouthCategory> {
    const org = safeOrganization(organizationId);
    const area = safeYouthTrainingArea(requestedArea);
    const categoryCode = safeCode(code);
    const label = safeLabel(input.label);
    if (typeof input.isActive !== "boolean") throw new UlcYouthCategoryValidationError();
    const expectedRevision = safeRevision(input.expectedRevision);
    try {
      const rows = area === "u12" ? await this.sql.unsafe(
        `UPDATE ulc_linz_youth_content_category
            SET label = $3, is_active = $4, revision = revision + 1, updated_at = now()
          WHERE organization_id = $1 AND code = $2 AND revision = $5
         RETURNING code, label, is_active, revision`,
        [org, categoryCode, label, input.isActive, expectedRevision],
      ) : await this.sql.unsafe(
        `UPDATE ulc_linz_youth_group_category
            SET label = $4, is_active = $5, revision = revision + 1, updated_at = now()
          WHERE organization_id = $1 AND training_area = $2
            AND code = $3 AND revision = $6
         RETURNING code, label, is_active, revision`,
        [org, area, categoryCode, label, input.isActive, expectedRevision],
      );
      if (rows.length !== 1) throw new UlcYouthCategoryConflictError();
      return parseCategory(rows[0]!);
    } catch (error) {
      if ((error as { code?: string })?.code === "23505") {
        throw new UlcYouthCategoryConflictError();
      }
      throw error;
    }
  }

  /** Existing U12 labels are preserved even if renamed/deactivated in the catalog. */
  async validateSessionContents(
    organizationId: string,
    requestedArea: UlcYouthTrainingArea,
    titles: readonly string[],
    items: readonly UlcYouthContentItem[],
    previous: Readonly<{ titles: readonly string[]; items: readonly UlcYouthContentItem[] }> | null,
  ): Promise<void> {
    const categories = await this.list(organizationId, safeYouthTrainingArea(requestedArea));
    const byCode = new Map(categories.map((category) => [category.code, category]));
    for (const [index, item] of items.entries()) {
      if (!item.code) continue;
      const category = byCode.get(item.code);
      const preserved = previous?.items[index]?.code === item.code &&
        previous.titles[index] === titles[index];
      if (!preserved && (!category || !category.isActive ||
          category.label !== titles[index])) {
        throw new UlcTrainingValidationError(
          "Youth training category is inactive, missing or outdated.",
        );
      }
    }
  }
}
