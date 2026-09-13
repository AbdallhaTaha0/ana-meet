# ANA Meet — Project Plan

## 1. Project Overview

**ANA Meet** is a real-time communication platform designed to support human users, bots, and administrators.

The initial product is similar in its core communication flow to applications such as WhatsApp or Messenger:

- Public landing page
- Registration
- Login
- User discovery
- Contacts
- One-to-one conversations
- Group conversations
- Real-time messaging
- Message status
- Typing indicators
- Online/offline presence
- Stories
- Notifications
- Bots
- Administration

The project is being built as a portfolio/practice project, but the implementation must follow production-oriented engineering practices.

The goal is not to create unnecessary enterprise complexity. The goal is to create a **well-structured modular monolith that can realistically evolve to support thousands of users and thousands of concurrent connections after proper infrastructure and load testing**.

---

# 2. Current Implementation Scope

The current implementation phase is **BACKEND ONLY**.

The OpenCode agent will implement:

```text
server/
```

It must NOT implement:

```text
client/
```

The frontend requirements are still documented in this plan because they define the API and real-time contracts that the backend must provide.

The eventual project structure is:

```text
project-root/
├── client/                  # Future frontend
├── server/                  # Backend implemented now
├── docker-compose.yml       # Local infrastructure
├── PLAN.md
├── AGENTS.md
└── RULES.md
```

Do not remove frontend requirements from this document simply because the frontend is not being implemented yet.

---

# 3. Engineering Philosophy

ANA Meet should use:

- Simple architecture where possible
- Strong boundaries between responsibilities
- Explicit contracts
- Secure defaults
- Server-side authorization
- Database integrity
- Automated testing
- Production-oriented error handling
- Horizontal-scaling readiness
- Observable behavior
- Controlled complexity

Avoid:

- Premature microservices
- Kubernetes
- Event-driven infrastructure everywhere
- Excessive abstraction
- Unnecessary dependencies
- Global mutable state
- Business logic inside controllers
- Trusting frontend validation
- Storing persistent state only in memory
- Unbounded database queries
- Stateless refresh tokens that cannot be revoked
- Architecture that only works on one server

---

# 4. Architecture

ANA Meet will initially use a **modular monolith**.

```text
                         ANA Meet
                            │
                      Future Client
                            │
                 ┌──────────┴──────────┐
                 │                     │
              REST API             Socket.IO
                 │                     │
                 └──────────┬──────────┘
                            │
                     Load Balancer
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
       Node #1           Node #2           Node #3
          │                 │                 │
          └─────────────────┼─────────────────┘
                            │
               ┌────────────┴────────────┐
               │                         │
          PostgreSQL                   Redis
       Persistent data       Presence / Pub-Sub /
                            Rate limiting / Cache
```

Internally:

```text
HTTP / Socket.IO
       ↓
Authentication
       ↓
Input Validation
       ↓
Authorization
       ↓
Controller / Handler
       ↓
Service Layer
       ↓
Repository / Data Access
       ↓
PostgreSQL / Redis
```

The application should remain a modular monolith even when multiple Node.js instances are running.

---

# 5. Backend Technology Stack

The backend will use:

- Node.js
- TypeScript
- Express
- PostgreSQL 18
- Sequelize
- Socket.IO
- Redis
- Zod
- JWT
- Docker
- Docker Compose
- Automated testing

Package versions must be selected using currently supported/stable versions and checked for known security vulnerabilities before installation.

Do not blindly copy old dependency versions from tutorials.

---

# 6. Persistent vs Transient State

A critical architectural rule is to distinguish persistent state from transient state.

## PostgreSQL is the source of truth for:

- Users
- Authentication sessions
- Conversations
- Conversation membership
- Messages
- Contacts
- Blocks
- Stories
- Notifications
- Administrative/audit information
- Other durable application data

## Redis is used for:

- Presence
- Online/offline state
- Socket.IO cross-instance communication
- Rate limiting
- Short-lived caching
- Temporary state
- Other ephemeral coordination

Redis must NOT become the only source of truth for important permanent data.

If Redis restarts, ANA Meet must remain logically correct.

---

# 7. Scalability Strategy

ANA Meet must be designed so that adding additional Node.js instances does not require rewriting the application.

## 7.1 Horizontal Scaling

The backend must not depend on process-local state for important functionality.

Bad:

```text
userPresence = {}
activeUsers = {}
```

as the authoritative source.

Good:

```text
Node #1 ─┐
Node #2 ─┼── Redis
Node #3 ─┘
```

The system must work when a user has:

- Multiple browser tabs
- Multiple devices
- Multiple active sockets
- Connections distributed across different Node.js instances

Do not assume:

```text
one user = one socket
```

---

# 8. Socket.IO Scaling

Socket.IO is responsible for real-time communication.

When multiple backend instances are used, the Socket.IO Redis adapter must be used to coordinate events between instances.

Example:

```text
Client A
   │
   ▼
Node #1
   │
   ├── PostgreSQL
   │
   └── Redis
          │
          ▼
       Node #2
          │
          ▼
       Client B
```

A message emitted by Node #1 must be able to reach a recipient connected to Node #2.

Socket events are API contracts and must be documented.

---

# 9. Database Connection Pooling

Sequelize must use a controlled PostgreSQL connection pool.

Do not create a new database connection for every request.

Connection pool configuration must be environment-configurable.

The pool must be sized according to:

- Number of application instances
- PostgreSQL capacity
- Expected concurrency
- Available resources

Do not assume that increasing the pool indefinitely increases performance.

The total connection budget across all application instances must remain controlled.

---

# 10. Database Design

PostgreSQL is the durable source of truth.

Use:

- Foreign keys
- Unique constraints
- Appropriate indexes
- NOT NULL constraints where appropriate
- Timestamps
- Referential integrity
- Transactions where required

Use Sequelize migrations.

Do NOT rely on destructive automatic schema synchronization in normal development or production.

Avoid:

```text
sync({ alter: true })
sync({ force: true })
```

as the database migration strategy.

---

# 11. Core Database Entities

The exact schema may evolve during implementation, but the architecture should support at least:

```text
User
RefreshSession / AuthSession
Conversation
ConversationParticipant
Message
Contact
Block
Story
Notification
AdminAuditLog
```

Additional entities may be introduced only when justified by the requirements.

---

# 12. User Model

Users must support:

```text
internal database ID
username
email
password hash
display name
public user identifier
account type
account status
timestamps
```

Account types:

```text
USER
BOT
ADMIN
```

Account status should support disabling an account without confusing disabled state with permanent deletion.

The internal database ID should not be treated as a public identity if a safer public identifier is appropriate.

Users can be found by:

- Username
- Display name
- Unique public hashtag/user ID

Example:

```text
username: abdallah
displayName: Abdallah Ahmed
publicId: #A7K92X
```

The exact public ID format must be unique and collision-safe.

---

# 13. Authentication

ANA Meet will use:

```text
Short-lived Access JWT
+
Long-lived Refresh JWT
```

Tokens are stored in secure cookies.

Cookies should use appropriate:

- HttpOnly
- Secure in production
- SameSite
- Domain/path configuration

Authentication must be designed together with CORS and CSRF protection.

---

# 14. Refresh Token Sessions

Refresh tokens must not be treated as completely stateless credentials.

A server-side refresh-session record should exist.

The system must support:

- Refresh
- Rotation
- Revocation
- Logout
- Logout from current device
- Logout from all devices
- Detection/reaction to refresh-token reuse
- Session expiration

Never store raw refresh tokens in the database if a secure hash representation can be used instead.

Never log:

- JWTs
- Cookies
- Refresh tokens
- Authentication secrets

---

# 15. Authentication Flow

Conceptually:

```text
Register
   ↓
Validate input
   ↓
Hash password
   ↓
Create user
```

Login:

```text
Username/email + password
        ↓
Validate
        ↓
Find user
        ↓
Verify password
        ↓
Create authentication session
        ↓
Issue access JWT
        ↓
Issue refresh JWT
        ↓
Set secure cookies
```

Authenticated request:

```text
Cookie
  ↓
JWT verification
  ↓
User/session validation
  ↓
Authorization
  ↓
Controller
```

---

# 16. Password Security

Passwords must:

- Never be stored plaintext
- Never be logged
- Be hashed using a modern password hashing algorithm
- Have appropriate password length limits
- Be protected from brute-force attacks

Authentication error responses should avoid unnecessarily revealing whether a specific account exists.

---

# 17. CORS

CORS must use explicit allowed origins.

Do not use:

```text
*
```

with credentialed requests.

The allowed frontend origin must be environment-configurable.

Example concept:

```text
CLIENT_ORIGIN=http://localhost:...
```

Production configuration must use the actual trusted frontend origin.

---

# 18. Conversations

V1 supports:

```text
DIRECT
GROUP
```

Use:

```text
Conversation
ConversationParticipant
```

Do not design the database around exactly two users.

Group functionality must support:

- Membership
- Adding members
- Removing members
- Leaving
- Ownership/admin permissions where applicable
- Authorization
- Message access

Conversation membership must be checked server-side.

---

# 19. Contacts

Contacts are separate from conversation membership.

Users should be able to:

- Search users
- Add contacts
- Remove contacts
- Start conversations

A contact relationship does not automatically mean that the user is a conversation member.

---

# 20. Blocking

Users can:

- Block
- Unblock

Blocking must be enforced on the backend.

It must affect the appropriate:

- REST operations
- Socket operations
- Messaging operations
- Conversation interactions
- User interactions

Do not rely on the frontend to enforce blocking.

---

# 21. Messaging

V1 message types:

```text
TEXT
IMAGE
VIDEO
FILE
```

Future-ready:

```text
VOICE
```

A message should contain concepts such as:

```text
id
conversationId
senderId
type
content / media reference
replyToMessageId
status-related information where appropriate
createdAt
updatedAt
```

Messages must belong to a conversation.

---

# 22. Message Lifecycle

Message delivery follows:

```text
SENT
  ↓
DELIVERED
  ↓
READ
```

The backend must prevent invalid status transitions.

Message status must not be trusted from the client without authorization and validation.

---

# 23. Sending a Message

Conceptually:

```text
Client
  ↓
Socket.IO
  ↓
Authenticate
  ↓
Validate Zod payload
  ↓
Authorize conversation membership
  ↓
Check blocking rules
  ↓
Check message constraints
  ↓
Persist PostgreSQL message
  ↓
Publish/emit real-time event
  ↓
Acknowledge sender
```

PostgreSQL persistence happens before treating the message as durably accepted.

Socket.IO is the communication mechanism, not the permanent source of truth.

---

# 24. Idempotency

Real networks retry operations.

A message request may accidentally be sent more than once.

The backend should support a client-generated request/message identifier for operations where duplicate creation is possible.

Example:

```text
clientMessageId
```

The database/service layer should prevent duplicate processing when the same request is retried.

This is especially important for:

- Message sending
- Important state-changing operations
- Potential future retries

---

# 25. Message Editing

Users can edit messages subject to authorization.

The backend must verify:

- User is authenticated
- User has access to the conversation
- User owns the message
- Message is editable according to business rules
- New content is valid

Never trust the frontend to determine message ownership.

---

# 26. Message Deletion

Message deletion must verify:

- Authentication
- Conversation access
- Message existence
- Ownership
- Applicable administrative permissions

The exact semantics of:

```text
delete for me
delete for everyone
```

should not be invented unless explicitly added to the product requirements.

---

# 27. Message Replies

A reply must reference a valid message.

The backend must verify:

```text
replyToMessageId exists
AND
reply target belongs to the same conversation
```

A user must not be able to reference arbitrary messages from another conversation.

---

# 28. Pagination

High-volume endpoints must never return unlimited data.

Messages should use **cursor-based pagination** rather than large offset-based pagination.

Example:

```text
GET /conversations/:id/messages?cursor=...
```

The implementation should use appropriate indexed ordering.

Typical message index:

```text
(conversationId, createdAt)
```

Other large lists should use pagination as appropriate.

---

# 29. Database Indexing

Indexes must be intentional.

Likely important indexes include:

```text
User.username
User.email
User.publicId

ConversationParticipant.conversationId
ConversationParticipant.userId

Message.conversationId + Message.createdAt

Notification.recipientId + Notification.readAt

Story.ownerId
Story.expiresAt

Contact.userId
Contact.contactUserId

Block.blockerId
Block.blockedUserId
```

Indexes must be validated against actual query patterns.

Do not create indexes blindly on every column.

---

# 30. Presence

Presence supports:

```text
ONLINE
OFFLINE
LAST SEEN
```

Presence is transient state.

Redis/Socket.IO can maintain presence information.

The database should not be updated for every socket heartbeat.

The system must support multiple connections per user.

A user should only be considered offline when their last active connection disappears according to the presence strategy.

---

# 31. Typing Indicators

Typing indicators are transient.

Examples:

```text
typing:start
typing:stop
```

Typing state should not be persisted as normal message records.

The server must authorize the user before broadcasting typing state.

---

# 32. Reconnection

Clients can disconnect.

The backend architecture must allow a reconnecting client to synchronize missed durable state through REST/API queries.

Do not assume that every real-time event will always reach the client.

PostgreSQL remains the source of truth for durable messages and other persistent data.

---

# 33. Stories

V1 supports:

- Text stories
- Image stories
- Video stories
- Creation
- Retrieval
- Expiration
- Ownership
- Deletion

Stories must have an expiration timestamp.

Expired stories must not be returned as active stories.

Future-ready:

- Story viewers
- Reactions
- Replies
- Privacy settings

Do not implement future functionality unless requested.

---

# 34. Notifications

Notifications may be:

- Persistent
- Real-time
- System-generated
- Bot-generated
- Message-related

If a notification must survive disconnect, it must be persisted.

Socket.IO can then deliver it in real time.

Conceptually:

```text
Database Notification
        +
Socket.IO notification:new
```

Unread/read state must be server-controlled.

---

# 35. Bots

ANA Meet supports BOT accounts.

A bot should be represented as an account type rather than requiring a completely separate user system.

Possible architecture:

```text
BOT User
   ↓
Bot Service
   ↓
Conversation / Message / Notification
```

V1 bot functionality should remain simple.

Examples:

- System announcements
- Automated messages
- Basic platform notifications

Do not implement an unnecessarily complex AI-agent system.

---

# 36. Admin

Admin functionality includes:

- View users
- Search users
- Disable users
- Restore users
- Permanently delete users
- View basic platform statistics
- Manage appropriate platform-level operations

Admin authorization must be enforced on the backend.

Frontend visibility is never a security mechanism.

Sensitive administrative actions should generate audit records.

---

# 37. Account Deletion

ANA Meet requires **immediate permanent deletion**.

No grace period or soft-delete-only strategy should be introduced unless requirements change.

Deletion must consider:

```text
User
Authentication sessions
Conversations
Conversation membership
Messages
Contacts
Blocks
Stories
Notifications
Media references
Admin/audit requirements
```

Deletion must preserve database integrity.

Use transactions where appropriate.

Before deletion:

```text
Authenticate
↓
Authorize
↓
Invalidate sessions
↓
Handle sockets
↓
Delete dependent data
↓
Delete user
↓
Commit
```

Existing tokens and sockets must not allow the deleted user to continue operating.

---

# 38. Media

V1 supports:

```text
Images
Videos
Files
```

Media handling must include:

- Authentication
- Authorization
- File-size limits
- Allowed file types
- Metadata validation
- Content validation
- Ownership checks
- Safe storage abstraction

Do not trust the client-provided MIME type alone.

The implementation should use a storage abstraction so that local development storage can later be replaced with object storage.

Do not make PostgreSQL responsible for storing large binary files unless explicitly justified.

---

# 39. Redis

Redis responsibilities include:

```text
Presence
Socket.IO adapter/pub-sub
Rate limiting
Short-lived caching
Transient coordination
```

Do not use Redis as the primary permanent database.

Application correctness should not depend on Redis retaining ephemeral state forever.

---

# 40. Rate Limiting

Rate limiting should protect:

- Registration
- Login
- Refresh
- User search
- Message sending
- Story creation
- Uploads
- Admin actions
- Socket events

Distributed rate limiting should use Redis where appropriate.

Limits should be configurable through environment/configuration rather than hardcoded everywhere.

---

# 41. Input Validation

Zod is mandatory for external input.

Validate:

- REST bodies
- Query parameters
- Route parameters
- Authentication data
- Socket.IO payloads
- File metadata
- Admin operations
- User-controlled content where appropriate

Flow:

```text
External Input
      ↓
Zod
      ↓
Validated DTO
      ↓
Controller / Handler
      ↓
Service
      ↓
Repository
      ↓
Database
```

Frontend validation is helpful for UX but is never a security boundary.

---

# 42. REST API

Potential API modules:

```text
/auth
/users
/profiles
/conversations
/messages
/contacts
/blocks
/stories
/notifications
/admin
/bots
/uploads
/health
```

These are architectural categories, not instructions to blindly create every possible endpoint.

Every endpoint must define:

- Authentication requirement
- Authorization
- Input schema
- Response shape
- Error behavior
- Pagination requirements
- Tests

---

# 43. Socket.IO API

Socket events are public contracts.

Potential events:

```text
message:send
message:new
message:delivered
message:read
message:edit
message:delete
typing:start
typing:stop
user:online
user:offline
notification:new
```

Each event must define:

- Payload schema
- Authentication requirement
- Authorization
- Sender/recipient
- Persistence behavior
- Acknowledgement behavior
- Error behavior

Avoid creating multiple events for the same operation without a clear reason.

---

# 44. Socket Authentication

Socket connections must authenticate securely.

The server must not trust:

- User IDs supplied by the client
- Conversation IDs without membership verification
- Sender IDs
- Admin claims without JWT/session validation

Every sensitive socket operation must perform authorization.

---

# 45. Error Handling

Errors must have consistent API responses.

Do not expose:

- Stack traces
- Database internals
- Secrets
- JWT values
- Password information
- Internal infrastructure details

Development logs may contain more information than production responses, but secrets and sensitive credentials must never be logged.

---

# 46. Security Requirements

Security must include:

- Secure password hashing
- HttpOnly cookies
- Secure cookies in production
- Appropriate SameSite configuration
- Explicit CORS
- CSRF considerations
- JWT expiration
- Refresh rotation
- Refresh revocation
- Session management
- Rate limiting
- Brute-force protection
- Zod validation
- Authorization checks
- Ownership checks
- Block enforcement
- Secure file validation
- Admin authorization
- Secure headers
- Environment-based secrets
- HTTPS/TLS in production
- Safe errors
- No sensitive logs

---

# 47. Authorization Model

Authentication answers:

> Who are you?

Authorization answers:

> Are you allowed to perform this operation?

Every protected resource must perform authorization.

Examples:

```text
Can this user read this conversation?

Can this user send a message here?

Can this user edit this message?

Can this user delete this story?

Can this user modify this group?

Can this user perform this admin operation?
```

Never rely only on frontend restrictions.

---

# 48. Concurrency and Race Conditions

The backend must account for concurrent operations.

Examples:

- Two requests editing the same message
- Two deletion requests
- Multiple refresh requests
- Multiple devices marking a message read
- Concurrent group membership changes
- Duplicate message requests
- Account deletion while another request is active

Use:

- Database constraints
- Transactions
- Appropriate locking/atomic operations
- Idempotency
- Conditional updates
- Correct service-level checks

Do not assume requests execute sequentially.

---

# 49. Transactions

Use transactions when multiple database operations must succeed or fail together.

Examples:

- Account deletion
- Complex conversation/member changes
- Authentication session operations where atomicity is required
- Other multi-step state changes

Do not wrap every simple database query in a transaction without reason.

---

# 50. Graceful Shutdown

The backend must shut down cleanly.

Shutdown should handle:

```text
Stop accepting new requests
↓
Stop accepting new socket work
↓
Close Socket.IO
↓
Close Redis connections
↓
Close Sequelize/PostgreSQL pool
↓
Exit process
```

This is important for:

- Docker
- Deployments
- Horizontal scaling
- Restarts
- Load balancers

---

# 51. Observability

ANA Meet should include practical observability without building an unnecessarily large monitoring platform.

At minimum:

- Structured logging
- Request latency
- HTTP errors
- Socket connection information
- Important authentication failures
- Database connectivity
- Redis connectivity
- Health/readiness status
- Basic application metrics

Never log:

```text
passwords
JWTs
cookies
refresh tokens
secrets
```

---

# 52. Health Checks

A safe health endpoint must exist.

Example:

```text
GET /health
```

Health checks may distinguish between:

```text
Application is running
Dependencies are healthy
Application is ready to receive traffic
```

Do not expose internal secrets or sensitive infrastructure information through health endpoints.

---

# 53. Docker

The root project must contain:

```text
docker-compose.yml
```

The local infrastructure should include:

```text
PostgreSQL 18
Redis
```

The backend may initially run locally outside Docker.

The configuration must support eventual containerization without requiring an architectural rewrite.

---

# 54. Environment Configuration

Use environment variables for:

- Database credentials
- Database URL/configuration
- Redis URL
- JWT secrets/keys
- Cookie settings
- CORS origins
- Port
- Rate limits
- Storage configuration
- Other environment-specific values

Provide:

```text
.env.example
```

Never commit real secrets.

---

# 55. Testing Strategy

Testing is part of implementation, not an optional final step.

Tests should cover:

## Unit

- Services
- Validation
- Utility logic
- Business rules

## Integration

- PostgreSQL
- Redis
- Sequelize models
- Transactions

## API

- Registration
- Login
- Refresh
- Logout
- User search
- Contacts
- Blocking
- Conversations
- Messages
- Stories
- Notifications
- Admin operations

## WebSocket

- Authentication
- Message sending
- Delivery
- Read
- Typing
- Authorization
- Reconnection behavior
- Duplicate message protection

## Security

- Invalid tokens
- Expired tokens
- Refresh token abuse
- IDOR
- Unauthorized admin actions
- Unauthorized message access
- Blocking bypass
- Invalid input
- Upload abuse
- Rate-limit abuse

## Account deletion

Verify:

- Permanent deletion
- Dependent record handling
- Session invalidation
- Existing token rejection
- Socket invalidation
- Database integrity

---

# 56. Load Testing

Thousands of users should not be claimed as a guaranteed capacity without measurement.

There is a major difference between:

```text
10,000 registered users
```

and:

```text
10,000 simultaneously connected users
```

The architecture must prepare for both, but actual capacity must be established through load testing.

Eventually test:

- Concurrent HTTP requests
- Concurrent Socket.IO connections
- Message throughput
- Database performance
- Redis performance
- Connection pool behavior
- Memory usage
- CPU usage
- Latency
- Reconnection storms
- Rate limiting
- Horizontal scaling

---

# 57. Performance Principles

Prefer:

- Cursor pagination
- Proper indexes
- Bounded queries
- Connection pooling
- Redis for appropriate ephemeral/cached data
- Efficient serialization
- Avoiding unnecessary database queries
- Avoiding N+1 query patterns
- Appropriate caching
- Horizontal scaling

Do not optimize blindly.

Measure first when possible.

---

# 58. Caching

Caching may be used for frequently-read, safe-to-cache information.

Every cache must have:

- Clear ownership
- Expiration strategy
- Invalidation strategy
- Fallback behavior

Never cache sensitive authorization decisions indefinitely.

Do not make the architecture dependent on stale cache data for security.

---

# 59. Future Object Storage

Media storage should use an abstraction.

Development may use local storage.

Future production deployment can use an object-storage service.

The business logic should not depend directly on filesystem paths.

---

# 60. Frontend Contract

The future frontend will provide:

```text
Landing Page
Login
Register
Authenticated Chat Application
```

The application flow is:

```text
Public Landing
      ↓
Login / Register
      ↓
Authenticated Application
      ↓
Chats / Contacts / Stories / Notifications / Profile
```

The frontend should eventually consume the REST and Socket.IO contracts provided by the backend.

The backend must not implement frontend components during the current phase.

---

# 61. Development Phases

## Phase 1 — Foundation

- TypeScript
- Express
- Configuration
- Error handling
- Logging
- PostgreSQL
- Sequelize
- Redis
- Docker Compose
- Health endpoint

## Phase 2 — Authentication

- User model
- Registration
- Login
- Access JWT
- Refresh JWT
- Refresh sessions
- Rotation
- Logout
- Session invalidation
- Authentication middleware

## Phase 3 — Users

- Profiles
- Username search
- Display name search
- Public ID search
- Contacts
- Blocking

## Phase 4 — Conversations

- Direct conversations
- Group conversations
- Participants
- Membership authorization

## Phase 5 — Messaging

- Message model
- Text messages
- Replies
- Edit
- Delete
- Pagination
- Delivery
- Read state
- Idempotency

## Phase 6 — Socket.IO

- Authentication
- Message events
- Presence
- Typing
- Notifications
- Redis adapter
- Multi-device behavior

## Phase 7 — Stories

- Creation
- Retrieval
- Expiration
- Deletion

## Phase 8 — Notifications

- Persistent notifications
- Real-time notification events
- Read/unread state

## Phase 9 — Bots

- BOT accounts
- Basic bot/system behavior

## Phase 10 — Admin

- User management
- Disable/restore
- Permanent deletion
- Platform statistics
- Audit logs

## Phase 11 — Media

- Upload handling
- Validation
- Storage abstraction
- Image/video/file support

## Phase 12 — Hardening

- Security review
- Rate limiting
- Load testing preparation
- Performance review
- Database index review
- Concurrency review
- Graceful shutdown
- Observability review

---

# 62. Definition of Done

A feature is not complete simply because its endpoint works.

A feature should normally include:

```text
Database model/migration if needed
+
Validation
+
Authentication
+
Authorization
+
Business logic
+
REST contract if applicable
+
Socket contract if applicable
+
Redis behavior if applicable
+
Error handling
+
Security checks
+
Tests
+
Documentation where appropriate
```

---

# 63. Source-of-Truth Hierarchy

When instructions conflict:

```text
RULES.md
   ↓
PLAN.md
   ↓
AGENTS.md
   ↓
Existing implementation
   ↓
Agent assumptions
```

If an important conflict cannot be resolved safely, do not silently invent a solution.

Ask for clarification.

---

# 64. Final Architecture Goal

The V1 architecture should be:

```text
Simple enough to understand
+
Modular enough to maintain
+
Secure enough for real users
+
Testable
+
Observable
+
Horizontally scalable
+
Ready for thousands of concurrent connections after proper load testing
```

ANA Meet should begin as a strong modular monolith, not an unnecessarily complicated distributed system.