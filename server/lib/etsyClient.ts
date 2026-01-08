/**
 * Etsy Client - Backwards Compatibility Layer
 *
 * This file re-exports from the new modular etsy/ directory
 * to maintain backwards compatibility with existing imports.
 *
 * New code should import directly from './etsy/factory' or './etsy/types'.
 */

import { getEtsyClient, etsyAuth } from './etsy/factory';

// Re-export all types for backwards compatibility
export * from './etsy/types';

// Re-export factory functions
export { getEtsyClient, createEtsyClient, resetEtsyClient } from './etsy/factory';

// Re-export auth functions
export { etsyAuth };

// Singleton instance for backwards compatibility
// Existing code uses: import { etsyClient } from './etsyClient';
export const etsyClient = getEtsyClient();
