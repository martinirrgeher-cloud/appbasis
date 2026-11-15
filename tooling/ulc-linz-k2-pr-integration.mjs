// Offline integration gate for the six independently prepared K2 draft PRs.
// Input is an operator-curated JSON export. No GitHub token, network or provider calls.
import { readFileSync } from 'node:fs';

export const EXPECTED = Object.freeze([633, 634, 635, 636, 637, 638]);
export function checkIntegrationInventory(input) {
  const errors = [];
  if (!input || !Array.isArray(input.pullRequests)) return { status: 'BLOCK', errors: ['missing pullRequests array'] };
  const seen = new Set();
  const paths = new Map();
  for (const p of input.pullRequests) {
    if (!p || !Number.isInteger(p.number) || !EXPECTED.includes(p.number) || seen.has(p.number)) {
      errors.push('unknown or duplicate PR number'); continue;
    }
    seen.add(p.number);
    if (p.base !== 'main' || p.draft !== true || p.merged !== false) errors.push('PR #' + p.number + ': unsafe state/base');
    if (!/^[a-f0-9]{40}$/.test(p.sha ?? '')) errors.push('PR #' + p.number + ': missing immutable HEAD SHA');
    if (!Array.isArray(p.files) || p.files.length === 0) errors.push('PR #' + p.number + ': missing changed-file inventory');
    else for (const file of p.files) {
      if (typeof file !== 'string' || !file || file.startsWith('/') || file.includes('..') || file.includes('\\')) {
        errors.push('PR #' + p.number + ': unsafe file path'); continue;
      }
      if (paths.has(file)) errors.push('overlap: ' + file + ' in #' + paths.get(file) + ' and #' + p.number);
      else paths.set(file, p.number);
    }
    if (!Array.isArray(p.checks) || p.checks.length === 0 ||
      p.checks.some(c => !c || c.status !== 'completed' || c.conclusion !== 'success')) {
      errors.push('PR #' + p.number + ': CI incomplete or failed');
    }
  }
  for (const n of EXPECTED) if (!seen.has(n)) errors.push('missing PR #' + n);
  return { status: errors.length ? 'BLOCK' : 'READY_FOR_HUMAN_REVIEW', errors };
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  try {
    const result = checkIntegrationInventory(JSON.parse(readFileSync(process.argv[2], 'utf8')));
    console.log(JSON.stringify(result));
    if (result.status !== 'READY_FOR_HUMAN_REVIEW') process.exitCode = 1;
  } catch {
    console.error('BLOCK: invalid or missing inventory');
    process.exitCode = 1;
  }
}
