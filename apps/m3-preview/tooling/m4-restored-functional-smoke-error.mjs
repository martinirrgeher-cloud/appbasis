function sanitizeRestoreSmokeMessage(value) {
  return value
    .replace(/\bpostgres(?:ql)?:\/\/[^\s]+/giu, "[REDACTED_DATABASE_URL]")
    .replace(/(^|\n)\s*params:\s*[^\n]*/giu, "$1params: [REDACTED]")
    .replace(/([?&](?:password|token|secret|key)=)[^&\s]+/giu, "$1[REDACTED]");
}

export function safeRestoreSmokeError(error) {
  const details = [];
  let current = error;
  const seen = new Set();
  for (let depth = 0; depth < 4 && current !== null && typeof current === "object"; depth += 1) {
    if (seen.has(current)) break;
    seen.add(current);
    const name = typeof current.name === "string" ? current.name : "Error";
    const message =
      typeof current.message === "string"
        ? sanitizeRestoreSmokeMessage(current.message)
        : "unknown failure";
    const code = typeof current.code === "string" ? current.code : null;
    const severity = typeof current.severity === "string" ? current.severity : null;
    const routine = typeof current.routine === "string" ? current.routine : null;
    details.push(
      [
        name,
        code === null ? null : `code=${code}`,
        severity === null ? null : `severity=${severity}`,
        routine === null ? null : `routine=${routine}`,
        message,
      ]
        .filter((value) => value !== null)
        .join(" | "),
    );
    current = current.cause;
  }
  return details.length === 0
    ? "M4 restored functional smoke failed."
    : details.join(" <- caused by: ");
}
