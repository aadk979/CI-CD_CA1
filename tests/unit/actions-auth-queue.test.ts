import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/cache', () => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
const account = { registerAccount: vi.fn(), logIn: vi.fn(), logOut: vi.fn() };
vi.mock('@/lib/account', () => account);
vi.mock('@/lib/auth', () => ({ getAuth: () => ({}) }));
const findUnique = vi.fn();
vi.mock('@/lib/db', () => ({ getPrisma: () => ({ event: { findUnique } }) }));
vi.mock('@/lib/redis', () => ({ getRedis: () => ({}) }));
const joinQueue = vi.fn();
vi.mock('@/lib/waiting-room', () => ({ joinQueue }));
const broadcastQueue = vi.fn();
vi.mock('@/server/broadcast', () => ({ broadcastQueue, getEmitter: () => ({}) }));
const getCurrentUser = vi.fn();
vi.mock('@/server/session', () => ({ getCurrentUser }));
const isOnSale = vi.fn();
vi.mock('@/lib/events', () => ({ isOnSale }));

const { registerAction, loginAction, logoutAction } = await import('@/app/actions/auth');
const { joinQueueAction } = await import('@/app/actions/queue');

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

beforeEach(() => vi.resetAllMocks());

describe('auth actions', () => {
  it('register redirects fans home and organisers to the back office', async () => {
    account.registerAccount.mockResolvedValueOnce({ ok: true, organiser: false });
    await expect(registerAction({} as never, form({ email: 'a@b.c' }))).rejects.toThrow(
      'redirect:/',
    );
    account.registerAccount.mockResolvedValueOnce({ ok: true, organiser: true });
    await expect(registerAction({} as never, form({}))).rejects.toThrow('redirect:/organiser');
  });

  it('register returns validation errors without redirecting', async () => {
    const failure = { ok: false, message: 'bad' };
    account.registerAccount.mockResolvedValue(failure);
    await expect(registerAction({} as never, form({}))).resolves.toBe(failure);
  });

  it('login redirects on success and returns the failure otherwise', async () => {
    account.logIn.mockResolvedValueOnce({ ok: true });
    await expect(loginAction({} as never, form({}))).rejects.toThrow('redirect:/');
    const failure = { ok: false };
    account.logIn.mockResolvedValueOnce(failure);
    await expect(loginAction({} as never, form({}))).resolves.toBe(failure);
  });

  it('logout signs out then redirects home', async () => {
    await expect(logoutAction()).rejects.toThrow('redirect:/');
    expect(account.logOut).toHaveBeenCalled();
  });
});

describe('joinQueueAction', () => {
  const event = { id: 'e1', waitingRoom: true, status: 'ON_SALE', startsAt: new Date() };

  it('rejects a malformed slug', async () => {
    await expect(joinQueueAction(form({ slug: 'Bad Slug!' }))).rejects.toThrow('redirect:/');
  });
  it('sends visitors to log in', async () => {
    getCurrentUser.mockResolvedValue(null);
    await expect(joinQueueAction(form({ slug: 'gig' }))).rejects.toThrow('redirect:/login');
  });
  it('redirects home for an unknown event', async () => {
    getCurrentUser.mockResolvedValue({ id: 'u1' });
    findUnique.mockResolvedValue(null);
    await expect(joinQueueAction(form({ slug: 'gig' }))).rejects.toThrow('redirect:/');
  });
  it('sends fans back to the event page when there is no queue to join', async () => {
    getCurrentUser.mockResolvedValue({ id: 'u1' });
    findUnique.mockResolvedValue({ ...event, waitingRoom: false });
    isOnSale.mockReturnValue(true);
    await expect(joinQueueAction(form({ slug: 'gig' }))).rejects.toThrow('redirect:/events/gig');
    findUnique.mockResolvedValue(event);
    isOnSale.mockReturnValue(false);
    await expect(joinQueueAction(form({ slug: 'gig' }))).rejects.toThrow('redirect:/events/gig');
  });
  it('admitted fans go straight to the event', async () => {
    getCurrentUser.mockResolvedValue({ id: 'u1' });
    findUnique.mockResolvedValue(event);
    isOnSale.mockReturnValue(true);
    joinQueue.mockResolvedValue({ state: 'admitted' });
    await expect(joinQueueAction(form({ slug: 'gig' }))).rejects.toThrow('redirect:/events/gig');
  });
  it('waiting fans trigger a broadcast, and a broadcast failure is swallowed', async () => {
    getCurrentUser.mockResolvedValue({ id: 'u1' });
    findUnique.mockResolvedValue(event);
    isOnSale.mockReturnValue(true);
    joinQueue.mockResolvedValue({ state: 'waiting', position: 3 });
    await expect(joinQueueAction(form({ slug: 'gig' }))).resolves.toBeUndefined();
    expect(broadcastQueue).toHaveBeenCalled();
    broadcastQueue.mockImplementation(() => {
      throw new Error('down');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(joinQueueAction(form({ slug: 'gig' }))).resolves.toBeUndefined();
  });
});
