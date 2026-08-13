import assert from "node:assert/strict";
import test from "node:test";

import {
  readReferenceRootAdminEnvironment,
  ReferenceRootAdminEnvironmentError,
} from "./bootstrap-reference-root-admin.mjs";

const valid = {
  APPBASIS_ROOT_ADMIN_TARGET: "reference-preview",
  APPBASIS_ROOT_ADMIN_APPLY: "1",
  APPBASIS_DATABASE_URL: "postgres://postgres:postgres@localhost:5432/appbasis",
  APPBASIS_BETTER_AUTH_SECRET: "x".repeat(40),
  APPBASIS_PREVIEW_URL: "https://preview.example.test",
  APPBASIS_ROOT_ADMIN_USERNAME: "preview.root",
  APPBASIS_ROOT_ADMIN_DISPLAY_NAME: "Preview Root",
  APPBASIS_ROOT_ADMIN_PASSWORD: "y".repeat(24),
};

test("requires the exact preview target and explicit apply gate", () => {
  assert.throws(
    () => readReferenceRootAdminEnvironment({ ...valid, APPBASIS_ROOT_ADMIN_TARGET: "other" }),
    ReferenceRootAdminEnvironmentError,
  );
  assert.throws(
    () => readReferenceRootAdminEnvironment({ ...valid, APPBASIS_ROOT_ADMIN_APPLY: "0" }),
    ReferenceRootAdminEnvironmentError,
  );
});

test("requires every protected runtime input", () => {
  for (const name of [
    "APPBASIS_DATABASE_URL",
    "APPBASIS_BETTER_AUTH_SECRET",
    "APPBASIS_PREVIEW_URL",
    "APPBASIS_ROOT_ADMIN_USERNAME",
    "APPBASIS_ROOT_ADMIN_DISPLAY_NAME",
    "APPBASIS_ROOT_ADMIN_PASSWORD",
  ]) {
    assert.throws(
      () => readReferenceRootAdminEnvironment({ ...valid, [name]: "" }),
      ReferenceRootAdminEnvironmentError,
    );
  }
});
