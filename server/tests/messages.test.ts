import { randomUUID } from 'crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { config } from '../src/config/env';
import { getSequelize, closeDatabase } from '../src/db/sequelize';
import { User } from '../src/db/models';
import { resetRateLimits } from './helpers';

// Phase 5: send/idempotency, replies, edit, delete, status, cursor history.
const shouldRun = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!shouldRun)('messages', () => {
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

  async function send(agent: Agent, convoId: string, body: object): Promise<request.Response> {
    return agent.post(`/api/v1/conversations/${convoId}/messages`).set(ajax).send(body);
  }

  const text = (content: string, extra: object = {}) => ({
    type: 'TEXT',
    content,
    clientMessageId: randomUUID(),
    ...extra,
  });

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

    const direct = await agents.alice.post('/api/v1/conversations/direct').set(ajax).send({
      peerId: ids.bob,
    });
    directId = direct.body.conversation.id as string;
    const group = await agents.alice.post('/api/v1/conversations/group').set(ajax).send({
      title: 'Msgs',
      memberIds: [ids.bob, ids.carol],
    });
    groupId = group.body.conversation.id as string;
  });

  afterAll(async () => {
    await closeDatabase();
  });

  describe('send', () => {
    it('sends a text message as SENT', async () => {
      const before = await agents.alice.get(`/api/v1/conversations/${directId}`);
      await new Promise((resolve) => setTimeout(resolve, 20));
      const res = await send(agents.alice, directId, text('Hello Bob'));
      expect(res.status).toBe(201);
      expect(res.body.message.status).toBe('SENT');
      expect(res.body.message.sender.username).toBe('alice');
      expect(res.body.message.editedAt).toBeNull();
      const after = await agents.alice.get(`/api/v1/conversations/${directId}`);
      expect(Date.parse(after.body.conversation.updatedAt)).toBeGreaterThan(
        Date.parse(before.body.conversation.updatedAt),
      );
    });

    it('deduplicates retried sends by clientMessageId', async () => {
      const clientMessageId = randomUUID();
      const first = await send(agents.alice, directId, text('Retry me', { clientMessageId }));
      expect(first.status).toBe(201);
      const second = await send(agents.alice, directId, text('Retry me', { clientMessageId }));
      expect(second.status).toBe(200);
      expect(second.body.message.id).toBe(first.body.message.id);

      const history = await agents.alice.get(`/api/v1/conversations/${directId}/messages`);
      const matches = history.body.items.filter(
        (m: { clientMessageId: string }) => m.clientMessageId === clientMessageId,
      );
      expect(matches).toHaveLength(1);
    });

    it('validates payloads strictly', async () => {
      expect((await send(agents.alice, directId, text(''))).status).toBe(400);
      expect((await send(agents.alice, directId, text('x'.repeat(4001)))).status).toBe(400);
      expect(
        (await send(agents.alice, directId, { type: 'VOICE', clientMessageId: randomUUID() })).status,
      ).toBe(400);
      expect(
        (await send(agents.alice, directId, { type: 'TEXT', content: 'no-id' })).status,
      ).toBe(400);
    });

    it('rejects outsiders and blocked DMs', async () => {
      expect((await send(agents.dave, directId, text('hi'))).status).toBe(404);
      await agents.alice.post('/api/v1/blocks').set(ajax).send({ blockedUserId: ids.bob });
      const blocked = await send(agents.bob, directId, text('blocked?'));
      expect(blocked.status).toBe(403);
      await agents.alice.delete(`/api/v1/blocks/${ids.bob}`).set(ajax);
    });

    it('accepts and validates media messages', async () => {
      const image = await send(agents.alice, groupId, {
        type: 'IMAGE',
        mediaUrl: 'https://cdn.example.com/a.png',
        mimeType: 'image/png',
        sizeBytes: 1024,
        clientMessageId: randomUUID(),
      });
      expect(image.status).toBe(201);
      expect(image.body.message.media.mimeType).toBe('image/png');

      const badMime = await send(agents.alice, groupId, {
        type: 'IMAGE',
        mediaUrl: 'https://cdn.example.com/a.mp4',
        mimeType: 'video/mp4',
        sizeBytes: 1024,
        clientMessageId: randomUUID(),
      });
      expect(badMime.status).toBe(400);
      const oversize = await send(agents.alice, groupId, {
        type: 'IMAGE',
        mediaUrl: 'https://cdn.example.com/big.png',
        mimeType: 'image/png',
        sizeBytes: 500_000_000,
        clientMessageId: randomUUID(),
      });
      expect(oversize.status).toBe(400);
      const insecure = await send(agents.alice, groupId, {
        type: 'FILE',
        mediaUrl: 'not-a-url',
        mimeType: 'application/pdf',
        sizeBytes: 100,
        clientMessageId: randomUUID(),
      });
      expect(insecure.status).toBe(400);
    });
  });

  describe('replies', () => {
    it('attaches a reply preview for same-conversation targets', async () => {
      const parent = await send(agents.alice, groupId, text('Parent message'));
      const reply = await send(
        agents.bob,
        groupId,
        text('Child message', { replyToMessageId: parent.body.message.id }),
      );
      expect(reply.status).toBe(201);
      expect(reply.body.message.replyTo.id).toBe(parent.body.message.id);
      expect(reply.body.message.replyTo.sender.username).toBe('alice');
      expect(reply.body.message.replyTo.snippet).toContain('Parent');
    });

    it('rejects missing and cross-conversation reply targets', async () => {
      const dmMsg = await send(agents.alice, directId, text('DM parent'));
      const cross = await send(
        agents.alice,
        groupId,
        text('Cross reply', { replyToMessageId: dmMsg.body.message.id }),
      );
      expect(cross.status).toBe(400);
      const missing = await send(
        agents.alice,
        groupId,
        text('Ghost reply', { replyToMessageId: randomUUID() }),
      );
      expect(missing.status).toBe(404);
    });
  });

  describe('edit', () => {
    it('lets the sender edit text with an edited marker', async () => {
      const created = await send(agents.alice, directId, text('Typo here'));
      const id = created.body.message.id as string;
      const edited = await agents.alice
        .patch(`/api/v1/conversations/${directId}/messages/${id}`)
        .set(ajax)
        .send({ content: 'Fixed' });
      expect(edited.status).toBe(200);
      expect(edited.body.message.content).toBe('Fixed');
      expect(edited.body.message.editedAt).not.toBeNull();
    });

    it('forbids non-owners, media edits, and bad content', async () => {
      const created = await send(agents.alice, directId, text('Mine'));
      const id = created.body.message.id as string;
      expect(
        (await agents.bob.patch(`/api/v1/conversations/${directId}/messages/${id}`).set(ajax).send({
          content: 'Hijack',
        })).status,
      ).toBe(403);
      expect(
        (await agents.alice.patch(`/api/v1/conversations/${directId}/messages/${id}`).set(ajax).send({
          content: '',
        })).status,
      ).toBe(400);

      const media = await send(agents.alice, groupId, {
        type: 'FILE',
        mediaUrl: 'https://cdn.example.com/a.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 10,
        fileName: 'a.pdf',
        clientMessageId: randomUUID(),
      });
      expect(
        (await agents.alice
          .patch(`/api/v1/conversations/${groupId}/messages/${media.body.message.id}`)
          .set(ajax)
          .send({ content: 'Caption?' })).status,
      ).toBe(400);
    });
  });

  describe('delete', () => {
    it('lets the sender delete, forbids others, allows platform admins', async () => {
      const created = await send(agents.alice, directId, text('Delete me'));
      const id = created.body.message.id as string;
      expect(
        (await agents.bob.delete(`/api/v1/conversations/${directId}/messages/${id}`).set(ajax)).status,
      ).toBe(403);
      expect(
        (await agents.alice.delete(`/api/v1/conversations/${directId}/messages/${id}`).set(ajax))
          .status,
      ).toBe(204);

      const other = await send(agents.alice, directId, text('Admin deletes this'));
      await User.update({ role: 'ADMIN' }, { where: { id: ids.bob } });
      expect(
        (await agents.bob.delete(
          `/api/v1/conversations/${directId}/messages/${other.body.message.id}`,
        ).set(ajax)).status,
      ).toBe(204);
      await User.update({ role: 'USER' }, { where: { id: ids.bob } });
    });

    it('orphans replies without cascading', async () => {
      const parent = await send(agents.alice, groupId, text('Doomed parent'));
      const parentId = parent.body.message.id as string;
      const reply = await send(agents.bob, groupId, text('Orphan', { replyToMessageId: parentId }));
      const replyId = reply.body.message.id as string;
      await agents.alice.delete(`/api/v1/conversations/${groupId}/messages/${parentId}`).set(ajax);

      const history = await agents.alice.get(`/api/v1/conversations/${groupId}/messages`);
      const orphan = history.body.items.find((m: { id: string }) => m.id === replyId) as {
        replyToMessageId: string | null;
        replyTo: unknown;
      };
      expect(orphan).toBeDefined();
      expect(orphan.replyToMessageId).toBeNull();
      expect(orphan.replyTo).toBeNull();
    });
  });

  describe('status', () => {
    it('refuses receipts across DM blocks', async () => {
      const created = await send(agents.alice, directId, text('No receipt for you'));
      const id = created.body.message.id as string;
      await agents.alice.post('/api/v1/blocks').set(ajax).send({ blockedUserId: ids.bob });
      expect(
        (await agents.bob.post(`/api/v1/conversations/${directId}/messages/${id}/status`).set(ajax).send({
          status: 'READ',
        })).status,
      ).toBe(403);
      await agents.alice.delete(`/api/v1/blocks/${ids.bob}`).set(ajax);
      expect(
        (await agents.bob.post(`/api/v1/conversations/${directId}/messages/${id}/status`).set(ajax).send({
          status: 'READ',
        })).status,
      ).toBe(200);
    });

    it('advances monotonically and idempotently', async () => {
      const created = await send(agents.alice, directId, text('Track me'));
      const id = created.body.message.id as string;
      const url = `/api/v1/conversations/${directId}/messages/${id}/status`;

      const delivered = await agents.bob.post(url).set(ajax).send({ status: 'DELIVERED' });
      expect(delivered.status).toBe(200);
      expect(delivered.body.message.status).toBe('DELIVERED');
      const read = await agents.bob.post(url).set(ajax).send({ status: 'READ' });
      expect(read.body.message.status).toBe('READ');
      // Same-state repeat is a no-op success.
      expect((await agents.bob.post(url).set(ajax).send({ status: 'READ' })).status).toBe(200);
      // Backwards is refused.
      expect((await agents.bob.post(url).set(ajax).send({ status: 'DELIVERED' })).status).toBe(
        400,
      );
      expect((await agents.dave.post(url).set(ajax).send({ status: 'READ' })).status).toBe(404);
    });
  });

  describe('history', () => {
    it('paginates newest-first with opaque cursors', async () => {
      for (let i = 0; i < 5; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await send(agents.carol, groupId, text(`Page msg ${i}`));
      }
      const page1 = await agents.alice
        .get(`/api/v1/conversations/${groupId}/messages`)
        .query({ limit: 2 });
      expect(page1.status).toBe(200);
      expect(page1.body.items).toHaveLength(2);
      expect(page1.body.nextCursor).toBeTruthy();

      const page2 = await agents.alice
        .get(`/api/v1/conversations/${groupId}/messages`)
        .query({ limit: 2, cursor: page1.body.nextCursor });
      expect(page2.body.items).toHaveLength(2);
      // No overlap between pages.
      const ids1 = new Set(page1.body.items.map((m: { id: string }) => m.id));
      for (const m of page2.body.items as { id: string }[]) expect(ids1.has(m.id)).toBe(false);

      // Newest-first ordering across the boundary.
      const t1 = new Date(page1.body.items[1].createdAt).getTime();
      const t2 = new Date(page2.body.items[0].createdAt).getTime();
      expect(t1 >= t2).toBe(true);

      expect(
        (await agents.alice.get(`/api/v1/conversations/${groupId}/messages`).query({
          limit: 2,
          cursor: 'garbage!!',
        })).status,
      ).toBe(400);
      expect((await agents.dave.get(`/api/v1/conversations/${groupId}/messages`)).status).toBe(
        404,
      );
    });
  });
});
