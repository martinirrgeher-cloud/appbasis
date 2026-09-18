import { loadGeneratedAppPreviewContract } from "../generated-app-preview-contract.mjs";

const WORKFLOW_PATH = ".github/workflows/generated-app-preview-lifecycle.yml";
const WORKFLOW_URL =
  "https://github.com/martinirrgeher-cloud/appbasis/actions/workflows/generated-app-preview-lifecycle.yml";

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
) {
  try {
    const contract = await loadGeneratedAppPreviewContract(
      repositoryRoot,
      definition?.appId,
    );

    return Object.freeze({
      status: "workflow-ready",
      workflowName: "Generated App Preview Lifecycle",
      workflowPath: WORKFLOW_PATH,
      workflowUrl: WORKFLOW_URL,
      requiresExplicitApply: true,
      nextOperation: "hyperdrive",
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
      requiresExplicitApply: true,
      nextOperation: null,
      operations: OPERATIONS,
      target: null,
    });
  }
}

function operation(id, label, detail) {
  return Object.freeze({ id, label, detail });
}
