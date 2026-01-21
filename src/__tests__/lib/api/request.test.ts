import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

// Mock supabase before importing request
vi.mock('../../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
  },
}));

import { request, requestWithSchema } from '../../../lib/api/request';
import { supabase } from '../../../lib/supabase';

describe('request', () => {
  const mockFetch = vi.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = mockFetch;
    mockFetch.mockReset();
    vi.mocked(supabase.auth.getSession).mockReset();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('authentication', () => {
    it('includes Authorization header when session exists', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
        error: null,
      } as any);

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: 'test' }),
      });

      await request('/test');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      );
    });

    it('omits Authorization header when no session', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: null },
        error: null,
      } as any);

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: 'test' }),
      });

      await request('/test');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callArgs = mockFetch.mock.calls[0]!;
      const headers = (callArgs[1] as any).headers as Record<string, string>;
      expect(headers.Authorization).toBeUndefined();
    });
  });

  describe('request handling', () => {
    beforeEach(() => {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: { access_token: 'token' } },
        error: null,
      } as any);
    });

    it('prepends /api to endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      await request('/categories');

      expect(mockFetch).toHaveBeenCalledWith('/api/categories', expect.any(Object));
    });

    it('sets Content-Type to application/json', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      await request('/test');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callArgs = mockFetch.mock.calls[0]!;
      expect(callArgs[0]).toBe('/api/test');
      const headers = (callArgs[1] as any).headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('accepts custom headers in options', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      await request('/test', {
        headers: { 'X-Custom': 'value' },
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callArgs = mockFetch.mock.calls[0]!;
      // Custom headers are passed through options
      const headers = (callArgs[1] as any).headers as Record<string, string>;
      expect(headers['X-Custom']).toBe('value');
    });

    it('passes through other options', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      await request('/test', {
        method: 'POST',
        body: JSON.stringify({ foo: 'bar' }),
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ foo: 'bar' }),
        })
      );
    });
  });

  describe('response handling', () => {
    beforeEach(() => {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: { access_token: 'token' } },
        error: null,
      } as any);
    });

    it('returns parsed JSON on success', async () => {
      const responseData = { id: '123', name: 'Test' };
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(responseData),
      });

      const result = await request('/test');

      expect(result).toEqual(responseData);
    });

    it('returns undefined for 204 No Content', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 204,
      });

      const result = await request('/test');

      expect(result).toBeUndefined();
    });

    it('throws error on non-ok response with error message', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Validation failed' }),
      });

      await expect(request('/test')).rejects.toThrow('Validation failed');
    });

    it('uses message field for detailed errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Insufficient stock', message: 'Need 5 Ribbon, have 3' }),
      });

      await expect(request('/test')).rejects.toThrow('Need 5 Ribbon, have 3');
    });

    it('falls back to error field when no message', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Server error' }),
      });

      await expect(request('/test')).rejects.toThrow('Server error');
    });

    it('throws generic error when response is not JSON', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('Invalid JSON')),
      });

      await expect(request('/test')).rejects.toThrow('Request failed');
    });
  });

  describe('type safety', () => {
    beforeEach(() => {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: { access_token: 'token' } },
        error: null,
      } as any);
    });

    it('returns typed response', async () => {
      interface TestResponse {
        id: string;
        name: string;
      }

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: '1', name: 'Test' }),
      });

      const result = await request<TestResponse>('/test');

      // TypeScript should infer these properties
      expect(result.id).toBe('1');
      expect(result.name).toBe('Test');
    });
  });

  describe('schema validation', () => {
    beforeEach(() => {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: { access_token: 'token' } },
        error: null,
      } as any);
    });

    it('returns typed data when schema matches', async () => {
      const schema = z.object({ id: z.string(), name: z.string() });
      const responseData = { id: '1', name: 'Test' };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(responseData),
      });

      const result = await requestWithSchema('/test', schema);
      expect(result).toEqual(responseData);
    });

    it('throws when response does not match schema', async () => {
      const schema = z.object({ id: z.string() });

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ unexpected: true }),
      });

      await expect(requestWithSchema('/test', schema)).rejects.toThrow('Unexpected server response');
    });
  });
});
