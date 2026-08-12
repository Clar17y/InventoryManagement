// Etsy API Types and Interfaces

// =============================================================================
// Shared Error Class - used by both real and mock clients
// =============================================================================

export class EtsyApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfter?: number,
    public details?: unknown
  ) {
    super(message);
    this.name = 'EtsyApiError';
  }
}

// =============================================================================
// Etsy API Response Types
// =============================================================================

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

// Listing with embedded inventory from batch endpoint
export interface EtsyListingWithInventory extends EtsyListing {
  inventory?: EtsyInventory;
}

export interface EtsyProductOffering {
  offering_id: number;
  quantity: number;
  price: EtsyMoney;
  is_enabled: boolean;
  is_deleted?: boolean;
  readiness_state_id?: number;
}

export interface EtsyProduct {
  product_id: number;
  sku: string;
  is_deleted: boolean;
  offerings: EtsyProductOffering[];
  property_values: Array<{
    property_id: number;
    property_name: string;
    scale_id: number | null;
    scale_name: string | null;
    value_ids: number[];
    values: string[];
  }>;
}

export interface EtsyInventory {
  products: EtsyProduct[];
  listing_id: number;
  price_on_property: number[];
  quantity_on_property: number[];
  sku_on_property: number[];
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

/** Aggregate payment values returned by Etsy's read-only receipt payments endpoint. */
export interface EtsyPayment {
  payment_id: number;
  receipt_id: number;
  currency: string;
  amount_gross: EtsyMoney;
  amount_fees: EtsyMoney;
  amount_net: EtsyMoney;
  adjusted_gross: EtsyMoney;
  adjusted_fees: EtsyMoney;
  adjusted_net: EtsyMoney;
}

export interface EtsyTransactionVariation {
  property_id: number;
  value_id: number;
  formatted_name: string;
  formatted_value: string;
}

export interface EtsyTransaction {
  transaction_id: number;
  listing_id: number;
  title: string;
  quantity: number;
  price: EtsyMoney;
  sku: string | null;
  product_id: number | null;
  variations: EtsyTransactionVariation[];
}

export interface EtsyShop {
  shop_id: number;
  shop_name: string;
  user_id: number;
}

// =============================================================================
// Inventory Update Types
// =============================================================================

export interface EtsyInventoryUpdateOffering {
  quantity: number;
  price: number;
  is_enabled: boolean;
  readiness_state_id?: number | null;
}

export interface EtsyInventoryUpdateProduct {
  sku: string;
  property_values: Array<{
    property_id: number;
    property_name: string;
    value_ids: number[];
    values: string[];
  }>;
  offerings: EtsyInventoryUpdateOffering[];
}

// =============================================================================
// OAuth Token Types
// =============================================================================

export interface EtsyTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

// =============================================================================
// Core Client Interface (no auth methods)
// =============================================================================

export interface IEtsyClient {
  getShop(): Promise<EtsyShop>;
  getActiveListings(
    limit?: number,
    offset?: number
  ): Promise<{ listings: EtsyListing[]; count: number }>;
  getListingInventory(listingId: number): Promise<EtsyInventory>;
  getListingsByListingIds(
    listingIds: number[],
    includes?: ('Inventory' | 'Images' | 'Shop')[]
  ): Promise<EtsyListingWithInventory[]>;
  updateListingInventory(
    listingId: number,
    products: EtsyInventoryUpdateProduct[],
    currentInventory?: EtsyInventory,
    options?: { skuOnProperty?: number[] }
  ): Promise<EtsyInventory>;
  getReceipts(
    minCreated?: number,
    limit?: number
  ): Promise<{ receipts: EtsyReceipt[]; count: number }>;
  getPaymentsForReceipt(receiptId: number): Promise<EtsyPayment[]>;
  isConnected(): Promise<boolean>;
  disconnect(): Promise<void>;
}

// =============================================================================
// Auth Functions Interface (real client only)
// =============================================================================

export interface EtsyCredentialsRecord {
  id: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  shopId: string;
  shopName: string;
  userId: string;
  loginName: string | null;
  isDefault: boolean;
  isAppOwner: boolean;
}

export interface EtsyAuthFunctions {
  exchangeCodeForTokens(
    code: string,
    codeVerifier: string
  ): Promise<EtsyTokenResponse>;
  getCredentials(): Promise<EtsyCredentialsRecord | null>;
}

// =============================================================================
// Mock Client Configuration
// =============================================================================

export type MockErrorMode = '401' | '403' | '404' | '409' | '422' | '429';

export interface MockEtsyClientConfig {
  errorMode?: MockErrorMode | null;
  errorOnListingId?: number;
  rateLimitRetryAfter?: number;
  connected?: boolean;
  shop?: EtsyShop;
  listings?: EtsyListing[];
  inventoryByListingId?: Map<number, EtsyInventory>;
  receipts?: EtsyReceipt[];
  paymentsByReceiptId?: Map<number, EtsyPayment[]>;
}

// =============================================================================
// Factory Options
// =============================================================================

export interface CreateEtsyClientOptions {
  mode?: 'mock' | 'real';
  mockConfig?: MockEtsyClientConfig;
}

// =============================================================================
// Safety Feature Types
// =============================================================================

export interface DryRunChange {
  sku: string;
  currentQuantity: number;
  newQuantity: number;
}

export interface DryRunResult {
  wouldUpdate: boolean;
  listingId: number;
  changes: DryRunChange[];
}

export interface ThrottleConfig {
  delayMs: number;
  maxUpdatesPerMinute: number;
}

export interface ThrottleDeps {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface UpdateResult {
  listingId: number;
  success: boolean;
  skipped: boolean;
  dryRun: boolean;
  changes?: DryRunChange[];
  error?: string;
}

// =============================================================================
// Reconciliation Report Types
// =============================================================================

export interface ReconciliationNewListing {
  listingId: number;
  title: string;
  state: string;
  variantCount: number;
}

export interface ReconciliationChangedSku {
  hamperId: string;
  hamperName: string;
  variantId: string;
  variantName: string;
  localSku: string | null;
  etsySku: string;
}

export interface ReconciliationMissingSku {
  hamperId: string;
  hamperName: string;
  variantId: string;
  variantName: string;
}

export interface ReconciliationOrphanedHamper {
  hamperId: string;
  hamperName: string;
  etsyListingId: string;
}

export interface ReconciliationQuantityDiff {
  etsyListingId: string;
  hamperId: string;
  hamperName: string;
  etsySku: string | null;
  variantName: string;
  etsyQuantity: number;
  computedCanMake: number;
  difference: number;
}

export interface ReconciliationSummary {
  totalListings: number;
  mappedHampers: number;
  unmappedListings: number;
  syncNeeded: number;
  errors: number;
}

export interface ReconciliationReport {
  generatedAt: string;
  newListings: ReconciliationNewListing[];
  changedSkus: ReconciliationChangedSku[];
  variantsMissingSku: ReconciliationMissingSku[];
  orphanedHampers: ReconciliationOrphanedHamper[];
  quantityDifferences: ReconciliationQuantityDiff[];
  summary: ReconciliationSummary;
}
