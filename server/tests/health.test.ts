import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';

const app = createApp();

describe('health', () => {
  it('GET /health returns liveness without secrets', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('ana-meet-server');
    expect(typeof res.body.uptimeSeconds).toBe('number');
    const serialized = JSON.stringify(res.body).toLowerCase();
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('password');
  });

  it('GET /ready reports dependency checks with a safe shape', async () => {
    const res = await request(app).get('/ready');
    expect([200, 503]).toContain(res.status);
    expect(res.body.checks).toBeDefined();
    expect(['up', 'down']).toContain(res.body.checks.database);
    expect(['up', 'down']).toContain(res.body.checks.redis);
    const serialized = JSON.stringify(res.body).toLowerCase();
    expect(serialized).not.toContain('postgres://');
    expect(serialized).not.toContain('redis://');
  });

  it('unknown API routes return the consistent error shape', async () => {
    const res = await request(app).get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

