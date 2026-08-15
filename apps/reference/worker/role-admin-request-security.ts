const ROLE_ADMIN_MUTATION_METHODS = new Set(['POST', 'PUT', 'DELETE']);
const ROLE_ADMIN_JSON_BODY_METHODS = new Set(['POST', 'PUT']);

export function roleAdminMutationProtectionResponse(
  request: Request,
  expectedOrigin: string,
): Response | null {
  const method = request.method.toUpperCase();
  if (!ROLE_ADMIN_MUTATION_METHODS.has(method)) return null;

  const requestOrigin = normalizedOrigin(request.headers.get('origin'));
  if (requestOrigin === null || requestOrigin !== expectedOrigin) {
    return jsonError(
      403,
      'INVALID_REQUEST_ORIGIN',
      'Role administration mutations require the configured same-origin request context.',
    );
  }

  if (ROLE_ADMIN_JSON_BODY_METHODS.has(method) && requestMediaType(request) !== 'application/json') {
    return jsonError(
      415,
      'UNSUPPORTED_MEDIA_TYPE',
      'Role administration request bodies must use application/json.',
    );
  }

  return null;
}

function normalizedOrigin(value: string | null): string | null {
  if (value === null || value.length === 0 || value === 'null') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (url.pathname !== '/' || url.search.length > 0 || url.hash.length > 0) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function requestMediaType(request: Request): string | null {
  const contentType = request.headers.get('content-type');
  if (contentType === null) return null;
  const separator = contentType.indexOf(';');
  const mediaType = (separator === -1 ? contentType : contentType.slice(0, separator))
    .trim()
    .toLowerCase();
  return mediaType.length === 0 ? null : mediaType;
}

function jsonError(status: 403 | 415, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'no-store',
    },
  });
}
