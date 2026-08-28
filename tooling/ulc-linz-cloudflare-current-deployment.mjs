export function requireCurrentUlcLinzCloudflareDeployment(
  deployments,
  { label = "ULC production Cloudflare deployment inventory" } = {},
) {
  if (!Array.isArray(deployments) || deployments.length < 1) {
    throw new Error(`${label} is empty or invalid.`);
  }

  let current = null;
  let currentTimestamp = Number.NEGATIVE_INFINITY;
  let currentTimestampCount = 0;

  for (const deployment of deployments) {
    if (deployment === null || typeof deployment !== "object" || Array.isArray(deployment)) {
      throw new Error(`${label} contains an invalid deployment.`);
    }
    const createdOn = deployment.created_on;
    if (typeof createdOn !== "string" || createdOn.length < 1) {
      throw new Error(`${label} contains a deployment without created_on.`);
    }
    const createdOnTimestamp = Date.parse(createdOn);
    if (!Number.isFinite(createdOnTimestamp)) {
      throw new Error(`${label} contains an invalid created_on timestamp.`);
    }

    if (createdOnTimestamp > currentTimestamp) {
      current = deployment;
      currentTimestamp = createdOnTimestamp;
      currentTimestampCount = 1;
    } else if (createdOnTimestamp === currentTimestamp) {
      currentTimestampCount += 1;
    }
  }

  if (!current || currentTimestampCount !== 1) {
    throw new Error(`${label} has no uniquely newest deployment.`);
  }
  if (!Array.isArray(current.versions) || current.versions.length !== 1) {
    throw new Error(`${label} current deployment is not a single-version deployment.`);
  }
  const [version] = current.versions;
  if (
    version === null ||
    typeof version !== "object" ||
    Array.isArray(version) ||
    version.percentage !== 100
  ) {
    throw new Error(`${label} current deployment does not route 100% to one version.`);
  }

  return Object.freeze({ deployment: current, version });
}
