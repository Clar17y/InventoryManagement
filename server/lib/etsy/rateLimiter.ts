import type { ThrottleConfig, ThrottleDeps } from './types';

const DEFAULT_REQUEST_LIMITER_CONFIG: ThrottleConfig = {
  delayMs: 1000,
  maxUpdatesPerMinute: 30,
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;

  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;

  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function getDefaultConfig(): ThrottleConfig {
  return {
    delayMs: parseNonNegativeInt(
      process.env.ETSY_THROTTLE_DELAY_MS,
      DEFAULT_REQUEST_LIMITER_CONFIG.delayMs
    ),
    maxUpdatesPerMinute: parsePositiveInt(
      process.env.ETSY_MAX_REQUESTS_PER_MIN ?? process.env.ETSY_MAX_UPDATES_PER_MIN,
      DEFAULT_REQUEST_LIMITER_CONFIG.maxUpdatesPerMinute
    ),
  };
}

export class EtsyRequestLimiter {
  private queue: Promise<void> = Promise.resolve();
  private timestamps: number[] = [];
  private lastStart: number | null = null;
  private cooldownUntil = 0;
  private config: ThrottleConfig;
  private now: () => number;
  private sleep: (ms: number) => Promise<void>;

  constructor(config?: Partial<ThrottleConfig>, deps?: ThrottleDeps) {
    const defaultConfig = getDefaultConfig();
    this.config = {
      delayMs: config?.delayMs ?? defaultConfig.delayMs,
      maxUpdatesPerMinute:
        config?.maxUpdatesPerMinute ?? defaultConfig.maxUpdatesPerMinute,
    };
    this.now = deps?.now ?? Date.now;
    this.sleep = deps?.sleep ?? defaultSleep;
  }

  async run<T>(operation: () => Promise<T>): Promise<T> {
    const runAfterQueue = this.queue.then(async () => {
      await this.waitForTurn();
      return operation();
    });

    this.queue = runAfterQueue.then(
      () => undefined,
      () => undefined
    );

    return runAfterQueue;
  }

  applyRetryAfter(retryAfterSeconds: number | undefined): void {
    const seconds =
      retryAfterSeconds && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? retryAfterSeconds
        : 60;
    this.cooldownUntil = Math.max(this.cooldownUntil, this.now() + seconds * 1000);
  }

  private async waitForTurn(): Promise<void> {
    while (true) {
      const currentTime = this.now();

      if (this.cooldownUntil > currentTime) {
        await this.sleep(this.cooldownUntil - currentTime);
        continue;
      }

      if (this.lastStart !== null && this.config.delayMs > 0) {
        const nextAllowedStart = this.lastStart + this.config.delayMs;
        if (nextAllowedStart > currentTime) {
          await this.sleep(nextAllowedStart - currentTime);
          continue;
        }
      }

      const oneMinuteAgo = currentTime - 60000;
      this.timestamps = this.timestamps.filter((timestamp) => timestamp > oneMinuteAgo);

      if (this.timestamps.length >= this.config.maxUpdatesPerMinute) {
        const nextWindowStart = this.timestamps[0] + 60000;
        if (nextWindowStart > currentTime) {
          await this.sleep(nextWindowStart - currentTime);
          continue;
        }
      }

      const startTime = this.now();
      this.timestamps.push(startTime);
      this.lastStart = startTime;
      return;
    }
  }
}

export const globalEtsyRequestLimiter = new EtsyRequestLimiter();
