# ANA Meet — Backend API & Socket Contracts (V1 foundation)

All error responses share one shape:

```json
{ "error": { "code": "STRING", "message": "STRING", "details": "optional" } }
```

Stack traces, SQL errors, and secrets are never exposed. Timeouts/codes below
are the current defaults; see `server/.env.example`.

## Operational notes (hardening review)

- **Rate limiters fail open**: Redis-backed limits (`auth`, `api`,
  `upload`, socket hot paths) use `passOnStoreError`/try-catch so a Redis
  outage degrades protection instead of 500ing the API.
- **Duplicate races resolve contractually**: concurrent
  register/provision/block/contact/add-member/direct-create attempts never
  500 — losers get the idempotent (`200`) or conflict (`409`) contract.
  Direct-pair creation additionally serializes on a transaction-scoped
  Postgres advisory lock.
- **Read receipts, typing, and presence respect DM blocks**; presence
  answers `offline` across blocks (no oracle).
- **Indexes verified against live query patterns**; redundant unique
  indexes removed, `varchar_pattern_ops` added for prefix search.
- **Baseline** (`npm run load:smoke`, 20 users × 10 concurrency, local
  Docker): 201/201 ok; register p50 ~3 s is bcrypt-12 under concurrency
  (CPU-bound by design — tune rounds or scale out, don't "fix" in code).

## Auth cookies

| Cookie       | Path           | Flags (prod)                    |
| ------------ | -------------- | ------------------------------- |
| `am_access`  | `/`            | HttpOnly, Secure, SameSite=Lax  |
| `am_refresh` | `/api/v1/auth` | HttpOnly, Secure, SameSite=Lax  |

Cookie-authenticated mutations (`POST/PUT/PATCH/DELETE /api/...`) require
either a trusted `Origin`/`Referer` or an `X-Requested-With` header (CSRF
defense for browser clients). `Authorization: Bearer <access>` is accepted
as a non-browser alternative for `GET /api/v1/auth/me`.

## REST

### `POST /api/v1/auth/register` — rate-limited (auth limiter)

Body: `{ username (3-30, a-z0-9._-), email, password (8-128), displayName (1-80) }`

- `201 { user }` — sets both auth cookies.
- `400 BAD_REQUEST` — Zod validation details.
- `409 CONFLICT` — generic "already taken" (does not reveal which field).

### `POST /api/v1/auth/login` — rate-limited (auth limiter)

Body: `{ identifier (username or email), password }`

- `200 { user }` — sets both auth cookies.
- `401 UNAUTHORIZED` — identical message for unknown account / wrong
  password / disabled account (no account enumeration).

### `POST /api/v1/auth/refresh` — rate-limited (auth limiter)

Reads `am_refresh` cookie. Rotates the session on every use.

- `200 { user }` — sets fresh cookies.
- `401 UNAUTHORIZED` — invalid/expired token.
- `401 TOKEN_REUSED` — stale token replayed twice: all user sessions are
  revoked (theft response). A single immediate retry is tolerated (network
  duplicate) and re-anchored on the replacement session.

### `POST /api/v1/auth/logout`

Revokes the current refresh session (idempotent), clears cookies. `204`.

### `POST /api/v1/auth/logout-all` — auth required

Revokes every session of the user, clears cookies. `204`.

### `GET /api/v1/auth/me` — auth required

`200 { user }`. Safe shape only:
`{ id, username, email, displayName, publicId, role, status, createdAt }`.

### `GET /health` / `GET /ready`

- `/health` → `200 { status: "ok", service, uptimeSeconds }` (liveness).
- `/ready` → `200 { status: "ready", checks: { database, redis } }` or
  `503 { status: "not-ready", ... }` (readiness for load balancers).
  Never exposes connection strings or secrets.

## Users

Search results and public profiles are cards only —
`{ id, username, displayName, publicId }`. Email is never exposed outside
`/auth/me` and `PATCH /users/me`. Users blocked in either direction are
invisible to each other (search omits them, profiles return `404`).

### `GET /api/v1/users/search?q=&limit=` — auth required

Matches username prefix, display-name substring, or exact public id
(with or without `#`). `limit` default 20, max 50.
`200 { items: [...] }`; `400` on empty/oversized input.

### `GET /api/v1/users/:userId` — auth required

`200 { user }` public card. `404` for unknown, disabled, or
(blocked-either-way) users; `400` for non-UUID ids.

### `PATCH /api/v1/users/me` — auth required

Body: `{ username?, displayName? }` (at least one). Username is normalized
to lowercase and must be unique (`409` if taken). Returns the full safe
user including email.

## Contacts

Private bookmarks; no notification, no conversation membership implied.
Adding is idempotent (`201` created, `200` already a contact).

### `POST /api/v1/contacts` — auth required

Body: `{ contactUserId: uuid }`. `400` self / invalid id, `404` unknown
or disabled user, `403 BLOCKED` across a block in either direction.

### `GET /api/v1/contacts?limit=&offset=` — auth required

`200 { items, total, limit, offset }` (limit max 100). Only active
accounts are listed.

### `DELETE /api/v1/contacts/:contactUserId` — auth required

Idempotent `204`.

## Friend Requests

Message-first flow: direct conversations work without friendship. Requests are
a separate social signal with explicit accept/reject. `REJECTED`/`CANCELLED`
are re-requestable (row flips back to `PENDING`); blocks are separate and
withdraw pending rows without accepting them. Accept mirrors mutual contacts
so friends appear in the stories feed.

Request: `{ id, status PENDING|ACCEPTED|REJECTED|CANCELLED, requester, addressee,
createdAt, updatedAt }`.

### `POST /api/v1/friend-requests` — auth required

Body: `{ addresseeId: uuid }`. `400` self, `404` unknown/disabled,
`403 BLOCKED` either direction. Idempotent per unordered pair (`201` created,
`200` already pending/accepted).

### `GET /api/v1/friend-requests?direction=&status=&limit=&offset=` — auth required

`direction` inbound|outbound|all (default all), optional `status` filter.
`200 { items, total, limit, offset }` newest first.

### `POST /api/v1/friend-requests/:id/accept` — recipient only

`200 { request }`. `404` for outsiders, `400` when no longer pending,
`403 BLOCKED` if blocked since.

### `POST /api/v1/friend-requests/:id/reject` — recipient only

`PENDING → REJECTED`. Re-requestable later. `200 { request }`.

### `POST /api/v1/friend-requests/:id/cancel` — sender only

`PENDING → CANCELLED`. `200 { request }`.

### `DELETE /api/v1/friend-requests/:id` — either party

Removes the row (unfriend also removes mirrored contacts). Idempotent `204`
for participants, `404` otherwise.

Realtime: `friend-request:new {request}` and `friend-request:updated {request}`
to both parties, `friend-request:removed {id}` on delete, plus durable
`notification:new` for new/accepted/declined.

## Blocks

Directional (`blocker → blocked`) but enforced as a two-way barrier by
`assertNotBlocked` / `isBlockedEitherWay`, shared by search, profiles,
contacts, and (later) conversations/messages. Blocking severs contact
bookmarks in **both** directions atomically.

### `POST /api/v1/blocks` — auth required

Body: `{ blockedUserId: uuid }`. Idempotent (`201`/`200`). `400` self,
`404` unknown/disabled user.

### `GET /api/v1/blocks?limit=&offset=` — auth required

`200 { items, total, limit, offset }` newest first.

### `DELETE /api/v1/blocks/:blockedUserId` — auth required

Idempotent `204`.

## Conversations

Types: `DIRECT` (exactly 2 members, no hierarchy) and `GROUP`
(`OWNER`/`ADMIN`/`MEMBER`, exactly one `OWNER`). Every read and write
requires membership — outsiders get `404` (IDOR-safe, no existence
oracle). Member add/remove/leave/rename/transfer apply to groups only.

Summaries: `{ id, type, title, peer (direct only, null when gone),
memberCount, myRole, muted, unreadCount, createdAt, updatedAt }`.
Details add `participants: [{ userId, role, user (card or null),
joinedAt }]` plus `muted`. `unreadCount` counts the viewer's unread MESSAGE
notifications in that conversation (muted chats count too — mute only stops
the push, never the record).

### `POST /api/v1/conversations/direct` — auth required

Body: `{ peerId: uuid }`. Idempotent per pair (`201` created, `200`
existing). `400` self, `404` unknown/disabled peer, `403 BLOCKED`.

### `POST /api/v1/conversations/group` — auth required

Body: `{ title (1-100), memberIds (1-199 uuids) }`. Creator becomes
`OWNER`; creation is atomic. Only creator↔member blocks are checked
(WhatsApp semantics: blocks between other members don't prevent shared
membership). Max 200 members total.

### `GET /api/v1/conversations?limit=&offset=` — auth required

Own conversations, newest first. `200 { items, total, limit, offset }`.

### `GET /api/v1/conversations/:id` — auth required

`200 { conversation }` detail for members, `404` otherwise.

### `POST /api/v1/conversations/:id/members` — OWNER/ADMIN

Body: `{ userIds }`. Idempotent (existing members skipped, returns only
`added`). Block-checked against the adder, size-capped.

### `DELETE /api/v1/conversations/:id/members/:userId` — OWNER/ADMIN

OWNER removes anyone except self (use leave); ADMIN removes MEMBERs
only; the OWNER row itself can't be removed (transfer first). `204`.

### `POST /api/v1/conversations/:id/leave` — member

Removes self. Owner-leave transfers ownership to the oldest ADMIN else
oldest MEMBER; last-member leave deletes the conversation (`{ deleted }`).

### `POST /api/v1/conversations/:id/hide` — member

Closes the chat for this member only (`200 { hidden: true }`, idempotent).
Membership, history, and other members are untouched — this is how DMs
(which cannot be left) are removed from the sidebar, including after a
block/unfriend/contact removal. A new message, starting the DM again, or
`unhide` reopens it. Outsiders get `404`.

### `POST /api/v1/conversations/:id/unhide` — member

Reopens a closed chat (`200 { hidden: false }`, idempotent).

### `POST /api/v1/conversations/:id/mute` — member

Mutes the chat for this member only (`200 { muted: true }`, idempotent).
No `notification:new` push for their incoming messages, but durable rows
and `unreadCount` keep working — the chat stays counted, just silent.
Message delivery (`message:new`) is unaffected.

### `POST /api/v1/conversations/:id/unmute` — member

Unmutes (`200 { muted: false }`, idempotent).

### `PATCH /api/v1/conversations/:id` — OWNER/ADMIN

Body: `{ title }`. Groups only.

### `POST /api/v1/conversations/:id/transfer` — OWNER

Body: `{ userId }`. Swaps roles (target → OWNER, self → ADMIN).

## Messages

Message: `{ id, conversationId, senderId, sender (card or null),
type TEXT|IMAGE|VIDEO|FILE, content, media { url, mimeType, sizeBytes,
fileName }|null, replyToMessageId, replyTo { id, sender, snippet,
deleted }|null, clientMessageId, status SENT|DELIVERED|READ, editedAt,
createdAt, updatedAt }`.

- **Send is idempotent**: `clientMessageId` (UUID, required) dedupes
  retries per conversation (`201` created, `200` replay). Concurrent
  double-sends are resolved via the unique constraint (loser reads the
  winner, never 500s).
- **Replies** must target an existing message **in the same conversation**.
- **Edit**: sender-only, TEXT-only, sets `editedAt` (last-write-wins).
- **Delete**: sender or platform `ADMIN` (group roles don't qualify);
  hard delete, replies are orphaned (`replyTo` → null), never cascaded.
- **Status** advances monotonically (`SENT → DELIVERED → READ`);
  repeats are no-ops, backwards moves are `400`. Receipts across a DM
  block are refused (`403 BLOCKED`), mirroring sends.
- **DMs across a block are refused** (`403 BLOCKED`); group messages
  follow WhatsApp semantics (member-pair blocks don't stop them).
- History is **cursor-based, newest-first**: `nextCursor` is opaque;
  malformed cursors are `400`. Sender cards resolve null for deleted
  accounts (history is preserved).
- Media payloads are shape-validated (https URL, mime allowlist, V1
  size caps); byte-level upload enforcement arrives with uploads
  (Phase 11), whose references these URLs will carry.

### `POST /api/v1/conversations/:id/messages` — member

TEXT: `{ type: "TEXT", content (1-4000), clientMessageId, replyToMessageId? }`.
Media: `{ type, mediaUrl (https), mimeType, sizeBytes, fileName?,
clientMessageId, replyToMessageId? }`.

### `GET /api/v1/conversations/:id/messages?limit=&cursor=` — member

`200 { items, nextCursor, limit }` (limit max 100). `404` for outsiders.

### `PATCH /api/v1/conversations/:id/messages/:messageId` — sender, TEXT

Body: `{ content }`. `200 { message }`.

### `DELETE /api/v1/conversations/:id/messages/:messageId` — sender/ADMIN

`204`.

### `POST /api/v1/conversations/:id/messages/:messageId/status` — member

Body: `{ status: "DELIVERED" | "READ" }`. `200 { message }`.

### `POST /api/v1/conversations/:id/messages/read` — member

Batch read: same outcome as marking every foreign unread message `READ`
individually (status advance + own notifications cleared), in one request.
Clients call this once per chat open instead of one POST per message.
`200 { updated }` (`0` when nothing is unread). `404` for outsiders.

## Stories

Story: `{ id, owner (card), type TEXT|IMAGE|VIDEO, content,
media { url, mimeType, sizeBytes }|null, expiresAt, createdAt }`.

- **Expiry is server-fixed at 24h** — clients cannot mint immortal
  stories. Expired stories are never returned (`expiresAt > now` on every
  read) and hard-deleted by an hourly idempotent sweeper (plus a boot
  sweep; correctness never depends on the sweeper).
- **Feed** = self + contacts, newest-first, minus blocks. Per-user views
  are permissive-minus-blocks (explicit product decision; granular story
  privacy is future work).
- **Delete is owner-only** (`404` otherwise — no oracle).
- Media rules mirror messages (https URL, mime allowlist, V1 size caps).

### `POST /api/v1/stories` — auth required

TEXT: `{ type: "TEXT", content (1-500) }`. Media:
`{ type: "IMAGE"|"VIDEO", mediaUrl, mimeType, sizeBytes, content? (optional caption, max 500) }`.
Text + attachment is a single story — clients must send one POST, never one
for the text and one for the media. `201 { story }`.

### `GET /api/v1/stories/feed?limit=&offset=` — auth required

`200 { items, limit, offset }` newest-first.

### `GET /api/v1/stories/:userId` — auth required

`200 { items }` active stories; `404` for unknown/disabled/blocked owners.

### `DELETE /api/v1/stories/:storyId` — owner

`204` (idempotent `404` afterwards).

## Notifications

Notification: `{ id, type MESSAGE|SYSTEM, title, body, actor (card or
null), conversationId, messageId, readAt (null = unread), createdAt }`.

- **Durable-always**: every message fans out to all members except the
  sender (DB rows + `notification:new` to each recipient's `user:{id}`
  room). No presence-gating — offline members recover the same rows via
  REST after reconnect. Creation is best-effort after commit: it can log
  but never fail a send.
- **Viewing clears the stack**: marking a message `READ` (opening the chat)
  also marks that recipient's notifications for the message as read;
  accepting/rejecting/cancelling/removing a friend request clears the
  related friend-request notifications; opening the Updates page calls
  `read-all`. Badges are derived from `unread-count`, never local state.
- **Read state is per-recipient and server-controlled**: foreign ids in
  `/read` are silently ignored (no oracle); dismiss is owner-only.
- List is cursor-based, newest-first, with an `unread` filter;
  `unread-count` is index-backed.

### `GET /api/v1/notifications?limit=&cursor=&unread=` — auth required

`200 { items, nextCursor, limit }`.

### `GET /api/v1/notifications/unread-count` — auth required

`200 { count }`.

### `POST /api/v1/notifications/read` — auth required

Body: `{ ids (1-100 uuids) }`. `200 { updated }`.

### `POST /api/v1/notifications/read-all` — auth required

`200 { updated }`.

### `DELETE /api/v1/notifications/:id` — recipient

`204` (`404` for foreign/missing ids).

## Uploads & Media

Upload-then-reference flow: `POST` a file → receive `{ media }` →
paste `{ type, mediaUrl, mimeType, sizeBytes, fileName? }` into a message
or story payload. Media URLs are absolute (built from the request host).

- **Trust nothing from the client**: transport cap (105 MB) → server-side
  magic-byte sniffing (JPEG/PNG/GIF/WebP, MP4/WebM, PDF/ZIP/DOC/TXT;
  dependency-free, ESM-safe) → per-kind caps (IMAGE 10 MB, VIDEO 100 MB,
  FILE 50 MB) → random date-sharded server keys. Client MIME/extension
  only survive as sanitized `fileName` metadata.
- **Storage seam** (`src/storage`): business logic uses `StorageBackend`
  (save/delete/read); local FS today, object storage later with no caller
  changes. `UPLOAD_DIR` env (absolute in production).
- **Serving is authenticated and scoped** with `nosniff` + `sandbox`
  headers; FILE kinds download as attachments. The owner, platform admins,
  and members of a conversation containing the asset can read it. A local
  upload can only be attached by its owner. Keys are unguessable (128-bit).
- **Lifecycle**: owner or ADMIN deletes (`204`); rows are the source of
  truth, file removal is best-effort. Deleting an asset referenced by a
  message breaks that render (no reference counting in V1).
- Strict per-user budget (60/hour default) plus the global API limiter.
  Production serves media over HTTPS; plain-HTTP URLs are accepted in
  development/test only so local uploads keep working.

### `POST /api/v1/uploads` — auth required

Multipart field `file` (single). `201 { media: { key, url, urlPath,
mimeType, type, sizeBytes, fileName } }`. `400` on missing/empty/
unsupported/oversize bodies.

### `GET /api/v1/uploads` — auth required

Own assets, newest-first. `200 { items, total, limit, offset }`.

### `GET /api/v1/uploads/<key>` — auth required

Streams bytes. `404` for unknown/malformed keys (traversal-proof).

### `DELETE /api/v1/uploads/<key>` — owner/ADMIN

`204` (`404` afterwards).

## Bots & Admin

Bots are an **account type** (`role: BOT`), not a parallel identity
system: they register nothing themselves, log in with passwords, and
converse/notify through the exact same paths as users. Cards carry
`isBot` (the `ADMIN` role itself is never exposed in cards).

- `POST /api/v1/admin/bots` — **ADMIN**. Body
  `{ username, email, displayName }`. Provisions an ACTIVE bot and returns
  `{ bot, initialPassword }`; the password is returned **once**, never
  stored in recoverable form — the operator must vault it.
- `GET /api/v1/bots?limit=&offset=` — auth required. Active-bot
  directory, `200 { items, total, limit, offset }`.
- `POST /api/v1/admin/announcements` — **ADMIN**. Body
  `{ title (1-160), body (1-280), userIds (1-100) }`. Atomically creates
  persistent `SYSTEM` notifications (+ real-time `notification:new`) for
  explicit, all-active recipients; unknown/disabled recipients abort the
  whole send (`404`, nothing delivered). Every call writes an audit entry.
- `GET /api/v1/admin/audit-log?limit=&offset=` — **ADMIN**.
  Append-only `{ id, admin (card or null), action, targetType, targetId,
  metadata, createdAt }`, newest-first. Survives admin deletion.

## Admin User Management

All **ADMIN**-only. Admin views expose emails (admin privilege). Every
action except reads writes an audit entry (`user.disable/restore/delete`).

- `GET /api/v1/admin/users?search=&status=&role=&limit=&offset=` —
  newest-first with total. Search covers username/email/display name.
- `GET /api/v1/admin/users/:id` — `{ user, stats: { conversations,
  messagesSent, contacts, stories, activeSessions } }`. `404` unknown.
- `POST /api/v1/admin/users/:id/disable` — sets `DISABLED`, revokes all
  sessions (immediate logout), drops live sockets. Login/tokens/sockets
  all stop working. Self-disable is `400`.
- `POST /api/v1/admin/users/:id/restore` — back to `ACTIVE`. Sessions
  stay revoked: the user must log in again.
- `DELETE /api/v1/admin/users/:id` — **immediate permanent deletion, no
  grace period**. One transaction: audit → bidirectional contacts/blocks
  → user row (memberships/sessions/stories/recipient-notifications
  CASCADE; message senders, notification actors, conversation creators,
  audit authors SET NULL so peer history survives). Afterwards JWTs fail
  the account lookup and live sockets are disconnected. Self-delete is
  `400`. `204`.
- `GET /api/v1/admin/stats` — `{ users { total, active, disabled, bots,
  admins }, conversations { total, direct, group }, messages { total },
  stories { active }, notifications { total, unread } }`.

## Socket.IO

Handshake: `auth: { token: <access JWT> }` or the `am_access` cookie.
Identity always comes from the verified JWT; client-provided user ids are
never trusted. Max payload `1MB` (`maxHttpBufferSize`).

| Direction | Event          | Payload / Ack                                              |
| --------- | -------------- | ---------------------------------------------------------- |
| Client →  | `ping`         | any (small); ack `{ event: "pong", at }`                   |
| Client →  | `presence:get` | `{ userId: uuid }`; ack `{ userId, online }` or `{ error }`|
| Server →  | `user:online`  | `{ userId }` (first socket of the user came online)        |
| Server →  | `user:offline` | `{ userId }` (last socket of the user went offline)        |

Presence is ephemeral (Redis set of socket ids, multi-device safe) and the
personal room `user:{id}` receives that user's events on every node via the
Redis adapter. Messaging events (`message:send`, `typing:*`, ...) arrive
with the messaging phase and will follow:
validate → authorize → persist PostgreSQL → emit.

All client→server events ack `{ ok: true, ... }` or
`{ error: { code, message } }` using the REST codes (`BAD_REQUEST`,
`NOT_FOUND`, `FORBIDDEN`, `BLOCKED`, `RATE_LIMITED`, ...). Hot paths are
per-user Redis-limited (send/edit 60/min, status 120/min, typing 60/min;
fail-open when Redis is down).

| Direction | Event              | Payload / Ack                                                    |
| --------- | ------------------ | ---------------------------------------------------------------- |
| Client →  | `message:send`     | `{ conversationId, message: <REST send body> }`; ack `{ ok, message, created }` (`created: false` = deduped retry) |
| Server →  | `message:new`      | `{ message }` to every member's `user:{id}` room (incl. sender's other devices) |
| Client →  | `message:edit`     | `{ conversationId, messageId, content }`; ack `{ ok, message }`  |
| Server →  | `message:updated`  | `{ message }` to all members                                     |
| Client →  | `message:delete`   | `{ conversationId, messageId }`; ack `{ ok }`                    |
| Server →  | `message:deleted`  | `{ conversationId, messageId }` to all members                   |
| Client →  | `message:delivered`| `{ conversationId, messageId }`; ack `{ ok, message }`          |
| Client →  | `message:read`     | `{ conversationId, messageId }`; ack `{ ok, message }`          |
| Server →  | `message:status`   | `{ conversationId, messageId, status }` to all members           |
| Client →  | `typing:start/stop`| `{ conversationId }`; server emits `typing:update { conversationId, userId, typing }` to other members only (DM typing across a block is `BLOCKED`) |
| Client →  | `presence:heartbeat` | `{}`; ack `{ ok }` — refreshes the sliding presence TTL (clients should heartbeat ~30s; without it a socket older than 60s looks offline) |
| Client →  | `presence:get` | `{ userId }`; ack `{ userId, online }` — answers `false` across blocks (indistinguishable from offline) |
| Server →  | `friend-request:new` | `{ request }` to requester + addressee rooms |
| Server →  | `friend-request:updated` | `{ request }` to both parties (accept/reject/cancel/re-request) |
| Server →  | `friend-request:removed` | `{ id }` to both parties (unfriend/delete) |
| Server →  | `story:new` | `{ story }` to owner + contacts/followers minus blocks |
| Server →  | `story:deleted` | `{ storyId, ownerId }` to the same audience |
| Server →  | `conversation:new` | `{ conversationId, type }` to all members — clients refetch list/detail (source of truth stays REST) |
| Server →  | `conversation:updated` | `{ conversationId }` to current members (rename/transfer/add/remove/leave) |
| Server →  | `conversation:removed` | `{ conversationId }` to the removed/leaver — client redirects + refetches list |
| Server →  | `conversation:hidden` | `{ conversationId }` to the hiding member's rooms (all devices) — client drops it from the list |
| Server →  | `conversation:deleted` | `{ conversationId }` to the last leaver |
| Server →  | `contact:updated` | `{}` to owner — refetch contacts |
| Server →  | `block:updated` | `{ blockedUserId }` to blocker only (no oracle for the blocked side) |

Persistence always happens in PostgreSQL before the ack/broadcast;
offline members recover via REST history after reconnect. Conversation payloads
are id hints on purpose: `peer`/`myRole` are viewer-specific, so clients
refetch the authorized detail instead of trusting a broadcast copy.
