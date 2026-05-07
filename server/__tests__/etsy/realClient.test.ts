import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/prisma', () => ({
  prisma: {
    etsyCredentials: {
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../lib/etsy/debugLogger', () => ({
  logApiRequest: vi.fn(),
  logApiResponse: vi.fn(),
  logApiError: vi.fn(),
  logDebug: vi.fn(),
}));

import { prisma } from '../../lib/prisma';
import { EtsyRequestLimiter } from '../../lib/etsy/rateLimiter';
import { RealEtsyClient } from '../../lib/etsy/realClient';
import type { EtsyCredentialsRecord } from '../../lib/etsy/types';

const mockPrisma = prisma as unknown as {
  etsyCredentials: {
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};

function credentials(overrides: Partial<EtsyCredentialsRecord> = {}): EtsyCredentialsRecord {
  return {
    id: 'creds-1',
    accessToken: 'user.old-token',
    refreshToken: 'refresh-token',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    shopId: 'shop-1',
    shopName: 'Test Shop',
    userId: 'user',
    loginName: 'test_login',
    isDefault: true,
    isAppOwner: true,
    ...overrides,
  };
}

function inventoryResponse(listingId: number) {
  return {
    listing_id: listingId,
    products: [],
    price_on_property: [],
    quantity_on_property: [],
    sku_on_property: [],
  };
}

function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => headers[name] ?? headers[name.toLowerCase()] ?? null,
    },
    json: vi.fn(async () => body),
    text: vi.fn(async () => JSON.stringify(body)),
  } as unknown as Response;
}

describe('RealEtsyClient request safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    process.env.ETSY_API_KEY = 'api-key';
    process.env.ETSY_SHARED_SECRET = 'shared-secret';
    mockPrisma.etsyCredentials.findFirst.mockResolvedValue(credentials());
    mockPrisma.etsyCredentials.update.mockResolvedValue(credentials());
  });

  it('runs all Etsy requests through the shared limiter', async () => {
    let currentTime = 0;
    const starts: number[] = [];
    const limiter = new EtsyRequestLimiter(
      { delayMs: 1000, maxUpdatesPerMinute: 100 },
      {
        now: () => currentTime,
        sleep: vi.fn(async (ms: number) => {
          currentTime += ms;
        }),
      }
    );

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        starts.push(currentTime);
        const listingId = Number(url.match(/listings\/(\d+)\/inventory/)?.[1] ?? 0);
        return jsonResponse(inventoryResponse(listingId));
      })
    );

    const client = new RealEtsyClient({ requestLimiter: limiter });

    await Promise.all([
      client.getListingInventory(111),
      client.getListingInventory(222),
    ]);

    expect(starts).toEqual([0, 1000]);
  });

  it('blocks later requests until an Etsy 429 retry-after window passes', async () => {
    let currentTime = 0;
    const starts: number[] = [];
    const limiter = new EtsyRequestLimiter(
      { delayMs: 0, maxUpdatesPerMinute: 100 },
      {
        now: () => currentTime,
        sleep: vi.fn(async (ms: number) => {
          currentTime += ms;
        }),
      }
    );

    let callCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        starts.push(currentTime);
        callCount++;
        if (callCount === 1) {
          return jsonResponse({ error: 'rate limited' }, 429, { 'Retry-After': '30' });
        }
        const listingId = Number(url.match(/listings\/(\d+)\/inventory/)?.[1] ?? 0);
        return jsonResponse(inventoryResponse(listingId));
      })
    );

    const client = new RealEtsyClient({ requestLimiter: limiter });

    await expect(client.getListingInventory(111)).rejects.toMatchObject({ status: 429 });
    await client.getListingInventory(222);

    expect(starts).toEqual([0, 30000]);
  });

  it('applies 429 retry-after before releasing the next queued request', async () => {
    let currentTime = 0;
    const starts: number[] = [];
    const limiter = new EtsyRequestLimiter(
      { delayMs: 0, maxUpdatesPerMinute: 100 },
      {
        now: () => currentTime,
        sleep: vi.fn(async (ms: number) => {
          currentTime += ms;
        }),
      }
    );

    let callCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        starts.push(currentTime);
        callCount++;
        if (callCount === 1) {
          return jsonResponse({ error: 'rate limited' }, 429, { 'Retry-After': '30' });
        }
        const listingId = Number(url.match(/listings\/(\d+)\/inventory/)?.[1] ?? 0);
        return jsonResponse(inventoryResponse(listingId));
      })
    );

    const client = new RealEtsyClient({ requestLimiter: limiter });

    const first = client.getListingInventory(111).catch((error) => error);
    const second = client.getListingInventory(222);

    await expect(first).resolves.toMatchObject({ status: 429 });
    await second;

    expect(starts).toEqual([0, 30000]);
  });

  it('deduplicates concurrent token refreshes for the same credentials record', async () => {
    const expired = credentials({ expiresAt: new Date(Date.now() - 1000) });
    const refreshed = credentials({
      accessToken: 'user.new-token',
      refreshToken: 'new-refresh-token',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    mockPrisma.etsyCredentials.findFirst.mockResolvedValue(expired);
    mockPrisma.etsyCredentials.update.mockResolvedValue(refreshed);

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/public/oauth/token')) {
        return jsonResponse({
          access_token: refreshed.accessToken,
          refresh_token: refreshed.refreshToken,
          expires_in: 3600,
          token_type: 'Bearer',
        });
      }

      const listingId = Number(url.match(/listings\/(\d+)\/inventory/)?.[1] ?? 0);
      return jsonResponse(inventoryResponse(listingId));
    });
    vi.stubGlobal('fetch', fetchMock);

    const limiter = new EtsyRequestLimiter({ delayMs: 0, maxUpdatesPerMinute: 100 });
    const client = new RealEtsyClient({ requestLimiter: limiter });

    await Promise.all([
      client.getListingInventory(111),
      client.getListingInventory(222),
    ]);

    const refreshCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/public/oauth/token')
    );
    expect(refreshCalls).toHaveLength(1);
  });
});
