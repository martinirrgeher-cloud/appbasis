const USERNAME_PATTERN = /^[a-z0-9._]+$/;

export function normalizeUsername(username: string): string {
  const normalized = username.trim().toLowerCase();

  if (
    normalized.length < 3 ||
    normalized.length > 30 ||
    !USERNAME_PATTERN.test(normalized)
  ) {
    throw new TypeError(
      "Username must contain 3-30 lowercase letters, digits, dots, or underscores.",
    );
  }

  return normalized;
}

/**
 * Maps the public username to Better Auth's required internal email field.
 * The reserved `.invalid` domain is non-deliverable. Callers must never expose
 * this value as contact data or use it for notifications.
 */
export async function technicalEmailForUsername(
  username: string,
): Promise<string> {
  const normalized = normalizeUsername(username);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`appbasis-username\u0000${normalized}`),
  );
  const localPart = Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");

  return `${localPart}@identity.invalid`;
}
