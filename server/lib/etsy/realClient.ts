import { prisma } from '../prisma';
import {
  IEtsyClient,
  EtsyApiError,
  EtsyShop,
  EtsyListing,
  EtsyInventory,
  EtsyReceipt,
  EtsyInventoryUpdateProduct,
  EtsyTokenResponse,
  EtsyCredentialsRecord,
  EtsyAuthFunctions,
} from './types';

const ETSY_API_BASE = 'https://api.etsy.com/v3';

export class RealEtsyClient implements IEtsyClient {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.ETSY_API_KEY || '';
    if (!this.apiKey) {
      console.warn('ETSY_API_KEY not set - Etsy integration will not work');
    }
  }

  private async getCredentialsInternal(): Promise<EtsyCredentialsRecord | null> {
    const credentials = await prisma.etsyCredentials.findFirst();
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

  private async refreshTokens(
    credentialsId: string,
    refreshToken: string
  ): Promise<EtsyCredentialsRecord> {
    const response = await fetch('https://api.etsy.com/v3/public/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.apiKey,
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      await prisma.etsyCredentials.delete({ where: { id: credentialsId } });
      throw new EtsyApiError(
        response.status,
        'Failed to refresh Etsy tokens - please reconnect'
      );
    }

    const data = await response.json();

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

    const response = await fetch(`${ETSY_API_BASE}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      let details: unknown;
      try {
        details = JSON.parse(errorText);
      } catch {
        details = errorText;
      }

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

    return response.json();
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

    const response = await this.request<{
      results: EtsyListing[];
      count: number;
    }>(
      `/application/shops/${credentials.shopId}/listings/active?limit=${limit}&offset=${offset}`
    );

    return { listings: response.results || [], count: response.count };
  }

  async getListingInventory(listingId: number): Promise<EtsyInventory> {
    const response = await this.request<EtsyInventory>(
      `/application/listings/${listingId}/inventory`
    );
    return response;
  }

  async updateListingInventory(
    listingId: number,
    products: EtsyInventoryUpdateProduct[]
  ): Promise<EtsyInventory> {
    const response = await this.request<EtsyInventory>(
      `/application/listings/${listingId}/inventory`,
      {
        method: 'PUT',
        body: JSON.stringify({ products }),
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
    const credentials = await prisma.etsyCredentials.findFirst();
    return credentials;
  }
}

export const etsyAuth: EtsyAuthFunctions = new EtsyAuthManager();
