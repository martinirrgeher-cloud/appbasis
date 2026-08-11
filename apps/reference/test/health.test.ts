import { describe, expect, it } from 'vitest';

import { HEALTH_RESPONSE } from '../shared/health';
import { app } from '../worker/app';

describe('GET /api/health', () => {
  it('liefert den typisierten Health-Status', async () => {
    const response = await app.request('/api/health');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    await expect(response.json()).resolves.toEqual(HEALTH_RESPONSE);
  });

  it('beantwortet unbekannte API-Routen nicht mit einem falschen Erfolg', async () => {
    const response = await app.request('/api/unknown');

    expect(response.status).toBe(404);
  });
});
