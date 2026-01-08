import { IEtsyClient, CreateEtsyClientOptions } from './types';
import { RealEtsyClient, etsyAuth } from './realClient';
import { MockEtsyClient } from './mockClient';

/**
 * Create a new Etsy client instance.
 *
 * Testable factory - tests pass options directly, production uses env.
 *
 * @param options - Optional configuration
 * @param options.mode - 'mock' or 'real' (defaults to ETSY_MODE env var or 'real')
 * @param options.mockConfig - Configuration for mock client
 * @returns An IEtsyClient instance
 */
export function createEtsyClient(options: CreateEtsyClientOptions = {}): IEtsyClient {
  const mode = options.mode ?? process.env.ETSY_MODE ?? 'real';

  if (mode === 'mock') {
    console.log('[Etsy] Running in MOCK mode');
    return new MockEtsyClient(options.mockConfig);
  }

  return new RealEtsyClient();
}

// Singleton instance for backwards compatibility
let instance: IEtsyClient | null = null;

/**
 * Get the singleton Etsy client instance.
 *
 * Uses ETSY_MODE env var to determine which client to create.
 */
export function getEtsyClient(): IEtsyClient {
  if (!instance) {
    instance = createEtsyClient();
  }
  return instance;
}

/**
 * Reset the singleton instance.
 *
 * Useful for tests that need to switch between mock and real clients.
 */
export function resetEtsyClient(): void {
  instance = null;
}

// Re-export auth functions for routes that need OAuth
export { etsyAuth };

// Re-export types for convenience
export * from './types';

// Re-export client classes for direct instantiation in tests
export { RealEtsyClient } from './realClient';
export { MockEtsyClient } from './mockClient';
