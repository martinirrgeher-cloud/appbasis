const baseURL = requiredURL(process.env.APPBASIS_PREVIEW_URL, 'APPBASIS_PREVIEW_URL');
const trustedPreviewOrigin = optionalURL(
  process.env.APPBASIS_TRUSTED_PREVIEW_ORIGIN,
  'APPBASIS_TRUSTED_PREVIEW_ORIGIN',
);
const username = optionalText(process.env.APPBASIS_SMOKE_USERNAME);
const password = optionalText(process.env.APPBASIS_SMOKE_PASSWORD);
const newPassword = optionalText(process.env.APPBASIS_SMOKE_NEW_PASSWORD);
const mutate = process.env.APPBASIS_SMOKE_MUTATE === '1';

if (mutate && username === null) {
  throw new Error('Mutation smoke requires configured authentication credentials.');
}
if (username !== null) {
  if (baseURL.protocol !== 'https:') {
    throw new Error('Authenticated Reference preview smoke requires HTTPS.');
  }
  if (trustedPreviewOrigin === null || trustedPreviewOrigin.protocol !== 'https:') {
    throw new Error('Authenticated Reference preview smoke requires a trusted HTTPS origin.');
  }
  if (baseURL.origin !== trustedPreviewOrigin.origin) {
    throw new Error('Authenticated Reference preview target does not match the trusted origin.');
  }
  if (password === null) {
    throw new Error('APPBASIS_SMOKE_PASSWORD is required when APPBASIS_SMOKE_USERNAME is set.');
  }
}

await assertHealth();

if (username === null) {
  console.log('Reference preview smoke PASS: health only.');
  process.exit(0);
}

const expectedUsername = username.toLowerCase();
const signedIn = await request('/api/auth/sign-in', {
  method: 'POST',
  body: { username, password },
});
let sessionCookie = requireSessionCookie(signedIn.cookie);
let session = signedIn.payload;
const signedInIdentity = assertSignedInSession(session, expectedUsername);

if (session.access === 'password-change-required') {
  if (newPassword === null) {
    throw new Error(
      'APPBASIS_SMOKE_NEW_PASSWORD is required when the smoke identity must change its password.',
    );
  }
  const changed = await request('/api/auth/change-required-password', {
    method: 'POST',
    cookie: sessionCookie,
    body: {
      currentPassword: password,
      newPassword,
      idempotencyKey: crypto.randomUUID(),
    },
  });
  sessionCookie = requireSessionCookie(changed.cookie);
  session = changed.payload;
}

assertFullSession(session, expectedUsername, signedInIdentity.identityId);
const current = await request('/api/auth/session', { cookie: sessionCookie });
assertFullSession(current.payload, expectedUsername, signedInIdentity.identityId);

const before = await request('/api/tasks', { cookie: sessionCookie });
const beforeTasks = assertTaskList(before.payload);

if (mutate) {
  const marker = crypto.randomUUID();
  const requestedTitle = `Preview smoke ${marker}`;
  const requestedDescription = `Automated Demo v0.1 acceptance smoke ${marker}.`;
  const beforeIds = new Set(beforeTasks.map((task) => task.id));

  const createdResponse = await request('/api/tasks', {
    method: 'POST',
    cookie: sessionCookie,
    body: {
      title: requestedTitle,
      description: requestedDescription,
    },
  });
  const created = assertTask(createdResponse.payload?.task);
  if (
    beforeIds.has(created.id) ||
    created.title !== requestedTitle ||
    created.description !== requestedDescription ||
    created.status !== 'open'
  ) {
    throw new Error('Task creation did not return the requested new smoke task.');
  }

  const persisted = await request('/api/tasks', { cookie: sessionCookie });
  const persistedTasks = assertTaskList(persisted.payload);
  if (!persistedTasks.some((task) => sameTask(task, created, 'open'))) {
    throw new Error('Created smoke task was not persisted across requests.');
  }

  const toggledResponse = await request(
    `/api/tasks/${encodeURIComponent(created.id)}/toggle`,
    { method: 'POST', cookie: sessionCookie },
  );
  const toggled = assertTask(toggledResponse.payload?.task);
  if (!sameTask(toggled, created, 'completed')) {
    throw new Error('Smoke task did not toggle to the expected completed state.');
  }

  const finalList = await request('/api/tasks', { cookie: sessionCookie });
  const finalTasks = assertTaskList(finalList.payload);
  if (!finalTasks.some((task) => sameTask(task, created, 'completed'))) {
    throw new Error('Toggled smoke task status was not persisted.');
  }
}

console.log(
  mutate
    ? 'Reference preview smoke PASS: health, auth, session, tasks persistence and toggle.'
    : 'Reference preview smoke PASS: health, auth, session and task read.',
);

async function assertHealth() {
  const response = await request('/api/health');
  const health = response.payload;
  if (
    health?.status !== 'ok' ||
    health?.service !== 'appbasis-reference' ||
    health?.apiVersion !== 1
  ) {
    throw new Error('Reference health response does not match the Demo v0.1 contract.');
  }
}

async function request(path, options = {}) {
  const headers = new Headers({ accept: 'application/json' });
  if (options.cookie) headers.set('cookie', options.cookie);
  let body;
  if (options.body !== undefined) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(options.body);
  }

  let response;
  try {
    response = await fetch(new URL(path, baseURL), {
      method: options.method ?? 'GET',
      headers,
      ...(body === undefined ? {} : { body }),
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error('Reference preview request failed before receiving a response.');
  }

  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error('Reference preview request returned a non-success status.');
  }
  return { payload, cookie: cookiePair(response.headers.get('set-cookie')) };
}

async function readJson(response) {
  if (response.headers.get('content-type')?.includes('application/json') !== true) {
    return null;
  }
  try {
    return await response.json();
  } catch {
    throw new Error('Reference preview returned invalid JSON.');
  }
}

function cookiePair(value) {
  if (value === null || value.trim().length === 0) return null;
  return value.split(';', 1)[0] ?? null;
}

function requireSessionCookie(value) {
  if (value === null) {
    throw new Error('Reference authentication did not return a usable session cookie.');
  }
  return value;
}

function assertSignedInSession(value, expectedUsername) {
  if (
    value === null ||
    typeof value !== 'object' ||
    (value.access !== 'full' && value.access !== 'password-change-required') ||
    value.identity === null ||
    typeof value.identity !== 'object' ||
    typeof value.identity.identityId !== 'string' ||
    value.identity.identityId.length === 0 ||
    value.identity.username !== expectedUsername ||
    value.identity.accountStatus !== 'active' ||
    (value.access === 'full' && value.identity.mustChangePassword !== false) ||
    (value.access === 'password-change-required' && value.identity.mustChangePassword !== true)
  ) {
    throw new Error('Reference sign-in returned an unexpected identity state.');
  }
  return value.identity;
}

function assertFullSession(value, expectedUsername, expectedIdentityId) {
  const identity = assertSignedInSession(value, expectedUsername);
  if (
    value.access !== 'full' ||
    identity.identityId !== expectedIdentityId ||
    identity.mustChangePassword !== false
  ) {
    throw new Error('Reference session is not the expected full active identity.');
  }
  return value;
}

function assertTaskList(value) {
  if (value === null || typeof value !== 'object' || !Array.isArray(value.tasks)) {
    throw new Error('Task list response has an invalid shape.');
  }
  return value.tasks.map(assertTask);
}

function assertTask(value) {
  if (
    value === null ||
    typeof value !== 'object' ||
    typeof value.id !== 'string' ||
    value.id.length === 0 ||
    typeof value.title !== 'string' ||
    typeof value.description !== 'string' ||
    (value.status !== 'open' && value.status !== 'completed')
  ) {
    throw new Error('Task response has an invalid shape.');
  }
  return value;
}

function sameTask(candidate, expected, status) {
  return (
    candidate.id === expected.id &&
    candidate.title === expected.title &&
    candidate.description === expected.description &&
    candidate.status === status
  );
}

function requiredURL(value, field) {
  const url = optionalURL(value, field);
  if (url === null) throw new Error(`${field} is required.`);
  return url;
}

function optionalURL(value, field) {
  const normalized = optionalText(value);
  if (normalized === null) return null;
  let url;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error(`${field} must be a valid absolute URL.`);
  }
  if (
    (url.protocol !== 'https:' && url.protocol !== 'http:') ||
    url.username.length > 0 ||
    url.password.length > 0
  ) {
    throw new Error(`${field} must be a credential-free HTTP(S) URL.`);
  }
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url;
}

function optionalText(value) {
  if (value === undefined) return null;
  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}
