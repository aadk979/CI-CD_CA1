import { describe, expect, it } from 'vitest';
import {
  formToObject,
  loginSchema,
  PASSWORD_MAX,
  PASSWORD_MIN,
  registerSchema,
  toFieldErrors,
} from '@/lib/auth-validation';

const valid = { name: 'Ada Fan', email: 'ada@example.com', password: 'a'.repeat(PASSWORD_MIN) };

describe('registerSchema', () => {
  it('trims the name and normalises the email to lower case', () => {
    expect(
      registerSchema.parse({ ...valid, name: '  Ada  ', email: '  ADA@Example.com ' }),
    ).toMatchObject({ name: 'Ada', email: 'ada@example.com' });
  });

  // Boundary value analysis on the 8–72 character rule.
  it.each([
    [PASSWORD_MIN - 1, false],
    [PASSWORD_MIN, true],
    [PASSWORD_MAX, true],
    [PASSWORD_MAX + 1, false],
  ])('password of length %i valid=%s', (length, ok) => {
    const result = registerSchema.safeParse({ ...valid, password: 'x'.repeat(length) });
    expect(result.success).toBe(ok);
  });

  it('does not trim passwords (spaces are significant)', () => {
    expect(registerSchema.parse({ ...valid, password: ' pass word ' }).password).toBe(
      ' pass word ',
    );
  });

  it.each(['', 'plain', 'a@', '@b.com', 'a b@c.com'])('rejects email %j', (email) => {
    expect(registerSchema.safeParse({ ...valid, email }).success).toBe(false);
  });

  it.each([
    ['', false],
    ['   ', false],
    ['x'.repeat(100), true],
    ['x'.repeat(101), false],
  ])('name %j valid=%s', (name, ok) => {
    expect(registerSchema.safeParse({ ...valid, name }).success).toBe(ok);
  });
});

describe('loginSchema', () => {
  it('only requires a password to be present (no length hints for attackers)', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true);
    expect(loginSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false);
  });
});

describe('toFieldErrors', () => {
  it('keeps the first message per field', () => {
    const result = registerSchema.safeParse({ name: '', email: 'bad', password: '' });
    expect(result.success).toBe(false);
    expect(toFieldErrors(result.error!)).toEqual({
      name: 'Enter your name',
      email: 'Enter a valid email address',
      password: `Password must be at least ${PASSWORD_MIN} characters`,
    });
  });
});

describe('formToObject', () => {
  it('returns strings for the requested fields only, blanking missing or file values', () => {
    const form = new FormData();
    form.set('email', 'a@b.co');
    form.set('avatar', new Blob(['x']));
    form.set('extra', 'ignored');

    expect(formToObject(form, ['email', 'avatar', 'password'])).toEqual({
      email: 'a@b.co',
      avatar: '',
      password: '',
    });
  });
});
