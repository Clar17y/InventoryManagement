import { describe, expect, it, vi } from 'vitest';
import { EtsyRequestLimiter } from '../../lib/etsy/rateLimiter';

describe('EtsyRequestLimiter', () => {
  it('serializes concurrent requests and applies delay between starts', async () => {
    let currentTime = 0;
    const sleeps: number[] = [];
    const limiter = new EtsyRequestLimiter(
      { delayMs: 1000, maxUpdatesPerMinute: 100 },
      {
        now: () => currentTime,
        sleep: vi.fn(async (ms: number) => {
          sleeps.push(ms);
          currentTime += ms;
        }),
      }
    );

    const starts: number[] = [];

    await Promise.all([
      limiter.run(async () => {
        starts.push(currentTime);
      }),
      limiter.run(async () => {
        starts.push(currentTime);
      }),
      limiter.run(async () => {
        starts.push(currentTime);
      }),
    ]);

    expect(starts).toEqual([0, 1000, 2000]);
    expect(sleeps).toEqual([1000, 1000]);
  });

  it('blocks the next request until a retry-after cooldown expires', async () => {
    let currentTime = 0;
    const sleeps: number[] = [];
    const limiter = new EtsyRequestLimiter(
      { delayMs: 0, maxUpdatesPerMinute: 100 },
      {
        now: () => currentTime,
        sleep: vi.fn(async (ms: number) => {
          sleeps.push(ms);
          currentTime += ms;
        }),
      }
    );

    const starts: number[] = [];

    await limiter.run(async () => {
      starts.push(currentTime);
    });
    limiter.applyRetryAfter(30);
    await limiter.run(async () => {
      starts.push(currentTime);
    });

    expect(starts).toEqual([0, 30000]);
    expect(sleeps).toEqual([30000]);
  });

  it('treats ETSY_THROTTLE_DELAY_MS=0 as no request delay', async () => {
    const originalDelay = process.env.ETSY_THROTTLE_DELAY_MS;
    process.env.ETSY_THROTTLE_DELAY_MS = '0';

    try {
      let currentTime = 0;
      const limiter = new EtsyRequestLimiter(
        undefined,
        {
          now: () => currentTime,
          sleep: vi.fn(async (ms: number) => {
            currentTime += ms;
          }),
        }
      );

      const starts: number[] = [];
      await Promise.all([
        limiter.run(async () => {
          starts.push(currentTime);
        }),
        limiter.run(async () => {
          starts.push(currentTime);
        }),
      ]);

      expect(starts).toEqual([0, 0]);
    } finally {
      if (originalDelay === undefined) {
        delete process.env.ETSY_THROTTLE_DELAY_MS;
      } else {
        process.env.ETSY_THROTTLE_DELAY_MS = originalDelay;
      }
    }
  });
});
