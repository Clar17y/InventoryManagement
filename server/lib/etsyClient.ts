import { prisma } from './prisma';

const ETSY_API_BASE = 'https://api.etsy.com/v3';

// Types for Etsy API responses
export interface EtsyMoney {
    amount: number;
    divisor: number;
    currency_code: string;
}

export interface EtsyListing {
    listing_id: number;
    title: string;
    description: string;
    price: EtsyMoney;
    quantity: number;
    state: 'active' | 'inactive' | 'draft' | 'expired' | 'sold_out';
    url: string;
    has_variations: boolean;
}

export interface EtsyProductOffering {
    offering_id: number;
    quantity: number;
    price: EtsyMoney;
    is_enabled: boolean;
}

export interface EtsyProduct {
    product_id: number;
    sku: string;
    offerings: EtsyProductOffering[];
    property_values: Array<{
        property_id: number;
        property_name: string;
        values: string[];
    }>;
}

export interface EtsyInventory {
    products: EtsyProduct[];
    listing_id: number;
}

export interface EtsyReceipt {
    receipt_id: number;
    receipt_type: number;
    seller_user_id: number;
    buyer_user_id: number;
    name: string;
    first_line: string;
    city: string;
    state: string;
    zip: string;
    status: string;
    is_paid: boolean;
    is_shipped: boolean;
    create_timestamp: number;
    update_timestamp: number;
    grandtotal: EtsyMoney;
    subtotal: EtsyMoney;
    total_shipping_cost: EtsyMoney;
    total_tax_cost: EtsyMoney;
    transactions: EtsyTransaction[];
}

export interface EtsyTransaction {
    transaction_id: number;
    listing_id: number;
    title: string;
    quantity: number;
    price: EtsyMoney;
    sku: string | null;
}

export interface EtsyShop {
    shop_id: number;
    shop_name: string;
    user_id: number;
}

class EtsyClient {
    private apiKey: string;

    constructor() {
        this.apiKey = process.env.ETSY_API_KEY || '';
        if (!this.apiKey) {
            console.warn('ETSY_API_KEY not set - Etsy integration will not work');
        }
    }

    /**
     * Get the currently stored credentials, refreshing if needed
     */
    async getCredentials() {
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

    /**
     * Refresh OAuth tokens
     */
    private async refreshTokens(credentialsId: string, refreshToken: string) {
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
            // If refresh fails, delete credentials
            await prisma.etsyCredentials.delete({ where: { id: credentialsId } });
            throw new Error('Failed to refresh Etsy tokens - please reconnect');
        }

        const data = await response.json();

        // Update stored credentials
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

    /**
     * Make authenticated request to Etsy API
     */
    private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
        const credentials = await this.getCredentials();
        if (!credentials) {
            throw new Error('Not connected to Etsy');
        }

        const response = await fetch(`${ETSY_API_BASE}${endpoint}`, {
            ...options,
            headers: {
                'Authorization': `Bearer ${credentials.accessToken}`,
                'x-api-key': this.apiKey,
                'Content-Type': 'application/json',
                ...options.headers,
            },
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Etsy API error: ${response.status} ${error}`);
        }

        return response.json();
    }

    /**
     * Get shop information for the authenticated user
     */
    async getShop(): Promise<EtsyShop> {
        const credentials = await this.getCredentials();
        if (!credentials) throw new Error('Not connected to Etsy');

        const response = await this.request<{ results: EtsyShop[] }>(
            `/application/users/${credentials.userId}/shops`
        );

        if (!response.results || response.results.length === 0) {
            throw new Error('No shop found for this Etsy account');
        }

        return response.results[0];
    }

    /**
     * Get all active listings for the shop
     */
    async getActiveListings(limit = 100, offset = 0): Promise<{ listings: EtsyListing[]; count: number }> {
        const credentials = await this.getCredentials();
        if (!credentials) throw new Error('Not connected to Etsy');

        const response = await this.request<{ results: EtsyListing[]; count: number }>(
            `/application/shops/${credentials.shopId}/listings/active?limit=${limit}&offset=${offset}`
        );

        return { listings: response.results || [], count: response.count };
    }

    /**
     * Get inventory for a specific listing
     */
    async getListingInventory(listingId: number): Promise<EtsyInventory> {
        const response = await this.request<EtsyInventory>(
            `/application/listings/${listingId}/inventory`
        );
        return response;
    }

    /**
     * Update inventory for a listing
     * IMPORTANT: Must send complete inventory data, partial updates will delete other products
     */
    async updateListingInventory(
        listingId: number,
        products: Array<{
            sku: string;
            offerings: Array<{ quantity: number; price: number; is_enabled: boolean }>;
        }>
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

    /**
     * Get receipts (orders) for the shop
     */
    async getReceipts(minCreated?: number, limit = 25): Promise<{ receipts: EtsyReceipt[]; count: number }> {
        const credentials = await this.getCredentials();
        if (!credentials) throw new Error('Not connected to Etsy');

        let url = `/application/shops/${credentials.shopId}/receipts?limit=${limit}`;
        if (minCreated) {
            url += `&min_created=${minCreated}`;
        }

        const response = await this.request<{ results: EtsyReceipt[]; count: number }>(url);
        return { receipts: response.results || [], count: response.count };
    }

    /**
     * Exchange authorization code for access tokens
     */
    async exchangeCodeForTokens(code: string, codeVerifier: string): Promise<{
        access_token: string;
        refresh_token: string;
        expires_in: number;
    }> {
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
            const error = await response.text();
            throw new Error(`Failed to exchange code: ${error}`);
        }

        return response.json();
    }

    /**
     * Check if connected to Etsy
     */
    async isConnected(): Promise<boolean> {
        try {
            const credentials = await this.getCredentials();
            return !!credentials;
        } catch {
            return false;
        }
    }

    /**
     * Disconnect from Etsy (clear stored credentials)
     */
    async disconnect(): Promise<void> {
        await prisma.etsyCredentials.deleteMany();
    }
}

export const etsyClient = new EtsyClient();
