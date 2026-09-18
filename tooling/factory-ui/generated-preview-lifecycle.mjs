import { loadGeneratedAppPreviewContract } from "../generated-app-preview-contract.mjs";
import { verifyGeneratedPreviewPublishedAtRef } from "./generated-preview-publication.mjs";
import { observeGeneratedPreviewRepositoryState } from "./generated-preview-repository-state.mjs";
import {
  deriveGeneratedPreviewRunEvidence,
  verifyGeneratedPreviewCurrentMainHead,
} from "./generated-preview-run-evidence.mjs";

const WORKFLOW_PATH = ".github/workflows/generated-app-preview-lifecycle.yml";
const WORKFLOW_URL =
  "https://github.com/martinirrgeher-cloud/appbasis/actions/workflows/generated-app-preview-lifecycle.yml";
const EXECUTION_CONTRACT_FILES = Object.freeze([WORKFLOW_PATH]);

const OPERATIONS = Object.freeze([
  operation(
    "hyperdrive",
    "Datenbank-Verbindung",
    "Dediziertes Hyperdrive für die ausgewählte Preview anlegen oder exakt validieren.",
  ),
  operation(
    "migrate",
    "Datenbank vorbereiten",
    "Das kanonische Datenbankmanifest atomar auf die leere Preview-Datenbank anwenden.",
  ),
  operation(
    "bootstrap",
    "Preview-Worker vorbereiten",
    "Den dedizierten Worker anlegen und das geschützte Identity-Secret installieren.",
  ),
  operation(
    "deploy",
    "Deploy & Tests",
    "Preview deployen und UI, CSP, Session-Grenze sowie Datenbank-Erreichbarkeit prüfen.",
  ),
]);

export async function deriveGeneratedPreviewLifecycle(
  repositoryRoot,
  definition,
  {
    publicationFetchImpl = fetch,
    repositoryStateImpl = observeGeneratedPreviewRepositoryState,
    runEvidenceFetchImpl = fetch,
  } = {},
) {
  try {
    const contract = await loadGeneratedAppPreviewContract(
      repositoryRoot,
      definition?.appId,
    );

    const initialRepositoryState = await repositoryStateImpl(repositoryRoot);
    if (
      initialRepositoryState?.status !== "clean" ||
      typeof initialRepositoryState.headSha !== "string"
    ) {
      return localContractReady(contract);
    }

    const runEvidence = await deriveGeneratedPreviewRunEvidence(
      contract.definition.appId,
      { fetchImpl: runEvidenceFetchImpl },
    );
    const expectedHeadSha =
      runEvidence.status === "available"
        ? runEvidence.exactHeadSha
        : initialRepositoryState.headSha;

    if (initialRepositoryState.headSha !== expectedHeadSha) {
      return localContractReady(contract);
    }

    const mainBeforePublication =
      await verifyGeneratedPreviewCurrentMainHead(expectedHeadSha, {
        fetchImpl: runEvidenceFetchImpl,
      });
    if (!mainBeforePublication) {
      return localContractReady(contract);
    }

    const publishedAtExpectedHead = await verifyGeneratedPreviewPublishedAtRef(
      repositoryRoot,
      contract.definition.appId,
      expectedHeadSha,
      {
        fetchImpl: publicationFetchImpl,
        additionalRepositoryFiles: EXECUTION_CONTRACT_FILES,
      },
    );

    const finalRepositoryState = await repositoryStateImpl(repositoryRoot);
    const exactCleanRepositoryState =
      finalRepositoryState?.status === "clean" &&
      finalRepositoryState.headSha === expectedHeadSha;
    const mainAfterPublication =
      await verifyGeneratedPreviewCurrentMainHead(expectedHeadSha, {
        fetchImpl: runEvidenceFetchImpl,
      });

    const publishedOnMain =
      publishedAtExpectedHead &&
      exactCleanRepositoryState &&
      mainAfterPublication;

    const status = !publishedOnMain
      ? "local-contract-ready"
      : runEvidence.status === "available"
        ? "workflow-ready"
        : "workflow-evidence-unavailable";
    const progressVerified = status === "workflow-ready";

    return Object.freeze({
      status,
      workflowName: "Generated App Preview Lifecycle",
      workflowPath: WORKFLOW_PATH,
      workflowUrl: WORKFLOW_URL,
      workflowRef: publishedOnMain ? "main" : null,
      exactHeadSha: progressVerified ? runEvidence.exactHeadSha : null,
      requiresExplicitApply: true,
      publishedOnMain,
      initialOperation: "hyperdrive",
      nextOperation: progressVerified ? runEvidence.nextOperation : null,
      progressEvidence:
        status === "workflow-ready"
          ? "verified"
          : status === "workflow-evidence-unavailable"
            ? "unavailable"
            : "not-applicable",
      completedOperations: Object.freeze(
        progressVerified ? [...runEvidence.completedOperations] : [],
      ),
      previewVerified: progressVerified && runEvidence.previewVerified,
      runs: Object.freeze(progressVerified ? [...runEvidence.runs] : []),
      operations: OPERATIONS,
      target: Object.freeze({
        environment: contract.target.environment,
        workerName: contract.target.workerName,
        hyperdriveName: contract.target.hyperdriveName,
        database: contract.target.database,
      }),
    });
  } catch {
    return Object.freeze({
      status: "not-eligible",
      workflowName: "Generated App Preview Lifecycle",
      workflowPath: WORKFLOW_PATH,
      workflowUrl: WORKFLOW_URL,
      exactHeadSha: null,
      requiresExplicitApply: true,
      publishedOnMain: false,
      initialOperation: null,
      nextOperation: null,
      progressEvidence: "not-applicable",
      completedOperations: Object.freeze([]),
      previewVerified: false,
      runs: Object.freeze([]),
      operations: OPERATIONS,
      target: null,
    });
  }
}

function localContractReady(contract) {
  return Object.freeze({
    status: "local-contract-ready",
    workflowName: "Generated App Preview Lifecycle",
    workflowPath: WORKFLOW_PATH,
    workflowUrl: WORKFLOW_URL,
    workflowRef: null,
    exactHeadSha: null,
    requiresExplicitApply: true,
    publishedOnMain: false,
    initialOperation: "hyperdrive",
    nextOperation: null,
    progressEvidence: "not-applicable",
    completedOperations: Object.freeze([]),
    previewVerified: false,
    runs: Object.freeze([]),
    operations: OPERATIONS,
    target: Object.freeze({
      environment: contract.target.environment,
      workerName: contract.target.workerName,
      hyperdriveName: contract.target.hyperdriveName,
      database: contract.target.database,
    }),
  });
}

function operation(id, label, detail) {
  return Object.freeze({ id, label, detail });
}
