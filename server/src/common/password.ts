import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;
const MAX_PASSWORD_LENGTH = 128;

export async function hashPassword(password: string): Promise<string> {
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new Error('Password too long');
  }
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!password || !hash) return false;
  if (password.length > MAX_PASSWORD_LENGTH) return false;
  return bcrypt.compare(password, hash);
}
