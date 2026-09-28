import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from './api';

describe('api.getMe auth token retention', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('keeps auth_token on server error (500 or 502)', async () => {
    localStorage.setItem('auth_token', 'mock-valid-token');
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal Server Error' }),
    });

    const user = await api.getMe();
    expect(user).toBeNull();
    // Token must NOT be purged on 500
    expect(localStorage.getItem('auth_token')).toBe('mock-valid-token');
  });

  it('removes auth_token on 401 Unauthorized', async () => {
    localStorage.setItem('auth_token', 'mock-expired-token');
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    });

    const user = await api.getMe();
    expect(user).toBeNull();
    // Token must be purged on true 401
    expect(localStorage.getItem('auth_token')).toBeNull();
  });
});
