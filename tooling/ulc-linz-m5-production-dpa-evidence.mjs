import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  deriveUlcLinzM5AccountBoundDpaEvidence,
  parseUlcLinzM5AccountBoundDpaEvidenceJson,
} from "./ulc-linz-m5-provider-account-dpa-evidence.mjs";

export function completeUlcLinzM5ProductionDpaBundle(bundle, accountDpaEvidence) {
  const root = requiredBundle(bundle);
  const providerInput = root.ownerInputs.providerBoundEvidenceInput;
  const resource = providerInput?.resourceBindingEvidence;
  const compliance = providerInput?.complianceEvidence;
  if (
    resource?.application !== "ulc-linz" ||
    resource?.environment !== "production" ||
    typeof resource?.cloudflare?.accountBindingId !== "string" ||
    typeof resource?.neon?.projectBindingId !== "string" ||
    compliance?.application !== "ulc-linz" ||
    compliance?.environment !== "production" ||
    compliance.observedAt !== resource.observedAt ||
    compliance.validUntilOrReviewAt !== resource.validUntilOrReviewAt ||
    !Array.isArray(compliance.legalEvidence) ||
    compliance.legalEvidence.length === 0
  ) {
    throw new Error("ULC M5-G DPA completion requires live provider evidence first.");
  }
  if (
    compliance.legalEvidence.some(
      (entry) => entry?.documentType === "dpa-account-binding",
    )
  ) {
    throw new Error("ULC M5-G account DPA evidence is already present.");
  }

  const additions = deriveUlcLinzM5AccountBoundDpaEvidence(accountDpaEvidence, {
    cloudflareAccountBindingId: resource.cloudflare.accountBindingId,
    neonProjectBindingId: resource.neon.projectBindingId,
    observedAt: resource.observedAt,
    validUntilOrReviewAt: resource.validUntilOrReviewAt,
  });

  return deepFreeze({
    ...root,
    ownerInputs: {
      ...root.ownerInputs,
      providerBoundEvidenceInput: {
        ...providerInput,
        complianceEvidence: {
          ...compliance,
          legalEvidence: [...compliance.legalEvidence, ...additions],
        },
      },
    },
  });
}

function requiredBundle(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.schemaVersion !== 1 ||
    value.application !== "ulc-linz" ||
    value.environment !== "production" ||
    value.ownerInputs === null ||
    typeof value.ownerInputs !== "object" ||
    Array.isArray(value.ownerInputs)
  ) {
    throw new Error("ULC M5-G production DPA evidence bundle is invalid.");
  }
  return value;
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

async function main(argv = process.argv.slice(2)) {
  if (argv.length !== 1) {
    throw new Error(
      "Usage: node tooling/ulc-linz-m5-production-dpa-evidence.mjs <bundle.json>",
    );
  }
  const bundle = JSON.parse(await readFile(resolve(argv[0]), "utf8"));
  const accountDpaEvidence = parseUlcLinzM5AccountBoundDpaEvidenceJson(
    process.env.ULC_LINZ_M5_DPA_ACCOUNT_BINDING_EVIDENCE,
  );
  const completed = completeUlcLinzM5ProductionDpaBundle(
    bundle,
    accountDpaEvidence,
  );
  process.stdout.write(`${JSON.stringify(completed, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : "M5-G production DPA evidence completion failed.",
    );
    process.exitCode = 1;
  });
}
