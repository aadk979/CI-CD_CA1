import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@/lib/account';

// The real modules need a Next.js request; here only the decision logic is under test.
vi.mock('server-only', () => ({}));
const getCurrentUser = vi.fn<() => Promise<SessionUser | null>>();
vi.mock('@/server/session', () => ({ getCurrentUser }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
  forbidden: () => {
    throw new Error('forbidden');
  },
}));

const { requireOrganiser } = await import('@/server/organiser');

const user = (role: SessionUser['role']): SessionUser => ({
  id: 'u1',
  name: 'Olive',
  email: 'olive@example.com',
  role,
});

describe('requireOrganiser (the check every organiser page and action runs)', () => {
  beforeEach(() => getCurrentUser.mockReset());

  it('sends visitors to log in', async () => {
    getCurrentUser.mockResolvedValue(null);
    await expect(requireOrganiser()).rejects.toThrow('redirect:/login');
  });

  it('answers fans with 403 Forbidden', async () => {
    getCurrentUser.mockResolvedValue(user('FAN'));
    await expect(requireOrganiser()).rejects.toThrow('forbidden');
  });

  it('lets organisers through and returns who they are', async () => {
    getCurrentUser.mockResolvedValue(user('ORGANISER'));
    await expect(requireOrganiser()).resolves.toEqual(user('ORGANISER'));
  });
});
