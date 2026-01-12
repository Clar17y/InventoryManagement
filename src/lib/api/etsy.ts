import { request } from './request'

// Types for Etsy API responses
export interface EtsyStatus {
    connected: boolean
    shopId?: string
    shopName?: string
    expiresAt?: string
}

export interface EtsyAuthResponse {
    authUrl: string
    state: string
}

export interface EtsyListingMoney {
    amount: number
    divisor: number
    currency_code: string
}

export interface EtsyProductOffering {
    offering_id: number
    quantity: number
    price: EtsyListingMoney
    is_enabled: boolean
}

export interface EtsyProduct {
    product_id: number
    sku: string
    offerings: EtsyProductOffering[]
    property_values: Array<{
        property_id: number
        property_name: string
        values: string[]
    }>
}

export interface EtsyInventory {
    products: EtsyProduct[]
    listing_id: number
}

export interface EtsyListing {
    listing_id: number
    title: string
    description: string
    price: EtsyListingMoney
    quantity: number
    state: 'active' | 'inactive' | 'draft' | 'expired' | 'sold_out'
    url: string
    has_variations: boolean
    inventory?: EtsyInventory | null
}

export interface EtsyImportResult {
    created: number
    updated: number
    skipped: number
    errors: string[]
}

export interface EtsySyncComparison {
    etsyListingId: string
    title: string
    hamperName: string
    hamperId: string
    variants: Array<{
        etsySku: string | null
        etsyProductId: string | null
        variantId: string | null
        variantName: string
        etsyQuantity: number
        inventoryQuantity: number
        difference: number
        needsSync: boolean
    }>
}

export interface EtsySyncPushRequest {
    updates: Array<{
        etsyListingId: string
        etsySku: string | null
        etsyProductId: string | null
        quantity: number
    }>
}

export interface EtsySyncPushResult {
    success: boolean
    updated: number
    error?: string
}

export interface EtsyPendingOrderItem {
    transactionId: number
    listingId: number
    title: string
    quantity: number
    price: number
    sku: string | null
    productId: number | null
    variantName: string | null
}

export interface EtsyPendingOrder {
    receiptId: number
    buyerName: string
    createdAt: string
    isPaid: boolean
    isShipped: boolean
    grandTotal: number
    subtotal: number
    shippingCost: number
    items: EtsyPendingOrderItem[]
}

export interface EtsyOrderImportRequest {
    receiptId: number
    postageCost: number
}

export interface EtsyOrderImportResult {
    success: boolean
    sale: {
        id: string
        etsyOrderId: string
        lines: number
    }
}

export interface EtsyPendingSku {
    hamperId: string
    hamperName: string
    etsyListingId: string
    variantId: string
    variantName: string
    localSku: string
    etsySku: string | null
    etsyProductId: string | null
    needsSync: boolean
}

export interface EtsySkuPushResult {
    success: boolean
    totalUpdated: number
    totalListings: number
    errors: number
    results: Array<{
        etsyListingId: string
        hamperName: string
        success: boolean
        updated: number
        skipped: number
        error?: string
    }>
}

export interface EtsyPendingPriceUpdate {
    hamperId: string
    hamperName: string
    etsyListingId: string
    variantId: string
    variantName: string
    etsySku: string | null
    etsyProductId: string | null
    localPrice: number | null
    etsyPrice: number
    needsSync: boolean
}

// Etsy API client
export const etsy = {
    /**
     * Get Etsy connection status
     */
    getStatus: () => request<EtsyStatus>('/etsy/status'),

    /**
     * Initiate OAuth flow (returns URL to redirect to)
     */
    initiateAuth: () => request<EtsyAuthResponse>('/etsy/auth'),

    /**
     * Disconnect from Etsy
     */
    disconnect: () => request<{ success: boolean }>('/etsy/disconnect', { method: 'POST' }),

    /**
     * Get all listings from Etsy
     */
    getListings: () => request<{ listings: EtsyListing[]; count: number }>('/etsy/listings'),

    /**
     * Import Etsy listings as hampers
     */
    importListings: () => request<EtsyImportResult>('/etsy/import', { method: 'POST' }),

    /**
     * Get sync comparison data
     */
    getComparison: () => request<{ comparisons: EtsySyncComparison[] }>('/etsy/sync/comparison'),

    /**
     * Push inventory updates to Etsy
     */
    pushUpdates: (data: EtsySyncPushRequest) =>
        request<EtsySyncPushResult>('/etsy/sync/push', {
            method: 'POST',
            body: JSON.stringify(data)
        }),

    /**
     * Get pending Etsy orders (not yet imported as sales)
     */
    getPendingOrders: () => request<{ orders: EtsyPendingOrder[] }>('/etsy/sync/orders/pending'),

    /**
     * Import an Etsy order as a sale
     */
    importOrder: (data: EtsyOrderImportRequest) =>
        request<EtsyOrderImportResult>('/etsy/sync/orders/import', {
            method: 'POST',
            body: JSON.stringify(data)
        }),

    /**
     * Generate SKUs for variants that don't have them
     */
    generateSkus: () =>
        request<{ success: boolean; generated: number; results: Array<{ hamperName: string; variantName: string; sku: string }> }>(
            '/etsy/sync/skus/generate',
            { method: 'POST' }
        ),

    /**
     * Get pending SKU syncs (local SKUs that differ from Etsy)
     */
    getPendingSkus: () =>
        request<{ skus: EtsyPendingSku[]; needsSyncCount: number; totalVariants: number }>(
            '/etsy/sync/skus/pending'
        ),

    /**
     * Push local SKUs to Etsy
     */
    pushSkus: (listingIds?: string[]) =>
        request<EtsySkuPushResult>('/etsy/sync/skus/push', {
            method: 'POST',
            body: JSON.stringify({ listingIds })
        }),

    /**
     * Get price comparisons for Etsy-linked hampers/variants (includes in-sync rows; use `needsSync` to filter)
     */
    getPendingPriceUpdates: () =>
        request<{ updates: EtsyPendingPriceUpdate[]; count: number; needsSyncCount?: number }>('/etsy/sync/prices/pending'),

    /**
     * Push local prices to Etsy for specified variants
     */
    pushPrices: (updates: Array<{ etsyListingId: string; etsySku: string | null; etsyProductId: string | null; price: number }>) =>
        request<{ success: boolean; updated: number; errors: number; results: Array<{ listingId: string; success: boolean; error?: string }> }>(
            '/etsy/sync/prices/push',
            {
                method: 'POST',
                body: JSON.stringify({ updates })
            }
        ),
}
