import { randomBytes } from 'crypto';
import { Op, Transaction, UniqueConstraintError } from 'sequelize';
import { config } from '../../config/env';
import { Errors, AppError } from '../../common/errors';
import { hashPassword, verifyPassword } from '../../common/password';
import {
  hashRefreshToken,
  newSessionId,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../common/tokens';
import { RefreshSession, User } from '../../db/models';
import { getSequelize } from '../../db/sequelize';
import type { LoginInput, RegisterInput } from './auth.schemas';

export interface SafeUser {
  id: string;
  username: string;
  email: string;
  displayName: string;
  publicId: string;
  role: string;
  isBot: boolean;
  status: string;
  createdAt: Date;
}

export function toSafeUser(user: User): SafeUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    publicId: user.publicId,
    role: user.role,
    isBot: user.role === 'BOT',
    status: user.status,
    createdAt: user.createdAt,
  };
}

export interface SessionMeta {
  userAgent: string | null;
  ip: string | null;
}

export interface TokenPair {
  access: string;
  refresh: string;
}

const PUBLIC_ID_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ROTATION_GRACE_MS = 60 * 1000;

function generatePublicId(): string {
  let suffix = '';
  for (let i = 0; i < 6; i += 1) {
    suffix += PUBLIC_ID_ALPHABET[randomBytes(1)[0] % PUBLIC_ID_ALPHABET.length];
  }
  return `#${suffix}`;
}

export async function generateUniquePublicId(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = generatePublicId();
    // eslint-disable-next-line no-await-in-loop
    const existing = await User.findOne({ where: { publicId: candidate }, attributes: ['id'] });
    if (!existing) return candidate;
  }
  return `#${randomBytes(4).toString('hex').toUpperCase()}`;
}

async function createSession(
  user: User,
  meta: SessionMeta,
): Promise<{ session: RefreshSession; tokens: TokenPair }> {
  const sessionId = newSessionId();
  const access = signAccessToken(user.id, user.role, user.authVersion);
  const refresh = signRefreshToken(user.id, sessionId);
  const session = await RefreshSession.create({
    id: sessionId,
    userId: user.id,
    refreshHash: hashRefreshToken(refresh),
    userAgent: meta.userAgent,
    ip: meta.ip,
    expiresAt: new Date(Date.now() + config.jwt.refreshTtlDays * 24 * 60 * 60 * 1000),
  });
  return { session, tokens: { access, refresh } };
}

export async function registerUser(
  input: RegisterInput,
  meta: SessionMeta,
): Promise<{ user: SafeUser; tokens: TokenPair }> {
  const existing = await User.findOne({
    where: { [Op.or]: [{ username: input.username }, { email: input.email }] },
    attributes: ['username', 'email'],
  });
  if (existing) {
    // Deliberately generic: do not reveal which credential is taken.
    throw Errors.conflict('Username or email is already taken');
  }
  const user = await User.create({
    username: input.username,
    email: input.email,
    passwordHash: await hashPassword(input.password),
    displayName: input.displayName,
    publicId: await generateUniquePublicId(),
  }).catch((err: unknown) => {
    // Lost race with a concurrent registration: same contract as the check.
    if (err instanceof UniqueConstraintError) {
      throw Errors.conflict('Username or email is already taken');
    }
    throw err;
  });
  const { tokens } = await createSession(user, meta);
  return { user: toSafeUser(user), tokens };
}

export async function loginUser(
  input: LoginInput,
  meta: SessionMeta,
): Promise<{ user: SafeUser; tokens: TokenPair }> {
  const user = await User.findOne({
    where: { [Op.or]: [{ username: input.identifier }, { email: input.identifier }] },
  });
  // Same response for unknown account, wrong password, or disabled account:
  // never reveal whether an account exists.
  if (!user) throw Errors.unauthorized('Invalid credentials');
  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok || user.status !== 'ACTIVE') throw Errors.unauthorized('Invalid credentials');
  const { tokens } = await createSession(user, meta);
  return { user: toSafeUser(user), tokens };
}

export async function refreshSession(
  presentedToken: string,
  meta: SessionMeta,
): Promise<{ user: SafeUser; tokens: TokenPair }> {
  let payload;
  try {
    payload = verifyRefreshToken(presentedToken);
  } catch {
    throw Errors.unauthorized('Invalid or expired refresh token');
  }

  const sequelize = getSequelize();
  // NOTE: a `throw` inside the transaction callback rolls everything back,
  // so the theft-response revocation below deliberately happens AFTER the
  // transaction commits — otherwise it would be undone by the rollback.
  const outcome = await sequelize.transaction(async (tx) => {
    // Row lock serializes concurrent refresh attempts on the same session.
    const session = await RefreshSession.findByPk(payload.sid, {
      transaction: tx,
      lock: tx.LOCK.UPDATE,
    });
    if (!session || session.expiresAt.getTime() < Date.now()) {
      throw Errors.unauthorized('Invalid or expired refresh token');
    }
    const user = await User.findByPk(session.userId, { transaction: tx });
    if (!user || user.status !== 'ACTIVE') {
      throw Errors.unauthorized('Invalid or expired refresh token');
    }

    const hashMatches = session.refreshHash === hashRefreshToken(presentedToken);

    // Reuse of an already-rotated token: possible theft → revoke everything.
    // A retry inside the grace window (same token, known replacement) is
    // treated as a benign network retry and re-anchored on the replacement.
    if (session.revokedAt) {
      const withinGrace = Date.now() - session.revokedAt.getTime() < ROTATION_GRACE_MS;
      if (hashMatches && withinGrace && session.replacedBy) {
        const replacement = await RefreshSession.findByPk(session.replacedBy, {
          transaction: tx,
          lock: tx.LOCK.UPDATE,
        });
        if (replacement && !replacement.revokedAt && replacement.expiresAt.getTime() > Date.now()) {
          replacement.revokedAt = new Date();
          const { tokens } = await rotateFrom(replacement, user, meta, tx);
          return { user: toSafeUser(user), tokens };
        }
      }
      return { reuseDetected: true as const, userId: user.id };
    }

    if (!hashMatches) {
      throw Errors.unauthorized('Invalid or expired refresh token');
    }

    session.revokedAt = new Date();
    const { tokens } = await rotateFrom(session, user, meta, tx);
    return { user: toSafeUser(user), tokens };
  });

  if ('reuseDetected' in outcome) {
    await RefreshSession.update(
      { revokedAt: new Date() },
      { where: { userId: outcome.userId, revokedAt: null } },
    );
    throw new AppError(401, 'TOKEN_REUSED', 'Refresh token reuse detected');
  }
  return outcome;
}

async function rotateFrom(
  oldSession: RefreshSession,
  user: User,
  meta: SessionMeta,
  tx: Transaction,
): Promise<{ tokens: TokenPair }> {
  const sessionId = newSessionId();
  const access = signAccessToken(user.id, user.role, user.authVersion);
  const refresh = signRefreshToken(user.id, sessionId);
  const created = await RefreshSession.create(
    {
      id: sessionId,
      userId: user.id,
      refreshHash: hashRefreshToken(refresh),
      userAgent: meta.userAgent,
      ip: meta.ip,
      expiresAt: new Date(Date.now() + config.jwt.refreshTtlDays * 24 * 60 * 60 * 1000),
    },
    { transaction: tx },
  );
  oldSession.replacedBy = created.id;
  await oldSession.save({ transaction: tx });
  return { tokens: { access, refresh } };
}

export async function logoutSession(presentedToken: string): Promise<void> {
  try {
    const payload = verifyRefreshToken(presentedToken);
    await RefreshSession.update(
      { revokedAt: new Date() },
      { where: { id: payload.sid, revokedAt: null } },
    );
  } catch {
    // Logout is idempotent: invalid tokens are simply a no-op.
  }
}

export async function logoutAllSessions(userId: string): Promise<number> {
  return getSequelize().transaction(async (transaction) => {
    const [count] = await RefreshSession.update(
      { revokedAt: new Date() },
      { where: { userId, revokedAt: null }, transaction },
    );
    await User.increment('authVersion', { where: { id: userId }, transaction });
    return count;
  });
}

export async function getCurrentUser(userId: string): Promise<SafeUser> {
  const user = await User.findByPk(userId);
  if (!user || user.status !== 'ACTIVE') throw Errors.unauthorized('Invalid or expired token');
  return toSafeUser(user);
}
