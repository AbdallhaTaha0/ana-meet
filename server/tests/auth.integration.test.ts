import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { config } from '../src/config/env';
import { getSequelize, closeDatabase } from '../src/db/sequelize';
import { User } from '../src/db/models';
import { resetRateLimits } from './helpers';

// Full auth lifecycle against an isolated PostgreSQL test database.
// Requires TEST_DATABASE_URL (see server/.env.example). Skipped otherwise.
const shouldRun = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!shouldRun)('auth integration', () => {
  const app = createApp();
  const agent = request.agent(app);
  const ajax = { 'X-Requested-With': 'XMLHttpRequest' };

  const userPayload = {
    username: 'inttestuser',
    email: 'inttest@example.com',
    password: 's3cure-passphrase',
    displayName: 'Integration Test',
  };

  beforeAll(async () => {
    const url = config.databaseUrl;
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to reset non-test database: ${url}`);
    }
    await resetRateLimits();
    const db = getSequelize();
    await db.authenticate();
    // Test-only schema reset (never used outside the isolated test database).
    await db.sync({ force: true });
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it('registers a user and sets secure auth cookies', async () => {
    const res = await agent.post('/api/v1/auth/register').set(ajax).send(userPayload);
    expect(res.status).toBe(201);
    expect(res.body.user.username).toBe(userPayload.username);
    expect(res.body.user.publicId).toMatch(/^#/);
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(res.body.user).not.toHaveProperty('password');
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies.join(';')).toContain('am_access');
    expect(cookies.join(';')).toContain('am_refresh');
    expect(cookies.join(';')).toContain('HttpOnly');
  });

  it('rejects duplicate registration without revealing which field is taken', async () => {
    const res = await request(app).post('/api/v1/auth/register').set(ajax).send(userPayload);
    expect(res.status).toBe(409);
  });

  it('rejects invalid registration payloads', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .set(ajax)
      .send({ ...userPayload, username: 'other', email: 'bad', password: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('serializes concurrent duplicate registrations without 500s', async () => {
    const payload = (n: number) => ({
      username: 'raceuser',
      email: 'raceuser@example.com',
      password: 's3cure-passphrase',
      displayName: `Race ${n}`,
    });
    const results = await Promise.all(
      [0, 1, 2, 3, 4].map((n) => request(app).post('/api/v1/auth/register').set(ajax).send(payload(n))),
    );
    const statuses = results.map((r) => r.status);
    expect(statuses).toContain(201);
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(4);
    expect(statuses.some((s) => s >= 500)).toBe(false);
  });

  it('logs in and reads the current user', async () => {
    const login = await agent
      .post('/api/v1/auth/login')
      .set(ajax)
      .send({ identifier: userPayload.email, password: userPayload.password });
    expect(login.status).toBe(200);
    const me = await agent.get('/api/v1/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(userPayload.email);
    expect(me.headers['cache-control']).toBe('no-store');
    const conditional = await agent.get('/api/v1/auth/me').set('If-None-Match', 'W/"old"');
    expect(conditional.status).toBe(200);
  });

  it('returns identical errors for unknown user vs wrong password (no enumeration)', async () => {
    const unknown = await request(app)
      .post('/api/v1/auth/login')
      .set(ajax)
      .send({ identifier: 'nobody-here@example.com', password: 'whatever-password' });
    const wrong = await request(app)
      .post('/api/v1/auth/login')
      .set(ajax)
      .send({ identifier: userPayload.email, password: 'wrong-password' });
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
  });

  it('rejects unauthenticated access to /me', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects forged tokens (IDOR/auth bypass attempt)', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer forged.token.value');
    expect(res.status).toBe(401);
  });

  it('rotates refresh tokens on every use', async () => {
    const fresh = request.agent(app);
    await fresh.post('/api/v1/auth/login').set(ajax).send({
      identifier: userPayload.username,
      password: userPayload.password,
    });
    // Sequential rotations succeed; each refresh yields a new credential pair.
    expect((await fresh.post('/api/v1/auth/refresh').set(ajax)).status).toBe(200);
    expect((await fresh.post('/api/v1/auth/refresh').set(ajax)).status).toBe(200);
  });

  it('tolerates one benign retry but treats repeated replay as theft', async () => {
    // A single immediate retry (network duplicate) is re-anchored on the
    // replacement session; replaying the same stale token again is treated
    // as token theft and revokes every session of the user.
    const sibling = request.agent(app);
    const loginRes = await sibling.post('/api/v1/auth/login').set(ajax).send({
      identifier: userPayload.username,
      password: userPayload.password,
    });
    expect(loginRes.status).toBe(200);
    const firstRefreshCookie = (loginRes.headers['set-cookie'] as unknown as string[]).find((c) =>
      c.startsWith('am_refresh='),
    ) as string;

    const rotated = await sibling.post('/api/v1/auth/refresh').set(ajax);
    expect(rotated.status).toBe(200);

    const replayOnce = await request(app)
      .post('/api/v1/auth/refresh')
      .set(ajax)
      .set('Cookie', firstRefreshCookie);
    expect(replayOnce.status).toBe(200);

    const replayTwice = await request(app)
      .post('/api/v1/auth/refresh')
      .set(ajax)
      .set('Cookie', firstRefreshCookie);
    expect(replayTwice.status).toBe(401);
    expect(replayTwice.body.error.code).toBe('TOKEN_REUSED');

    // Theft response revoked all sessions: even the latest token is dead.
    const latestCookie = (replayOnce.headers['set-cookie'] as unknown as string[]).find((c) =>
      c.startsWith('am_refresh='),
    ) as string;
    const afterTheft = await request(app)
      .post('/api/v1/auth/refresh')
      .set(ajax)
      .set('Cookie', latestCookie);
    expect(afterTheft.status).toBe(401);
  });

  it('logs out the current session only', async () => {
    const a = request.agent(app);
    const b = request.agent(app);
    const creds = { identifier: userPayload.username, password: userPayload.password };
    await a.post('/api/v1/auth/login').set(ajax).send(creds);
    await b.post('/api/v1/auth/login').set(ajax).send(creds);

    const logout = await a.post('/api/v1/auth/logout').set(ajax);
    expect(logout.status).toBe(204);
    expect((await a.post('/api/v1/auth/refresh').set(ajax)).status).toBe(401);
    // The other device session survives a single-session logout.
    expect((await b.post('/api/v1/auth/refresh').set(ajax)).status).toBe(200);
  });

  it('logs out of all devices', async () => {
    const a = request.agent(app);
    const b = request.agent(app);
    const creds = { identifier: userPayload.username, password: userPayload.password };
    await a.post('/api/v1/auth/login').set(ajax).send(creds);
    await b.post('/api/v1/auth/login').set(ajax).send(creds);

    expect((await a.post('/api/v1/auth/logout-all').set(ajax)).status).toBe(204);
    expect((await b.get('/api/v1/auth/me')).status).toBe(401);
    expect((await a.post('/api/v1/auth/refresh').set(ajax)).status).toBe(401);
    expect((await b.post('/api/v1/auth/refresh').set(ajax)).status).toBe(401);
    expect((await b.post('/api/v1/auth/login').set(ajax).send(creds)).status).toBe(200);
    expect((await b.get('/api/v1/auth/me')).status).toBe(200);
  });

  it('blocks login and token use for disabled accounts', async () => {
    await User.update({ status: 'DISABLED' }, { where: { username: userPayload.username } });
    const login = await request(app)
      .post('/api/v1/auth/login')
      .set(ajax)
      .send({ identifier: userPayload.username, password: userPayload.password });
    expect(login.status).toBe(401);
    // Previously issued access tokens stop working once the account is disabled.
    const me = await agent.get('/api/v1/auth/me');
    expect(me.status).toBe(401);
  });
});

