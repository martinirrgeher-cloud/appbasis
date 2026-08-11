export const HEALTH_RESPONSE = {
  status: 'ok',
  service: 'appbasis-reference',
  apiVersion: 1,
} as const;

export type HealthResponse = typeof HEALTH_RESPONSE;

export function isHealthResponse(value: unknown): value is HealthResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    candidate.status === HEALTH_RESPONSE.status &&
    candidate.service === HEALTH_RESPONSE.service &&
    candidate.apiVersion === HEALTH_RESPONSE.apiVersion
  );
}
