const baseURL = requiredURL(process.env.APPBASIS_PREVIEW_URL);
const username = optionalText(process.env.APPBASIS_SMOKE_USERNAME);
const password = optionalText(process.env.APPBASIS_SMOKE_PASSWORD);
const newPassword = optionalText(process.env.APPBASIS_SMOKE_NEW_PASSWORD);
const mutate = process.env.APPBASIS_SMOKE_MUTATE === '1';

await assertHealth();

if (username === null) {
  console.log('Reference preview smoke PASS: health only.');
  process.exit(0);
}
if (password === null) {
  throw new Error('APPBASIS_SMOKE_PASSWORD is required when APPBASIS_SMOKE_USERNAME is set.');
}

let sessionCookie = null;
const signedIn = await request('/api/auth/sign-in', {
  method: 'POST',
  body: { username, password },
});
sessionCookie = signedIn.cookie;
let session = signedIn.payload;

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
  sessionCookie = changed.cookie ?? sessionCookie;
  session = changed.payload;
}

assertFullSession(session);
const current = await request('/api/auth/session', { cookie: sessionCookie });
assertFullSession(current.payload);

const before = await request('/api/tasks', { cookie: sessionCookie });
assertTaskList(before.payload);

if (mutate) {
  const marker = new Date().toISOString();
  const createdResponse = await request('/api/tasks', {
    method: 'POST',
    cookie: sessionCookie,
    body: {
      title: `Preview smoke ${marker}`,
      description: 'Automated Demo v0.1 acceptance smoke.',
    },
  });
  const created = assertTask(createdResponse.payload?.task);
  if (created.status !== 'open') throw new Error('New smoke task is not open.');

  const persisted = await request('/api/tasks', { cookie: sessionCookie });
  const persistedTasks = assertTaskList(persisted.payload);
  if (!persistedTasks.some((task) => task.id === created.id && task.status === 'open')) {
    throw new Error('Created smoke task was not persisted across requests.');
  }

  const toggledResponse = await request(
    `/api/tasks/${encodeURIComponent(created.id)}/toggle`,
    { method: 'POST', cookie: sessionCookie },
  );
  const toggled = assertTask(toggledResponse.payload?.task);
  if (toggled.status !== 'completed') {
    throw new Error('Smoke task did not toggle to completed.');
  }

  const finalList = await request('/api/tasks', { cookie: sessionCookie });
  const finalTasks = assertTaskList(finalList.payload);
  if (!finalTasks.some((task) => task.id === created.id && task.status === 'completed')) {
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

  const response = await fetch(new URL(path, baseURL), {
    method: options.method ?? 'GET',
    headers,
    ...(body === undefined ? {} : { body }),
    redirect: 'error',
  });
  const payload = await readJson(response);
  if (!response.ok) {
    const code = payload?.error?.code ?? `HTTP_${response.status}`;
    throw new Error(`Reference preview request failed: ${code}.`);
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

function assertFullSession(value) {
  if (
    value === null ||
    typeof value !== 'object' ||
    value.access !== 'full' ||
    value.identity?.accountStatus !== 'active' ||
    value.identity?.mustChangePassword !== false
  ) {
    throw new Error('Reference session is not in full active access state.');
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
    typeof value.title !== 'string' ||
    typeof value.description !== 'string' ||
    (value.status !== 'open' && value.status !== 'completed')
  ) {
    throw new Error('Task response has an invalid shape.');
  }
  return value;
}

function requiredURL(value) {
  const normalized = optionalText(value);
  if (normalized === null) throw new Error('APPBASIS_PREVIEW_URL is required.');
  let url;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error('APPBASIS_PREVIEW_URL must be a valid absolute URL.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('APPBASIS_PREVIEW_URL must use http or https.');
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
