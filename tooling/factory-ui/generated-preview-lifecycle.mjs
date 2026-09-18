import { loadGeneratedAppPreviewContract } from "../generated-app-preview-contract.mjs";
import {
  verifyGeneratedPreviewPublishedAtRef,
  verifyGeneratedPreviewPublishedOnMain,
} from "./generated-preview-publication.mjs";
import { deriveGeneratedPreviewRunEvidence } from "./generated-preview-run-evidence.mjs";

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
    runEvidenceFetchImpl = fetch,
  } = {},
) {
  try {
    const contract = await loadGeneratedAppPreviewContract(
      repositoryRoot,
      definition?.appId,
    );

    const runEvidence = await deriveGeneratedPreviewRunEvidence(
      contract.definition.appId,
      { fetchImpl: runEvidenceFetchImpl },
    );

    const publishedOnMain =
      runEvidence.status === "available"
        ? await verifyGeneratedPreviewPublishedAtRef(
            repositoryRoot,
            contract.definition.appId,
            runEvidence.exactHeadSha,
            {
              fetchImpl: publicationFetchImpl,
              additionalRepositoryFiles: EXECUTION_CONTRACT_FILES,
            },
          )
        : await verifyGeneratedPreviewPublishedOnMain(
            repositoryRoot,
            contract.definition.appId,
            { fetchImpl: publicationFetchImpl },
          );

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
      progressEvidence: progressVerified ? "verified" : runEvidence.status,
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

function operation(id, label, detail) {
  return Object.freeze({ id, label, detail });
}
