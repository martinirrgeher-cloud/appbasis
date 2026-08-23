import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { assertNoPublicWorkerIngressEvidence } from "./worker-public-ingress-contract.mjs";
import { evaluateUlcLinzProductionResourceBinding } from "./ulc-linz-m6-production-resource-binding.mjs";

const EMPTY_EVIDENCE = Object.freeze({});
const VERIFIED_EVIDENCE = Object.freeze({
  privilegedControlPlaneIsolation: true,
});
const PROVIDER = "cloudflare";
const PROVIDER_API_SOURCE = "provider-api";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

const PUBLIC_RUNTIME_FILES = Object.freeze([
  Object.freeze({
    path: "apps/ulc-linz/worker/app.ts",
    url: new URL("../apps/ulc-linz/worker/app.ts", import.meta.url),
    gitBlobSha: "3acdcd47bf696c23334c15a11fe80c70368d608c",
  }),
  Object.freeze({
    path: "apps/ulc-linz/worker/index.ts",
    url: new URL("../apps/ulc-linz/worker/index.ts", import.meta.url),
    gitBlobSha: "1b86c35d8f912be25efe6da67cc4d51047da5495",
  }),
]);

const ROOT_FIELDS = Object.freeze([
  "resourceBindingEvidence",
  "controlPlaneEvidence",
]);
const CONTROL_PLANE_FIELDS = Object.freeze([
  "schemaVersion",
  "application",
  "environment",
  "observedAt",
  "validUntilOrReviewAt",
  "provider",
  "providerAccountBindingId",
  "publicRuntimeBindingId",
  "inventorySource",
  "privilegedComponentInventoryComplete",
  "publicRuntimeBindingInventoryComplete",
  "privilegedComponents",
]);
const COMPONENT_FIELDS = Object.freeze([
  "runtimeBindingId",
  "identitySource",
  "dedicatedControlPlaneResource",
  "publicIngress",
  "internalServiceBinding",
  "publicFallbackPresent",
]);
const SERVICE_BINDING_FIELDS = Object.freeze([
  "sourceRuntimeBindingId",
  "targetRuntimeBindingId",
  "identitySource",
  "uniqueMatch",
]);

export function deriveUlcLinzM5HControlPlaneEvidence(
  input,
  { now = new Date() } = {},
) {
  try {
    const root = exactRecord(input, ROOT_FIELDS);
    const nowDate = requiredDate(now);
    const resourceBinding = evaluateUlcLinzProductionResourceBinding(
      root.resourceBindingEvidence,
      { now: nowDate },
    );
    assertCurrentPublicRuntimeContract();
    const controlPlane = exactRecord(
      root.controlPlaneEvidence,
      CONTROL_PLANE_FIELDS,
    );

    if (
      controlPlane.schemaVersion !== 1 ||
      controlPlane.application !== "ulc-linz" ||
      controlPlane.environment !== "production" ||
      controlPlane.provider !== PROVIDER ||
      controlPlane.inventorySource !== PROVIDER_API_SOURCE ||
      controlPlane.privilegedComponentInventoryComplete !== true ||
      controlPlane.publicRuntimeBindingInventoryComplete !== true
    ) {
      return EMPTY_EVIDENCE;
    }

    if (
      controlPlane.observedAt !== resourceBinding.observedAt ||
      controlPlane.validUntilOrReviewAt !== resourceBinding.validUntilOrReviewAt ||
      controlPlane.providerAccountBindingId !==
        root.resourceBindingEvidence.cloudflare.accountBindingId ||
      controlPlane.publicRuntimeBindingId !==
        root.resourceBindingEvidence.cloudflare.runtimeBindingId
    ) {
      return EMPTY_EVIDENCE;
    }

    const observedAt = canonicalTimestamp(controlPlane.observedAt);
    if (
      observedAt === null ||
      nowDate.getTime() < observedAt.getTime() ||
      nowDate.getTime() - observedAt.getTime() >= MAX_AGE_MS
    ) {
      return EMPTY_EVIDENCE;
    }

    requireOpaqueIdentifier(controlPlane.providerAccountBindingId);
    requireOpaqueIdentifier(controlPlane.publicRuntimeBindingId);

    const privilegedComponents = exactArray(controlPlane.privilegedComponents);

    const seenRuntimeBindings = new Set();
    for (const candidate of privilegedComponents) {
      const component = exactRecord(candidate, COMPONENT_FIELDS);
      requireOpaqueIdentifier(component.runtimeBindingId);
      if (
        component.runtimeBindingId === controlPlane.publicRuntimeBindingId ||
        seenRuntimeBindings.has(component.runtimeBindingId) ||
        component.identitySource !== PROVIDER_API_SOURCE ||
        component.dedicatedControlPlaneResource !== true ||
        component.publicFallbackPresent !== false
      ) {
        return EMPTY_EVIDENCE;
      }
      seenRuntimeBindings.add(component.runtimeBindingId);

      assertNoPublicWorkerIngressEvidence(component.publicIngress);

      const binding = exactRecord(
        component.internalServiceBinding,
        SERVICE_BINDING_FIELDS,
      );
      requireOpaqueIdentifier(binding.sourceRuntimeBindingId);
      requireOpaqueIdentifier(binding.targetRuntimeBindingId);
      if (
        binding.sourceRuntimeBindingId !== controlPlane.publicRuntimeBindingId ||
        binding.targetRuntimeBindingId !== component.runtimeBindingId ||
        binding.identitySource !== PROVIDER_API_SOURCE ||
        binding.uniqueMatch !== true
      ) {
        return EMPTY_EVIDENCE;
      }
    }

    return VERIFIED_EVIDENCE;
  } catch {
    return EMPTY_EVIDENCE;
  }
}

function assertCurrentPublicRuntimeContract() {
  for (const entry of PUBLIC_RUNTIME_FILES) {
    const content = readFileSync(entry.url);
    const digest = createHash("sha1")
      .update(`blob ${content.length}\0`, "utf8")
      .update(content)
      .digest("hex");
    if (digest !== entry.gitBlobSha) {
      throw new Error("ULC Linz M5-H public runtime contract drifted.");
    }
  }
}

function exactRecord(value, fields) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.getOwnPropertySymbols(value).length !== 0
  ) {
    throw new Error("ULC Linz M5-H control-plane evidence is invalid.");
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors);
  if (
    keys.length !== fields.length ||
    fields.some((field) => !Object.hasOwn(descriptors, field)) ||
    keys.some((key) => !fields.includes(key))
  ) {
    throw new Error("ULC Linz M5-H control-plane evidence is invalid.");
  }

  for (const descriptor of Object.values(descriptors)) {
    if (
      !Object.hasOwn(descriptor, "value") ||
      descriptor.enumerable !== true ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    ) {
      throw new Error("ULC Linz M5-H control-plane evidence is invalid.");
    }
  }
  return value;
}

function exactArray(value) {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    Object.getOwnPropertySymbols(value).length !== 0
  ) {
    throw new Error("ULC Linz M5-H control-plane evidence is invalid.");
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  const descriptorKeys = Object.keys(descriptors);
  const keys = descriptorKeys.filter((key) => key !== "length");
  if (
    descriptorKeys.length !== value.length + 1 ||
    !Object.hasOwn(descriptors, "length") ||
    keys.length !== value.length ||
    keys.some((key, index) => key !== String(index))
  ) {
    throw new Error("ULC Linz M5-H control-plane evidence is invalid.");
  }
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (
      !Object.hasOwn(descriptor, "value") ||
      descriptor.enumerable !== true ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    ) {
      throw new Error("ULC Linz M5-H control-plane evidence is invalid.");
    }
  }
  return value;
}

function requireOpaqueIdentifier(value) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 200 ||
    value !== value.trim() ||
    !/^[A-Za-z0-9._:-]+$/.test(value)
  ) {
    throw new Error("ULC Linz M5-H control-plane evidence is invalid.");
  }
}

function canonicalTimestamp(value) {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    return null;
  }
  return parsed;
}

function requiredDate(value) {
  const parsed =
    value instanceof Date
      ? new Date(value.getTime())
      : typeof value === "string"
        ? new Date(value)
        : null;
  if (
    parsed === null ||
    !Number.isFinite(parsed.getTime()) ||
    (typeof value === "string" && parsed.toISOString() !== value)
  ) {
    throw new Error("ULC Linz M5-H control-plane evidence clock is invalid.");
  }
  return parsed;
}