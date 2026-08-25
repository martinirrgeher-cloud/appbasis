import { ULC_LINZ_M6_PRODUCTION_EXECUTION_PLAN } from "./ulc-linz-m6-production-preflight.mjs";

const ACCESS_BOOTSTRAP_STEP_ID = "production-access-bootstrap";
const ROLE_BINDING_WORKFLOW = ".github/workflows/m5-ulc-security-log-role-binding.yml";

export const ULC_LINZ_M6_PRODUCTION_ACCESS_BOOTSTRAP_CONTRACT = Object.freeze({
  schemaVersion: 1,
  application: "ulc-linz",
  environment: "production",
  stepId: ACCESS_BOOTSTRAP_STEP_ID,
  protectedRoleBindingWorkflow: ROLE_BINDING_WORKFLOW,
  protectedRoleBindingConfirmation: "BIND-ULC-M5-SECURITY-LOG-ROLES",
  requiresCompletedStepIds: Object.freeze([
    "production-migrations",
    "production-worker-deploy",
  ]),
  requiredBeforeStepIds: Object.freeze([
    "backup-recovery-validation",
    "m5-production-evidence",
  ]),
  productionReleaseAuthorized: false,
});

export function isCanonicalUlcLinzM6ProductionAccessBootstrapContract(
  plan = ULC_LINZ_M6_PRODUCTION_EXECUTION_PLAN,
) {
  const accessBootstrap = plan?.steps?.find(
    (step) => step?.id === ACCESS_BOOTSTRAP_STEP_ID,
  );
  const backupRecovery = plan?.steps?.find(
    (step) => step?.id === "backup-recovery-validation",
  );
  const m5Evidence = plan?.steps?.find(
    (step) => step?.id === "m5-production-evidence",
  );

  return Boolean(
    accessBootstrap?.kind === "application-write" &&
      accessBootstrap?.approvalRequired === true &&
      exactStrings(
        accessBootstrap?.requires,
        ULC_LINZ_M6_PRODUCTION_ACCESS_BOOTSTRAP_CONTRACT.requiresCompletedStepIds,
      ) &&
      backupRecovery?.requires?.includes(ACCESS_BOOTSTRAP_STEP_ID) === true &&
      m5Evidence?.requires?.includes(ACCESS_BOOTSTRAP_STEP_ID) === true,
  );
}

function exactStrings(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}
