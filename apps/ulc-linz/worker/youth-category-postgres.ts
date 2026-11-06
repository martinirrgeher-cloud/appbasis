import { UlcTrainingValidationError } from "./training-session-domain";
import { ULC_YOUTH_CONTENT_CATALOG } from "./training-content-catalog";
import type { UlcYouthContentItem } from "./training-content-catalog";

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
  const revision = Number(row.revision);
  return Object.freeze({
    code, label, isActive: row.is_active, revision: safeRevision(revision),
  });
}

/** Same organization-wide data source for U12, U14 and Kindertraining. */
export class PostgresUlcYouthCategoryRepository {
  constructor(
    private readonly sql: UlcYouthCategorySqlClient,
    private readonly createCode: () => string =
      () => "custom_" + crypto.randomUUID().replaceAll("-", ""),
  ) {}

  async list(organizationId: string): Promise<readonly UlcYouthCategory[]> {
    const org = safeOrganization(organizationId);
    // New organizations receive defaults lazily, without restoring inactive items.
    const defaults = ULC_YOUTH_CONTENT_CATALOG.map((x) => ({
      code: x.code, label: x.label,
    }));
    await this.sql.unsafe(
      `INSERT INTO ulc_linz_youth_content_category (organization_id, code, label)
       SELECT $1, defaults.code, defaults.label
         FROM jsonb_to_recordset($2::jsonb) AS defaults(code text, label text)
       ON CONFLICT DO NOTHING`,
      [org, JSON.stringify(defaults)],
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

  async create(organizationId: string, label: string): Promise<UlcYouthCategory> {
    const org = safeOrganization(organizationId);
    const name = safeLabel(label);
    const code = safeCode(this.createCode());
    try {
      const rows = await this.sql.unsafe(
        `INSERT INTO ulc_linz_youth_content_category
           (organization_id, code, label)
         VALUES ($1, $2, $3)
         RETURNING code, label, is_active, revision`,
        [org, code, name],
      );
      if (rows.length !== 1) throw new UlcYouthCategoryConflictError();
      return parseCategory(rows[0]);
    } catch (error) {
      if ((error as { code?: string })?.code === "23505") {
        throw new UlcYouthCategoryConflictError();
      }
      throw error;
    }
  }

  async update(
    organizationId: string,
    code: string,
    input: { label: string; isActive: boolean; expectedRevision: number },
  ): Promise<UlcYouthCategory> {
    const org = safeOrganization(organizationId);
    const categoryCode = safeCode(code);
    const label = safeLabel(input.label);
    if (typeof input.isActive !== "boolean") throw new UlcYouthCategoryValidationError();
    const expectedRevision = safeRevision(input.expectedRevision);
    try {
      const rows = await this.sql.unsafe(
        `UPDATE ulc_linz_youth_content_category
            SET label = $3,
                is_active = $4,
                revision = revision + 1,
                updated_at = now()
          WHERE organization_id = $1
            AND code = $2
            AND revision = $5
         RETURNING code, label, is_active, revision`,
        [org, categoryCode, label, input.isActive, expectedRevision],
      );
      if (rows.length !== 1) throw new UlcYouthCategoryConflictError();
      return parseCategory(rows[0]);
    } catch (error) {
      if ((error as { code?: string })?.code === "23505") {
        throw new UlcYouthCategoryConflictError();
      }
      throw error;
    }
  }

  /** Existing saved labels never change when catalog entries are renamed. */
  async validateSessionContents(
    organizationId: string,
    titles: readonly string[],
    items: readonly UlcYouthContentItem[],
    previous: Readonly<{ titles: readonly string[]; items: readonly UlcYouthContentItem[] }> | null,
  ): Promise<void> {
    const categories = await this.list(organizationId);
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
