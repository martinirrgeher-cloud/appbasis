import { Hono } from 'hono';

import { HEALTH_RESPONSE } from '../shared/health';

export const app = new Hono();

app.get('/api/health', (context) => context.json(HEALTH_RESPONSE));
