import { describe, expect, it } from 'vitest';
import { loginSchema, registerSchema } from '../src/modules/auth/auth.schemas';

describe('auth validation', () => {
  it('accepts a valid registration payload and normalizes case', () => {
    const parsed = registerSchema.parse({
      username: 'Abdallah',
      email: 'User@Example.com',
      password: 's3cure-passphrase',
      displayName: 'Abdallah Ahmed',
    });
    // Normalized server-side: uniqueness checks are case-insensitive by construction.
    expect(parsed.username).toBe('abdallah');
    expect(parsed.email).toBe('user@example.com');
  });

  it('rejects invalid registration payloads', () => {
    expect(() =>
      registerSchema.parse({
        username: 'ab',
        email: 'not-an-email',
        password: 'short',
        displayName: '',
      }),
    ).toThrow();
    expect(() =>
      registerSchema.parse({
        username: 'HAS SPACE',
        email: 'a@b.co',
        password: 'long-enough-password',
        displayName: 'Name',
      }),
    ).toThrow();
  });

  it('rejects empty login payloads', () => {
    expect(() => loginSchema.parse({ identifier: '', password: '' })).toThrow();
  });
});

