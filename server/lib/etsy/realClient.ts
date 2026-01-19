import { prisma } from '../prisma';
import {
  IEtsyClient,
  EtsyApiError,
  EtsyShop,
  EtsyListing,
  EtsyListingWithInventory,
  EtsyInventory,
  EtsyReceipt,
  EtsyInventoryUpdateProduct,
  EtsyTokenResponse,
  EtsyCredentialsRecord,
  EtsyAuthFunctions,
} from './types';
import {
  logApiRequest,
  logApiResponse,
  logApiError,
  logDebug,
} from './debugLogger';

const ETSY_API_BASE = 'https://api.etsy.com/v3';

export class RealEtsyClient implements IEtsyClient {
  private apiKey: string;
  private sharedSecret: string;

  constructor() {
    this.apiKey = process.env.ETSY_API_KEY || '';
    this.sharedSecret = process.env.ETSY_SHARED_SECRET || '';
    if (!this.apiKey) {
      console.warn('ETSY_API_KEY not set - Etsy integration will not work');
    }
    if (!this.sharedSecret) {
      console.warn('ETSY_SHARED_SECRET not set - Etsy API calls may fail');
    }
  }

  /** Build x-api-key header value: KEYSTRING:SHARED_SECRET */
  private getApiKeyHeader(): string {
    return this.sharedSecret ? `${this.apiKey}:${this.sharedSecret}` : this.apiKey;
  }

  /**
   * Get credentials for API calls.
   * Prefers the default account (isDefault=true), falls back to first available.
   */
  private async getCredentialsInternal(): Promise<EtsyCredentialsRecord | null> {
    // First try to get the default account
    let credentials = await prisma.etsyCredentials.findFirst({
      where: { isDefault: true },
    });

    // Fallback to any account if no default set
    if (!credentials) {
      credentials = await prisma.etsyCredentials.findFirst();
    }

    if (!credentials) return null;

    // Check if tokens need refresh (refresh 5 minutes before expiry)
    const now = new Date();
    const expiresAt = new Date(credentials.expiresAt);
    const refreshBuffer = 5 * 60 * 1000; // 5 minutes

    if (now.getTime() + refreshBuffer > expiresAt.getTime()) {
      return this.refreshTokens(credentials.id, credentials.refreshToken);
    }

    return credentials;
  }

  /**
   * Set an account as the default for API calls.
   * Uses a transaction to ensure only one account is default.
   */
  async setDefaultAccount(userId: string): Promise<void> {
    await prisma.$transaction([
      // Clear existing default
      prisma.etsyCredentials.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      }),
      // Set new default
      prisma.etsyCredentials.update({
        where: { userId },
        data: { isDefault: true },
      }),
    ]);
  }

  private async refreshTokens(
    credentialsId: string,
    refreshToken: string
  ): Promise<EtsyCredentialsRecord> {
    logDebug('AUTH', 'Refreshing tokens', { credentialsId });
    const startTime = Date.now();

    const response = await fetch('https://api.etsy.com/v3/public/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.apiKey,
        refresh_token: refreshToken,
      }),
    });

    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      logApiError('POST', '/public/oauth/token (refresh)', response.status, errorText, durationMs);
      await prisma.etsyCredentials.delete({ where: { id: credentialsId } });
      throw new EtsyApiError(
        response.status,
        'Failed to refresh Etsy tokens - please reconnect'
      );
    }

    const data = await response.json();
    logApiResponse('POST', '/public/oauth/token (refresh)', response.status, {
      expires_in: data.expires_in,
      token_type: data.token_type,
    }, durationMs);

    const updated = await prisma.etsyCredentials.update({
      where: { id: credentialsId },
      data: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: new Date(Date.now() + data.expires_in * 1000),
      },
    });

    return updated;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const credentials = await this.getCredentialsInternal();
    if (!credentials) {
      throw new EtsyApiError(401, 'Not connected to Etsy');
    }

    const method = options.method || 'GET';
    const startTime = Date.now();

    // Log the request
    logApiRequest(method, endpoint, options.body ? JSON.parse(options.body as string) : undefined);

    const response = await fetch(`${ETSY_API_BASE}${endpoint}`, {
      ...options,
      headers: {
        // accessToken already includes userId prefix (format: userId.token)
        Authorization: `Bearer ${credentials.accessToken}`,
        'x-api-key': this.getApiKeyHeader(),
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      let details: unknown;
      try {
        details = JSON.parse(errorText);
      } catch {
        details = errorText;
      }

      // Log the error
      logApiError(method, endpoint, response.status, {
        errorText,
        details,
      }, durationMs);

      const retryAfter =
        response.status === 429
          ? parseInt(response.headers.get('Retry-After') || '60', 10)
          : undefined;

      throw new EtsyApiError(
        response.status,
        `Etsy API error: ${response.status}`,
        retryAfter,
        details
      );
    }

    const data = await response.json();

    // Log successful response
    logApiResponse(method, endpoint, response.status, data, durationMs);

    return data;
  }

  async getShop(): Promise<EtsyShop> {
    const credentials = await this.getCredentialsInternal();
    if (!credentials) {
      throw new EtsyApiError(401, 'Not connected to Etsy');
    }

    const response = await this.request<{ results: EtsyShop[] }>(
      `/application/users/${credentials.userId}/shops`
    );

    if (!response.results || response.results.length === 0) {
      throw new EtsyApiError(404, 'No shop found for this Etsy account');
    }

    return response.results[0];
  }

  async getActiveListings(
    limit = 100,
    offset = 0
  ): Promise<{ listings: EtsyListing[]; count: number }> {
    const credentials = await this.getCredentialsInternal();
    if (!credentials) {
      throw new EtsyApiError(401, 'Not connected to Etsy');
    }

    // Use all listings endpoint - /listings/active doesn't work reliably for test shops
    const response = await this.request<{
      results: EtsyListing[];
      count: number;
    }>(
      `/application/shops/${credentials.shopId}/listings?limit=${limit}&offset=${offset}&state=active`
    );

    return { listings: response.results || [], count: response.count };
  }

  async getListingInventory(listingId: number): Promise<EtsyInventory> {
    const response = await this.request<EtsyInventory>(
      `/application/listings/${listingId}/inventory`
    );
    return response;
  }

  async getListingsByListingIds(
    listingIds: number[],
    includes?: ('Inventory' | 'Images' | 'Shop')[]
  ): Promise<EtsyListingWithInventory[]> {
    if (listingIds.length === 0) return [];

    const BATCH_SIZE = 100; // Etsy API limit
    const allResults: EtsyListingWithInventory[] = [];

    for (let i = 0; i < listingIds.length; i += BATCH_SIZE) {
      const chunk = listingIds.slice(i, i + BATCH_SIZE);
      const idsParam = chunk.join(',');
      const includesParam = includes?.length ? `&includes=${includes.join(',')}` : '';

      const response = await this.request<{ results: EtsyListingWithInventory[] }>(
        `/application/listings/batch?listing_ids=${idsParam}${includesParam}`
      );
      allResults.push(...(response.results || []));
    }

    return allResults;
  }

  async updateListingInventory(
    listingId: number,
    products: EtsyInventoryUpdateProduct[],
    currentInventory?: EtsyInventory,
    options?: { skuOnProperty?: number[] }
  ): Promise<EtsyInventory> {
    // Determine sku_on_property: if products have different SKUs, we need to specify which property
    let skuOnProperty = currentInventory?.sku_on_property ?? [];

    // If explicitly provided, use that
    if (options?.skuOnProperty !== undefined) {
      skuOnProperty = options.skuOnProperty;
    } else if (products.length > 1) {
      // Check if products have different SKUs
      const uniqueSkus = new Set(products.map(p => p.sku).filter(Boolean));
      if (uniqueSkus.size > 1 && skuOnProperty.length === 0) {
        // SKUs differ but sku_on_property is empty - inherit from quantity or price property
        // Use array length check since empty array [] is truthy with nullish coalescing
        const qtyProps = currentInventory?.quantity_on_property ?? [];
        const priceProps = currentInventory?.price_on_property ?? [];
        skuOnProperty = qtyProps.length > 0 ? qtyProps : priceProps;
      }
    }

    const requestBody = {
      products,
      // Preserve the *_on_property settings from current inventory
      price_on_property: currentInventory?.price_on_property ?? [],
      quantity_on_property: currentInventory?.quantity_on_property ?? [],
      sku_on_property: skuOnProperty,
    };
    const response = await this.request<EtsyInventory>(
      `/application/listings/${listingId}/inventory`,
      {
        method: 'PUT',
        body: JSON.stringify(requestBody),
      }
    );
    return response;
  }

  async getReceipts(
    minCreated?: number,
    limit = 25
  ): Promise<{ receipts: EtsyReceipt[]; count: number }> {
    const credentials = await this.getCredentialsInternal();
    if (!credentials) {
      throw new EtsyApiError(401, 'Not connected to Etsy');
    }

    let url = `/application/shops/${credentials.shopId}/receipts?limit=${limit}`;
    if (minCreated) {
      url += `&min_created=${minCreated}`;
    }

    const response = await this.request<{
      results: EtsyReceipt[];
      count: number;
    }>(url);
    return { receipts: response.results || [], count: response.count };
  }

  async isConnected(): Promise<boolean> {
    try {
      const credentials = await this.getCredentialsInternal();
      return !!credentials;
    } catch {
      return false;
    }
  }

  async disconnect(): Promise<void> {
    await prisma.etsyCredentials.deleteMany();
  }
}

// =============================================================================
// Auth Functions (exported separately for OAuth routes)
// =============================================================================

class EtsyAuthManager implements EtsyAuthFunctions {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.ETSY_API_KEY || '';
  }

  async exchangeCodeForTokens(
    code: string,
    codeVerifier: string
  ): Promise<EtsyTokenResponse> {
    const redirectUri = process.env.ETSY_REDIRECT_URI || '';

    const response = await fetch('https://api.etsy.com/v3/public/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.apiKey,
        redirect_uri: redirectUri,
        code,
        code_verifier: codeVerifier,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new EtsyApiError(
        response.status,
        `Failed to exchange code: ${errorText}`
      );
    }

    return response.json();
  }

  async getCredentials(): Promise<EtsyCredentialsRecord | null> {
    // Prefer default account, fallback to any
    let credentials = await prisma.etsyCredentials.findFirst({
      where: { isDefault: true },
    });
    if (!credentials) {
      credentials = await prisma.etsyCredentials.findFirst();
    }
    return credentials;
  }
}

export const etsyAuth: EtsyAuthFunctions = new EtsyAuthManager();
