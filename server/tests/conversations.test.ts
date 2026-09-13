import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { config } from '../src/config/env';
import { getSequelize, closeDatabase } from '../src/db/sequelize';
import { resetRateLimits } from './helpers';

// Phase 4: direct + group conversations, membership authorization,
// member management, leave/transfer semantics.
const shouldRun = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!shouldRun)('conversations', () => {
  const app = createApp();
  const ajax = { 'X-Requested-With': 'XMLHttpRequest' };
  const agents = {
    alice: request.agent(app),
    bob: request.agent(app),
    carol: request.agent(app),
    dave: request.agent(app),
  };
  type Agent = (typeof agents)['alice'];
  const ids: Record<string, string> = {};
  let directId = '';
  let groupId = '';

  async function register(agent: Agent, username: string): Promise<string> {
    const res = await agent.post('/api/v1/auth/register').set(ajax).send({
      username,
      email: `${username}@example.com`,
      password: 's3cure-passphrase',
      displayName: username,
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

    ids.alice = await register(agents.alice, 'alice');
    ids.bob = await register(agents.bob, 'bob');
    ids.carol = await register(agents.carol, 'carol');
    ids.dave = await register(agents.dave, 'dave');
  });

  afterAll(async () => {
    await closeDatabase();
  });

  describe('direct conversations', () => {
    it('creates a direct conversation exactly once per pair', async () => {
      const first = await agents.alice.post('/api/v1/conversations/direct').set(ajax).send({
        peerId: ids.bob,
      });
      expect(first.status).toBe(201);
      expect(first.body.conversation.type).toBe('DIRECT');
      expect(first.body.conversation.memberCount).toBe(2);
      directId = first.body.conversation.id as string;

      // Retry from the other side returns the same conversation.
      const second = await agents.bob.post('/api/v1/conversations/direct').set(ajax).send({
        peerId: ids.alice,
      });
      expect(second.status).toBe(200);
      expect(second.body.conversation.id).toBe(directId);
    });

    it('serializes concurrent pair creates into a single conversation', async () => {
      const results = await Promise.all([
        agents.carol.post('/api/v1/conversations/direct').set(ajax).send({ peerId: ids.dave }),
        agents.dave.post('/api/v1/conversations/direct').set(ajax).send({ peerId: ids.carol }),
        agents.carol.post('/api/v1/conversations/direct').set(ajax).send({ peerId: ids.dave }),
      ]);
      const statuses = results.map((r) => r.status);
      expect(statuses.some((s) => s >= 500)).toBe(false);
      const ids_ = results.map((r) => r.body.conversation.id);
      expect(new Set(ids_).size).toBe(1);
      const listed = await agents.carol.get('/api/v1/conversations');
      expect(
        listed.body.items.filter(
          (c: { type: string; peer: { username: string } }) =>
            c.type === 'DIRECT' && c.peer.username === 'dave',
        ),
      ).toHaveLength(1);
    });

    it('rejects self, unknown, and blocked peers', async () => {      expect(
        (await agents.alice.post('/api/v1/conversations/direct').set(ajax).send({
          peerId: ids.alice,
        })).status,
      ).toBe(400);
      expect(
        (await agents.alice.post('/api/v1/conversations/direct').set(ajax).send({
          peerId: '00000000-0000-4000-8000-000000000000',
        })).status,
      ).toBe(404);

      await agents.alice.post('/api/v1/blocks').set(ajax).send({ blockedUserId: ids.carol });
      const blocked = await agents.alice.post('/api/v1/conversations/direct').set(ajax).send({
        peerId: ids.carol,
      });
      expect(blocked.status).toBe(403);
      expect(blocked.body.error.code).toBe('BLOCKED');
      await agents.alice.delete(`/api/v1/blocks/${ids.carol}`).set(ajax);
    });
  });

  describe('group conversations', () => {
    it('creates a group with the creator as owner', async () => {
      const res = await agents.alice.post('/api/v1/conversations/group').set(ajax).send({
        title: 'Study Group',
        memberIds: [ids.bob, ids.carol],
      });
      expect(res.status).toBe(201);
      const c = res.body.conversation;
      expect(c.type).toBe('GROUP');
      expect(c.title).toBe('Study Group');
      expect(c.myRole).toBe('OWNER');
      expect(c.memberCount).toBe(3);
      groupId = c.id as string;
    });

    it('validates group input atomically', async () => {
      const noTitle = await agents.alice.post('/api/v1/conversations/group').set(ajax).send({
        title: '',
        memberIds: [ids.bob],
      });
      expect(noTitle.status).toBe(400);
      const unknownMember = await agents.alice
        .post('/api/v1/conversations/group')
        .set(ajax)
        .send({ title: 'Bad', memberIds: ['00000000-0000-4000-8000-000000000000'] });
      expect(unknownMember.status).toBe(404);
      // Nothing persisted by the failed attempt (dave's count is unchanged
      // regardless of which other tests ran before).
      const before = (await agents.dave.get('/api/v1/conversations')).body.total as number;
      const retry = await agents.alice
        .post('/api/v1/conversations/group')
        .set(ajax)
        .send({ title: 'Bad', memberIds: ['00000000-0000-4000-8000-000000000000'] });
      expect(retry.status).toBe(404);
      const after = (await agents.dave.get('/api/v1/conversations')).body.total as number;
      expect(after).toBe(before);
    });

    it('refuses groups with blocked members', async () => {
      await agents.alice.post('/api/v1/blocks').set(ajax).send({ blockedUserId: ids.dave });
      const res = await agents.alice.post('/api/v1/conversations/group').set(ajax).send({
        title: 'Blocked',
        memberIds: [ids.dave],
      });
      expect(res.status).toBe(403);
      await agents.alice.delete(`/api/v1/blocks/${ids.dave}`).set(ajax);
    });
  });

  describe('reads', () => {
    it('lists only own conversations with peer info', async () => {
      const aliceList = await agents.alice.get('/api/v1/conversations');
      expect(aliceList.status).toBe(200);
      expect(aliceList.body.total).toBe(2);
      const direct = aliceList.body.items.find(
        (c: { type: string }) => c.type === 'DIRECT',
      ) as { peer: { username: string }; memberCount: number };
      expect(direct.peer.username).toBe('bob');
      expect(direct.memberCount).toBe(2);

      const daveList = await agents.dave.get('/api/v1/conversations');
      expect(daveList.status).toBe(200);
      // Dave's only conversation is the carol DM from the concurrency test —
      // in particular, none of alice's conversations leak to him.
      expect(
        daveList.body.items.every(
          (c: { type: string; peer: { username: string } }) =>
            c.type === 'DIRECT' && c.peer.username === 'carol',
        ),
      ).toBe(true);
    });

    it('returns detail to members and 404 to outsiders (IDOR)', async () => {
      const detail = await agents.bob.get(`/api/v1/conversations/${groupId}`);
      expect(detail.status).toBe(200);
      expect(detail.body.conversation.participants).toHaveLength(3);

      expect((await agents.dave.get(`/api/v1/conversations/${groupId}`)).status).toBe(404);
      expect(
        (await agents.dave.get(`/api/v1/conversations/${directId}`)).status,
      ).toBe(404);
    });
  });

  describe('member management', () => {
    it('lets owners/admins add members idempotently', async () => {
      const add = await agents.alice.post(`/api/v1/conversations/${groupId}/members`).set(ajax).send({
        userIds: [ids.dave],
      });
      expect(add.status).toBe(200);
      expect(add.body.added.map((u: { username: string }) => u.username)).toContain('dave');

      const reAdd = await agents.alice.post(`/api/v1/conversations/${groupId}/members`).set(ajax).send({
        userIds: [ids.dave],
      });
      expect(reAdd.status).toBe(200);
      expect(reAdd.body.added).toHaveLength(0);
    });

    it('forbids member adds by regular members, on direct chats, and across blocks', async () => {
      // Bob is a MEMBER here.
      expect(
        (await agents.bob.post(`/api/v1/conversations/${groupId}/members`).set(ajax).send({
          userIds: [ids.dave],
        })).status,
      ).toBe(403);
      expect(
        (await agents.alice.post(`/api/v1/conversations/${directId}/members`).set(ajax).send({
          userIds: [ids.carol],
        })).status,
      ).toBe(400);

      await agents.alice.post('/api/v1/blocks').set(ajax).send({ blockedUserId: ids.dave });
      // Dave is already a member; remove then re-add across the block.
      await agents.alice.delete(`/api/v1/conversations/${groupId}/members/${ids.dave}`).set(ajax);
      const blockedAdd = await agents.alice
        .post(`/api/v1/conversations/${groupId}/members`)
        .set(ajax)
        .send({ userIds: [ids.dave] });
      expect(blockedAdd.status).toBe(403);
      await agents.alice.delete(`/api/v1/blocks/${ids.dave}`).set(ajax);
      // Restore membership for later tests.
      await agents.alice.post(`/api/v1/conversations/${groupId}/members`).set(ajax).send({
        userIds: [ids.dave],
      });
    });

    it('enforces removal hierarchy', async () => {
      // Promote bob to ADMIN via transfer round-trip? No — direct role edit
      // has no endpoint; test owner-removes-member and member-forbidden paths.
      expect(
        (await agents.bob.delete(`/api/v1/conversations/${groupId}/members/${ids.carol}`).set(ajax))
          .status,
      ).toBe(403);
      // Owner cannot remove themselves this way.
      expect(
        (await agents.alice.delete(`/api/v1/conversations/${groupId}/members/${ids.alice}`).set(ajax))
          .status,
      ).toBe(400);
      // Owner removes dave.
      expect(
        (await agents.alice.delete(`/api/v1/conversations/${groupId}/members/${ids.dave}`).set(ajax))
          .status,
      ).toBe(204);
      expect(
        (await agents.dave.get(`/api/v1/conversations/${groupId}`)).status,
      ).toBe(404);
    });

    it('renames with owner/admin rights only', async () => {
      const ok = await agents.alice.patch(`/api/v1/conversations/${groupId}`).set(ajax).send({
        title: 'Renamed',
      });
      expect(ok.status).toBe(200);
      expect(ok.body.conversation.title).toBe('Renamed');
      expect(
        (await agents.bob.patch(`/api/v1/conversations/${groupId}`).set(ajax).send({
          title: 'Hijacked',
        })).status,
      ).toBe(403);
      expect(
        (await agents.alice.patch(`/api/v1/conversations/${directId}`).set(ajax).send({
          title: 'Nope',
        })).status,
      ).toBe(400);
    });

    it('transfers ownership owner → member with role swap', async () => {
      const res = await agents.alice.post(`/api/v1/conversations/${groupId}/transfer`).set(ajax).send({
        userId: ids.bob,
      });
      expect(res.status).toBe(200);
      const roles = new Map(
        res.body.conversation.participants.map((p: { userId: string; role: string }) => [p.userId, p.role]),
      );
      expect(roles.get(ids.bob)).toBe('OWNER');
      expect(roles.get(ids.alice)).toBe('ADMIN');
      // Old owner can no longer transfer.
      expect(
        (await agents.alice.post(`/api/v1/conversations/${groupId}/transfer`).set(ajax).send({
          userId: ids.carol,
        })).status,
      ).toBe(403);
    });

    it('handles owner leave with succession and last-leave deletion', async () => {
      // Bob (OWNER) leaves: alice (ADMIN, oldest) inherits ownership.
      const bobLeave = await agents.bob.post(`/api/v1/conversations/${groupId}/leave`).set(ajax);
      expect(bobLeave.status).toBe(200);
      expect(bobLeave.body.deleted).toBe(false);
      const detail = await agents.alice.get(`/api/v1/conversations/${groupId}`);
      const roles = new Map(
        detail.body.conversation.participants.map((p: { userId: string; role: string }) => [
          p.userId,
          p.role,
        ]),
      );
      expect(roles.get(ids.alice)).toBe('OWNER');

      // Carol leaves; alice (sole owner + last member after carol) …
      await agents.carol.post(`/api/v1/conversations/${groupId}/leave`).set(ajax);
      const lastLeave = await agents.alice.post(`/api/v1/conversations/${groupId}/leave`).set(ajax);
      expect(lastLeave.body.deleted).toBe(true);
      expect((await agents.alice.get(`/api/v1/conversations/${groupId}`)).status).toBe(404);
    });

    it('rejects leave on direct conversations', async () => {
      expect((await agents.alice.post(`/api/v1/conversations/${directId}/leave`).set(ajax)).status).toBe(
        400,
      );
    });
  });
});
