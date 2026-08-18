import { assertIdentityActionAllowed } from "@appbasis/identity/access";
import { principalId, type PrincipalId } from "@appbasis/permissions";

import exportContract from "../privacy/m5-export-contract.json";
import type { UlcLinzCurrentIdentity } from "./authorization";
import roleDataScope from "./role-data-scope.json";

export type UlcLinzExportScope = "self" | "managed" | "organization";

type JsonScalar = string | number | boolean | null;
type ExportRow = Readonly<Record<string, JsonScalar>>;
type DatasetContract = (typeof exportContract.datasets)[number];

const SOURCE_ROLES = new Set<string>(Object.keys(roleDataScope.runtimeRoleIds));
const CREDENTIAL_FIELDS = new Set<string>(exportContract.credentialFieldNames);

export type UlcLinzDataExportBlockedCode =
  | "INVALID_REQUEST"
  | "AUTHORIZATION_MISMATCH"
  | "DATASET_INCOMPLETE"
  | "DATASET_NOT_ALLOWED"
  | "UNSAFE_EXPORT_DATA"
  | "AUDIT_FAILED";

export class UlcLinzDataExportBlockedError extends Error {
  readonly code: UlcLinzDataExportBlockedCode;

  constructor(code: UlcLinzDataExportBlockedCode) {
    super("ULC Linz data export blocked.");
    this.name = "UlcLinzDataExportBlockedError";
    this.code = code;
  }
}

export type UlcLinzDataExportRequest =
  | Readonly<{
      organizationId: string;
      scope: "self" | "managed";
      subjectId: string;
    }>
  | Readonly<{
      organizationId: string;
      scope: "organization";
    }>;

export interface UlcLinzExportAuthorization {
  readonly actorPrincipalId: PrincipalId;
  readonly organizationId: string;
  readonly sourceRole: string;
  readonly scope: UlcLinzExportScope;
  readonly subjectId: string | null;
}

export interface UlcLinzExportDatasetRecord {
  readonly organizationId: string;
  readonly subjectId: string;
  readonly data: Readonly<Record<string, unknown>>;
}

export interface UlcLinzExportDataset {
  readonly id: string;
  readonly records: readonly UlcLinzExportDatasetRecord[];
}

export interface UlcLinzExportAuditInput {
  readonly actorPrincipalId: PrincipalId;
  readonly organizationId: string;
  readonly scope: UlcLinzExportScope;
  readonly subjectId: string | null;
  readonly generatedAt: string;
  readonly schemaVersion: 1;
  readonly datasetIds: readonly string[];
  readonly result: "success";
}

export interface UlcLinzDataExportDependencies {
  authorizeExport(input: {
    readonly current: UlcLinzCurrentIdentity;
    readonly request: UlcLinzDataExportRequest;
  }): Promise<UlcLinzExportAuthorization>;
  readDatasets(input: {
    readonly organizationId: string;
    readonly scope: UlcLinzExportScope;
    readonly subjectId: string | null;
  }): Promise<readonly UlcLinzExportDataset[]>;
  recordExportAudit(input: UlcLinzExportAuditInput): Promise<void>;
  now(): Date;
}

export interface UlcLinzDataExportEnvelope {
  readonly schemaVersion: 1;
  readonly appId: "ulc-linz";
  readonly generatedAt: string;
  readonly organizationId: string;
  readonly scope: UlcLinzExportScope;
  readonly subjectId: string | null;
  readonly datasets: Readonly<Record<string, readonly ExportRow[]>>;
}

export interface UlcLinzDataExportResult {
  readonly json: UlcLinzDataExportEnvelope;
  readonly csv: Readonly<Record<string, string>>;
}

export async function exportUlcLinzData(
  current: UlcLinzCurrentIdentity,
  dependencies: UlcLinzDataExportDependencies,
  request: UlcLinzDataExportRequest,
): Promise<UlcLinzDataExportResult> {
  assertCanonicalContracts();
  assertIdentityActionAllowed(current, "application");

  const normalizedRequest = normalizeRequest(request);
  const authorization = await dependencies.authorizeExport({
    current,
    request: normalizedRequest,
  });
  assertAuthorizationMatches(current, normalizedRequest, authorization);

  const sourceDatasets = await dependencies.readDatasets({
    organizationId: authorization.organizationId,
    scope: authorization.scope,
    subjectId: authorization.subjectId,
  });
  const datasets = normalizeDatasets(authorization, sourceDatasets);
  const generatedAt = requiredTimestamp(dependencies.now());

  const json: UlcLinzDataExportEnvelope = Object.freeze({
    schemaVersion: 1,
    appId: "ulc-linz",
    generatedAt,
    organizationId: authorization.organizationId,
    scope: authorization.scope,
    subjectId: authorization.subjectId,
    datasets: Object.freeze(datasets.json),
  });
  const csv = Object.freeze(datasets.csv);

  try {
    await dependencies.recordExportAudit({
      actorPrincipalId: authorization.actorPrincipalId,
      organizationId: authorization.organizationId,
      scope: authorization.scope,
      subjectId: authorization.subjectId,
      generatedAt,
      schemaVersion: 1,
      datasetIds: Object.freeze(Object.keys(datasets.json)),
      result: "success",
    });
  } catch {
    throw new UlcLinzDataExportBlockedError("AUDIT_FAILED");
  }

  return Object.freeze({ json, csv });
}

function normalizeRequest(
  request: UlcLinzDataExportRequest,
): UlcLinzDataExportRequest {
  const organizationId = requiredIdentifier(request.organizationId);
  if (request.scope === "organization") {
    if ("subjectId" in request && request.subjectId !== undefined) {
      throw new UlcLinzDataExportBlockedError("INVALID_REQUEST");
    }
    return Object.freeze({ organizationId, scope: "organization" });
  }
  if (request.scope !== "self" && request.scope !== "managed") {
    throw new UlcLinzDataExportBlockedError("INVALID_REQUEST");
  }
  return Object.freeze({
    organizationId,
    scope: request.scope,
    subjectId: requiredIdentifier(request.subjectId),
  });
}

function assertAuthorizationMatches(
  current: UlcLinzCurrentIdentity,
  request: UlcLinzDataExportRequest,
  authorization: UlcLinzExportAuthorization,
): void {
  const expectedActor = principalId(requiredIdentifier(current.identity.identityId));
  if (
    authorization.actorPrincipalId !== expectedActor ||
    authorization.organizationId !== request.organizationId ||
    authorization.scope !== request.scope ||
    !SOURCE_ROLES.has(authorization.sourceRole)
  ) {
    throw new UlcLinzDataExportBlockedError("AUTHORIZATION_MISMATCH");
  }

  if (request.scope === "organization") {
    if (authorization.subjectId !== null || authorization.sourceRole !== "admin") {
      throw new UlcLinzDataExportBlockedError("AUTHORIZATION_MISMATCH");
    }
    return;
  }

  if (authorization.subjectId !== request.subjectId) {
    throw new UlcLinzDataExportBlockedError("AUTHORIZATION_MISMATCH");
  }
  if (request.scope === "managed" && authorization.sourceRole !== "parent") {
    throw new UlcLinzDataExportBlockedError("AUTHORIZATION_MISMATCH");
  }
}

function normalizeDatasets(
  authorization: UlcLinzExportAuthorization,
  datasets: readonly UlcLinzExportDataset[],
): {
  json: Record<string, readonly ExportRow[]>;
  csv: Record<string, string>;
} {
  if (!Array.isArray(datasets)) {
    throw new UlcLinzDataExportBlockedError("DATASET_INCOMPLETE");
  }

  const expectedContracts = exportContract.datasets.filter((dataset) =>
    new Set<string>(dataset.scopes).has(authorization.scope),
  );
  const expectedIds = new Set<string>(
    expectedContracts.map((dataset) => dataset.id),
  );
  const seen = new Set<string>();
  const json: Record<string, readonly ExportRow[]> = {};
  const csv: Record<string, string> = {};

  for (const dataset of datasets) {
    if (
      typeof dataset !== "object" ||
      dataset === null ||
      typeof dataset.id !== "string" ||
      seen.has(dataset.id) ||
      !expectedIds.has(dataset.id)
    ) {
      throw new UlcLinzDataExportBlockedError("DATASET_NOT_ALLOWED");
    }
    const contract = expectedContracts.find((entry) => entry.id === dataset.id);
    if (contract === undefined) {
      throw new UlcLinzDataExportBlockedError("DATASET_NOT_ALLOWED");
    }

    const rows = normalizeRecords(contract, authorization, dataset.records);
    seen.add(dataset.id);
    json[dataset.id] = Object.freeze(rows);
    if (contract.csvEligible) {
      csv[`${dataset.id}.csv`] = serializeCsv(contract, rows);
    }
  }

  if (seen.size !== expectedIds.size || [...expectedIds].some((id) => !seen.has(id))) {
    throw new UlcLinzDataExportBlockedError("DATASET_INCOMPLETE");
  }

  return { json, csv };
}

function normalizeRecords(
  contract: DatasetContract,
  authorization: UlcLinzExportAuthorization,
  input: readonly UlcLinzExportDatasetRecord[],
): ExportRow[] {
  if (!Array.isArray(input)) {
    throw new UlcLinzDataExportBlockedError("UNSAFE_EXPORT_DATA");
  }
  if (
    (authorization.scope === "self" || authorization.scope === "managed") &&
    input.length !== 1
  ) {
    throw new UlcLinzDataExportBlockedError("DATASET_INCOMPLETE");
  }

  return input.map((record) => {
    if (
      typeof record !== "object" ||
      record === null ||
      requiredIdentifier(record.organizationId) !== authorization.organizationId
    ) {
      throw new UlcLinzDataExportBlockedError("AUTHORIZATION_MISMATCH");
    }
    const subjectId = requiredIdentifier(record.subjectId);
    if (
      authorization.scope !== "organization" &&
      subjectId !== authorization.subjectId
    ) {
      throw new UlcLinzDataExportBlockedError("AUTHORIZATION_MISMATCH");
    }
    return normalizeRow(contract, record.data);
  });
}

function normalizeRow(
  contract: DatasetContract,
  row: Readonly<Record<string, unknown>>,
): ExportRow {
  if (
    typeof row !== "object" ||
    row === null ||
    Array.isArray(row) ||
    (Object.getPrototypeOf(row) !== Object.prototype &&
      Object.getPrototypeOf(row) !== null) ||
    Object.getOwnPropertySymbols(row).length > 0
  ) {
    throw new UlcLinzDataExportBlockedError("UNSAFE_EXPORT_DATA");
  }

  const descriptors = Object.getOwnPropertyDescriptors(row);
  const fields = [...contract.allowedFields] as string[];
  const fieldSet = new Set(fields);
  const keys = Object.keys(descriptors);
  if (
    keys.length !== fields.length ||
    fields.some((field) => !Object.hasOwn(descriptors, field)) ||
    keys.some((field) => !fieldSet.has(field))
  ) {
    throw new UlcLinzDataExportBlockedError("UNSAFE_EXPORT_DATA");
  }

  const normalized: Record<string, JsonScalar> = {};
  for (const field of fields) {
    if (CREDENTIAL_FIELDS.has(field)) {
      throw new UlcLinzDataExportBlockedError("UNSAFE_EXPORT_DATA");
    }
    const descriptor = descriptors[field];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    ) {
      throw new UlcLinzDataExportBlockedError("UNSAFE_EXPORT_DATA");
    }
    normalized[field] = requiredScalar(descriptor.value);
  }
  return Object.freeze(normalized);
}

function requiredScalar(value: unknown): JsonScalar {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new UlcLinzDataExportBlockedError("UNSAFE_EXPORT_DATA");
}

function serializeCsv(
  contract: DatasetContract,
  rows: readonly ExportRow[],
): string {
  const columns = [...contract.csvColumns] as string[];
  const lines = [columns.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => csvCell(row[column] ?? null)).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}

function csvCell(value: JsonScalar): string {
  const raw = value === null ? "" : String(value);
  const text =
    typeof value === "string" && /^[=+\-@]/.test(raw.trimStart())
      ? `'${raw}`
      : raw;
  return `"${text.replaceAll('"', '""')}"`;
}

function requiredIdentifier(value: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 200 ||
    value !== value.trim()
  ) {
    throw new UlcLinzDataExportBlockedError("INVALID_REQUEST");
  }
  return value;
}

function requiredTimestamp(value: Date): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new UlcLinzDataExportBlockedError("INVALID_REQUEST");
  }
  return value.toISOString();
}

function assertCanonicalContracts(): void {
  if (
    exportContract.schemaVersion !== 1 ||
    exportContract.appId !== "ulc-linz" ||
    exportContract.canonicalFormat !== "json" ||
    exportContract.unknownDataset !== "deny" ||
    exportContract.supplementaryFormats.length !== 1 ||
    exportContract.supplementaryFormats[0] !== "csv" ||
    roleDataScope.id !== "ulc-linz-role-data-scope-v0.1" ||
    roleDataScope.dataScopes.organizationBoundary !== "same-organization-only" ||
    roleDataScope.dataScopes.athleteLink.relationType !== "self" ||
    roleDataScope.dataScopes.athleteLink.explicitLinksOnly !== true ||
    roleDataScope.dataScopes.parentLink.relationType !== "managed" ||
    roleDataScope.dataScopes.parentLink.explicitLinksOnly !== true
  ) {
    throw new UlcLinzDataExportBlockedError("INVALID_REQUEST");
  }
}
