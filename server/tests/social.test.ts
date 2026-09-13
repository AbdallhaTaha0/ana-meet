import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { config } from '../src/config/env';
import { getSequelize, closeDatabase } from '../src/db/sequelize';
import { User } from '../src/db/models';
import { resetRateLimits } from './helpers';

// Phase 3: users search/profiles, contacts, blocks — including the
// server-side blocking enforcement shared by future phases.
const shouldRun = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!shouldRun)('users, contacts, blocks', () => {
  const app = createApp();
  const ajax = { 'X-Requested-With': 'XMLHttpRequest' };
  const agents = {
    alice: request.agent(app),
    bob: request.agent(app),
    carol: request.agent(app),
  };
  const ids: Record<string, string> = {};
  type Agent = (typeof agents)['alice'];

  async function register(agent: Agent, username: string, displayName: string): Promise<string> {
    const res = await agent.post('/api/v1/auth/register').set(ajax).send({
      username,
      email: `${username}@example.com`,
      password: 's3cure-passphrase',
      displayName,
    });
    expect(res.status).toBe(201);
    return res.body.user.id as string;
  }

  beforeAll(async () => {
    const url = config.databaseUrl;
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to reset non-test database: ${url}`);
    }
    await resetRateLimits();
    const db = getSequelize();
    await db.authenticate();
    await db.sync({ force: true });

    ids.alice = await register(agents.alice, 'alice', 'Alice Anderson');
    ids.bob = await register(agents.bob, 'bob', 'Bob Brown');
    ids.carol = await register(agents.carol, 'carol', 'Carol Clark');
  });

  afterAll(async () => {
    await closeDatabase();
  });

  describe('user search', () => {
    it('finds users by username prefix, display name, and public id', async () => {
      const byUsername = await agents.alice.get('/api/v1/users/search').query({ q: 'bo' });
      expect(byUsername.status).toBe(200);
      expect(byUsername.body.items.map((u: { username: string }) => u.username)).toContain('bob');

      const byDisplay = await agents.alice.get('/api/v1/users/search').query({ q: 'Clark' });
      expect(byDisplay.body.items.map((u: { username: string }) => u.username)).toContain('carol');

      const me = await agents.bob.get('/api/v1/auth/me');
      const publicId = me.body.user.publicId as string;
      const byPublicId = await agents.alice
        .get('/api/v1/users/search')
        .query({ q: publicId });
      expect(byPublicId.body.items.map((u: { username: string }) => u.username)).toContain('bob');
    });

    it('never exposes email addresses in search results', async () => {
      const res = await agents.alice.get('/api/v1/users/search').query({ q: 'bob' });
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toContain('@example.com');
      for (const item of res.body.items) {
        expect(Object.keys(item).sort()).toEqual(['displayName', 'id', 'isBot', 'publicId', 'username']);
      }
    });

    it('excludes self and respects the limit bound', async () => {
      const res = await agents.alice.get('/api/v1/users/search').query({ q: 'a', limit: 1 });
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].username).not.toBe('alice');

      const tooBig = await agents.alice.get('/api/v1/users/search').query({ q: 'a', limit: 500 });
      expect(tooBig.status).toBe(400);
    });

    it('rejects empty queries and unauthenticated search', async () => {
      expect((await agents.alice.get('/api/v1/users/search').query({ q: '' })).status).toBe(400);
      expect((await request(app).get('/api/v1/users/search').query({ q: 'bob' })).status).toBe(
        401,
      );
    });
  });

  describe('profiles', () => {
    it('returns a public profile without email', async () => {
      const res = await agents.alice.get(`/api/v1/users/${ids.bob}`);
      expect(res.status).toBe(200);
      expect(res.body.user.username).toBe('bob');
      expect(res.body.user).not.toHaveProperty('email');
    });

    it('returns 404 for unknown users and rejects bad ids', async () => {
      const missing = await agents.alice.get('/api/v1/users/00000000-0000-4000-8000-000000000000');
      expect(missing.status).toBe(404);
      const badId = await agents.alice.get('/api/v1/users/not-a-uuid');
      expect(badId.status).toBe(400);
    });

    it('updates own displayName and username', async () => {
      const patch = await agents.carol
        .patch('/api/v1/users/me')
        .set(ajax)
        .send({ displayName: 'Carol C.' });
      expect(patch.status).toBe(200);
      expect(patch.body.user.displayName).toBe('Carol C.');

      const rename = await agents.carol.patch('/api/v1/users/me').set(ajax).send({
        username: 'carol2',
      });
      expect(rename.status).toBe(200);
      expect(rename.body.user.username).toBe('carol2');

      // Login works with the new username.
      const login = await request(app).post('/api/v1/auth/login').set(ajax).send({
        identifier: 'carol2',
        password: 's3cure-passphrase',
      });
      expect(login.status).toBe(200);
    });

    it('rejects empty updates and duplicate usernames', async () => {
      expect((await agents.alice.patch('/api/v1/users/me').set(ajax).send({})).status).toBe(400);
      const dup = await agents.alice
        .patch('/api/v1/users/me')
        .set(ajax)
        .send({ username: 'bob' });
      expect(dup.status).toBe(409);
    });
  });

  describe('contacts', () => {
    it('adds, lists, and removes contacts idempotently', async () => {
      const add = await agents.alice.post('/api/v1/contacts').set(ajax).send({
        contactUserId: ids.bob,
      });
      expect(add.status).toBe(201);
      expect(add.body.contact.username).toBe('bob');

      const reAdd = await agents.alice.post('/api/v1/contacts').set(ajax).send({
        contactUserId: ids.bob,
      });
      expect(reAdd.status).toBe(200);

      const listed = await agents.alice.get('/api/v1/contacts');
      expect(listed.status).toBe(200);
      expect(listed.body.total).toBe(1);
      expect(listed.body.items[0].username).toBe('bob');

      expect(
        (await agents.alice.delete(`/api/v1/contacts/${ids.bob}`).set(ajax)).status,
      ).toBe(204);
      expect((await agents.alice.get('/api/v1/contacts')).body.total).toBe(0);
      // Removing again is a no-op.
      expect(
        (await agents.alice.delete(`/api/v1/contacts/${ids.bob}`).set(ajax)).status,
      ).toBe(204);
    });

    it('rejects self-contacts, unknown users, and bad ids', async () => {
      const self = await agents.alice.post('/api/v1/contacts').set(ajax).send({
        contactUserId: ids.alice,
      });
      expect(self.status).toBe(400);
      const missing = await agents.alice.post('/api/v1/contacts').set(ajax).send({
        contactUserId: '00000000-0000-4000-8000-000000000000',
      });
      expect(missing.status).toBe(404);
      const badId = await agents.alice.post('/api/v1/contacts').set(ajax).send({
        contactUserId: 'nope',
      });
      expect(badId.status).toBe(400);
    });

    it('serializes concurrent duplicate contact adds without 500s', async () => {
      const results = await Promise.all(
        [0, 1, 2, 3].map(() =>
          agents.carol.post('/api/v1/contacts').set(ajax).send({ contactUserId: ids.bob }),
        ),
      );
      const statuses = results.map((r) => r.status);
      expect(statuses.some((s) => s >= 500)).toBe(false);
      expect(statuses.every((s) => s === 200 || s === 201)).toBe(true);
      expect((await agents.carol.get('/api/v1/contacts')).body.total).toBe(1);
    });
  });

  describe('blocks', () => {
    it('blocks and unblocks idempotently, rejects self/unknown', async () => {
      const blocked = await agents.bob.post('/api/v1/blocks').set(ajax).send({
        blockedUserId: ids.carol,
      });
      expect(blocked.status).toBe(201);

      const reBlock = await agents.bob.post('/api/v1/blocks').set(ajax).send({
        blockedUserId: ids.carol,
      });
      expect(reBlock.status).toBe(200);

      const listed = await agents.bob.get('/api/v1/blocks');
      expect(listed.body.total).toBe(1);
      expect(listed.body.items[0].username).toBe('carol2');

      expect(
        (await agents.bob.delete(`/api/v1/blocks/${ids.carol}`).set(ajax)).status,
      ).toBe(204);
      expect((await agents.bob.get('/api/v1/blocks')).body.total).toBe(0);

      const self = await agents.bob.post('/api/v1/blocks').set(ajax).send({
        blockedUserId: ids.bob,
      });
      expect(self.status).toBe(400);
      const missing = await agents.bob.post('/api/v1/blocks').set(ajax).send({
        blockedUserId: '00000000-0000-4000-8000-000000000000',
      });
      expect(missing.status).toBe(404);
    });

    it('blocking severs contacts in both directions', async () => {
      // Mutual bookmarks first.
      await agents.alice.post('/api/v1/contacts').set(ajax).send({ contactUserId: ids.bob });
      await agents.bob.post('/api/v1/contacts').set(ajax).send({ contactUserId: ids.alice });
      expect((await agents.alice.get('/api/v1/contacts')).body.total).toBe(1);
      expect((await agents.bob.get('/api/v1/contacts')).body.total).toBe(1);

      await agents.alice.post('/api/v1/blocks').set(ajax).send({ blockedUserId: ids.bob });

      expect((await agents.alice.get('/api/v1/contacts')).body.total).toBe(0);
      expect((await agents.bob.get('/api/v1/contacts')).body.total).toBe(0);

      await agents.alice.delete(`/api/v1/blocks/${ids.bob}`).set(ajax);
    });

    it('enforces blocks on contacts, profiles, and search (both directions)', async () => {
      await agents.alice.post('/api/v1/blocks').set(ajax).send({ blockedUserId: ids.bob });

      // Blocked side cannot add the blocker as a contact…
      const addByBlocked = await agents.bob.post('/api/v1/contacts').set(ajax).send({
        contactUserId: ids.alice,
      });
      expect(addByBlocked.status).toBe(403);
      expect(addByBlocked.body.error.code).toBe('BLOCKED');

      // …nor can the blocker add the blocked user.
      const addByBlocker = await agents.alice.post('/api/v1/contacts').set(ajax).send({
        contactUserId: ids.bob,
      });
      expect(addByBlocker.status).toBe(403);

      // Profiles become invisible both ways (404, not 403 — no oracle).
      expect((await agents.alice.get(`/api/v1/users/${ids.bob}`)).status).toBe(404);
      expect((await agents.bob.get(`/api/v1/users/${ids.alice}`)).status).toBe(404);

      // Blocked users vanish from search.
      const search = await agents.bob.get('/api/v1/users/search').query({ q: 'alice' });
      expect(
        search.body.items.map((u: { username: string }) => u.username),
      ).not.toContain('alice');

      await agents.alice.delete(`/api/v1/blocks/${ids.bob}`).set(ajax);
      // Visibility restored after unblocking.
      expect((await agents.bob.get(`/api/v1/users/${ids.alice}`)).status).toBe(200);
    });

    it('hides disabled accounts from search and contacts', async () => {
      await User.update({ status: 'DISABLED' }, { where: { id: ids.carol } });
      const search = await agents.alice.get('/api/v1/users/search').query({ q: 'carol' });
      expect(
        search.body.items.map((u: { username: string }) => u.username),
      ).not.toContain('carol2');
      const add = await agents.alice.post('/api/v1/contacts').set(ajax).send({
        contactUserId: ids.carol,
      });
      expect(add.status).toBe(404);
    });
  });
});
