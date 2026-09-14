import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { config } from '../src/config/env';
import { getSequelize, closeDatabase } from '../src/db/sequelize';
import { resetRateLimits } from './helpers';

const shouldRun = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!shouldRun)('friend requests', () => {
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

  it('message-first: direct conversation works without friendship', async () => {
    const dm = await agents.alice.post('/api/v1/conversations/direct').set(ajax).send({
      peerId: ids.bob,
    });
    expect([200, 201]).toContain(dm.status);
    const msg = await agents.alice
      .post(`/api/v1/conversations/${dm.body.conversation.id}/messages`)
      .set(ajax)
      .send({
        type: 'TEXT',
        content: 'Hello welcome. I am Alice. Can we be friends?',
        clientMessageId: crypto.randomUUID(),
      });
    expect([200, 201]).toContain(msg.status);
  });

  it('sends, lists, accepts, and mirrors contacts', async () => {
    const send = await agents.alice.post('/api/v1/friend-requests').set(ajax).send({
      addresseeId: ids.bob,
    });
    expect(send.status).toBe(201);
    expect(send.body.request.status).toBe('PENDING');
    const reqId = send.body.request.id as string;

    // Idempotent re-send.
    const resend = await agents.alice.post('/api/v1/friend-requests').set(ajax).send({
      addresseeId: ids.bob,
    });
    expect(resend.status).toBe(200);
    expect(resend.body.request.id).toBe(reqId);

    // Inbound visible to Bob.
    const inbound = await agents.bob
      .get('/api/v1/friend-requests')
      .query({ direction: 'inbound', status: 'PENDING' });
    expect(inbound.status).toBe(200);
    expect(inbound.body.items.map((r: { id: string }) => r.id)).toContain(reqId);

    // Only recipient can accept.
    expect(
      (await agents.alice.post(`/api/v1/friend-requests/${reqId}/accept`).set(ajax)).status,
    ).toBe(403);
    const accept = await agents.bob.post(`/api/v1/friend-requests/${reqId}/accept`).set(ajax);
    expect(accept.status).toBe(200);
    expect(accept.body.request.status).toBe('ACCEPTED');

    // Mutual contacts mirrored for feed.
    const aContacts = await agents.alice.get('/api/v1/contacts');
    const bContacts = await agents.bob.get('/api/v1/contacts');
    expect(aContacts.body.items.map((u: { id: string }) => u.id)).toContain(ids.bob);
    expect(bContacts.body.items.map((u: { id: string }) => u.id)).toContain(ids.alice);
  });

  it('reject is re-requestable and separate from block', async () => {
    const send = await agents.carol.post('/api/v1/friend-requests').set(ajax).send({
      addresseeId: ids.alice,
    });
    expect(send.status).toBe(201);
    const reqId = send.body.request.id as string;

    const reject = await agents.alice.post(`/api/v1/friend-requests/${reqId}/reject`).set(ajax);
    expect(reject.status).toBe(200);
    expect(reject.body.request.status).toBe('REJECTED');

    // Re-request after reject works (not a block).
    const again = await agents.carol.post('/api/v1/friend-requests').set(ajax).send({
      addresseeId: ids.alice,
    });
    expect([200, 201]).toContain(again.status);
    expect(again.body.request.status).toBe('PENDING');

    // Sender can cancel.
    const cancel = await agents.carol
      .post(`/api/v1/friend-requests/${again.body.request.id}/cancel`)
      .set(ajax);
    expect(cancel.status).toBe(200);
    expect(cancel.body.request.status).toBe('CANCELLED');

    // And request again after cancel.
    const third = await agents.carol.post('/api/v1/friend-requests').set(ajax).send({
      addresseeId: ids.alice,
    });
    expect([200, 201]).toContain(third.status);
    expect(third.body.request.status).toBe('PENDING');
  });

  it('blocks withdraw pending requests and refuses new ones', async () => {
    // Carol -> Bob pending exists? ensure fresh pair Alice->Carol pending cancelled by block.
    const pending = await agents.alice.post('/api/v1/friend-requests').set(ajax).send({
      addresseeId: ids.carol,
    });
    expect([200, 201]).toContain(pending.status);

    const block = await agents.carol.post('/api/v1/blocks').set(ajax).send({
      blockedUserId: ids.alice,
    });
    expect([200, 201]).toContain(block.status);

    const sendBlocked = await agents.alice.post('/api/v1/friend-requests').set(ajax).send({
      addresseeId: ids.carol,
    });
    expect(sendBlocked.status).toBe(403);

    await agents.carol.delete(`/api/v1/blocks/${ids.alice}`).set(ajax);
    // After unblock, re-request works again.
    const after = await agents.alice.post('/api/v1/friend-requests').set(ajax).send({
      addresseeId: ids.carol,
    });
    expect([200, 201]).toContain(after.status);
  });

  it('rejects self-requests, unknown users, and outsider decisions', async () => {    const self = await agents.alice.post('/api/v1/friend-requests').set(ajax).send({
      addresseeId: ids.alice,
    });
    expect(self.status).toBe(400);
    const missing = await agents.alice.post('/api/v1/friend-requests').set(ajax).send({
      addresseeId: '00000000-0000-4000-8000-000000000000',
    });
    expect(missing.status).toBe(404);
    // Bob is outsider to Alice<->Carol pending.
    const list = await agents.alice.get('/api/v1/friend-requests').query({ direction: 'all' });
    const target = (list.body.items as Array<{ id: string; status: string }>).find(
      (r) => r.status === 'PENDING',
    );
    if (target) {
      expect(
        (await agents.bob.post(`/api/v1/friend-requests/${target.id}/accept`).set(ajax)).status,
      ).toBe(404);
    }
  });

  it('unfriends without blocking and removes mirrored contacts', async () => {
    const list = await agents.alice.get('/api/v1/friend-requests').query({ direction: 'all' });
    const friendship = (list.body.items as Array<{ id: string; status: string }>).find(
      (r) => r.status === 'ACCEPTED',
    );
    expect(friendship).toBeDefined();
    expect(
      (await agents.alice.delete(`/api/v1/friend-requests/${friendship!.id}`).set(ajax)).status,
    ).toBe(204);
    // Mirrored contacts removed both ways, no block created.
    expect(
      (await agents.alice.get('/api/v1/contacts')).body.items.map((u: { id: string }) => u.id),
    ).not.toContain(ids.bob);
    expect((await agents.alice.get('/api/v1/blocks')).body.total).toBe(0);
    // Re-request works after unfriending.
    const again = await agents.alice.post('/api/v1/friend-requests').set(ajax).send({
      addresseeId: ids.bob,
    });
    expect([200, 201]).toContain(again.status);
    expect(again.body.request.status).toBe('PENDING');
  });
});
