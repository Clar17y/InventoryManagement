import {
  IEtsyClient,
  EtsyApiError,
  EtsyShop,
  EtsyListing,
  EtsyListingWithInventory,
  EtsyInventory,
  EtsyReceipt,
  EtsyInventoryUpdateProduct,
  MockEtsyClientConfig,
  MockErrorMode,
} from './types';
import { getDefaultFixtures, cloneFixtures } from './fixtures';

export class MockEtsyClient implements IEtsyClient {
  private shop: EtsyShop;
  private listings: EtsyListing[];
  private inventoryByListingId: Map<number, EtsyInventory>;
  private receipts: EtsyReceipt[];
  private config: MockEtsyClientConfig;
  private connected: boolean;

  constructor(config: MockEtsyClientConfig = {}) {
    this.config = config;
    this.connected = config.connected ?? true;

    // Use provided fixtures or defaults
    const defaults = getDefaultFixtures();
    this.shop = config.shop ?? defaults.shop;
    this.listings = config.listings ?? defaults.listings;
    this.inventoryByListingId =
      config.inventoryByListingId ?? defaults.inventoryByListingId;
    this.receipts = config.receipts ?? defaults.receipts;
  }

  /**
   * Reset the mock to initial state (useful for tests)
   */
  reset(config?: MockEtsyClientConfig): void {
    const newConfig = config ?? this.config;
    this.config = newConfig;
    this.connected = newConfig.connected ?? true;

    const defaults = cloneFixtures(getDefaultFixtures());
    this.shop = newConfig.shop ?? defaults.shop;
    this.listings = newConfig.listings ?? defaults.listings;
    this.inventoryByListingId =
      newConfig.inventoryByListingId ?? defaults.inventoryByListingId;
    this.receipts = newConfig.receipts ?? defaults.receipts;
  }

  /**
   * Configure error mode at runtime
   */
  setErrorMode(mode: MockErrorMode | null, listingId?: number): void {
    this.config.errorMode = mode;
    this.config.errorOnListingId = listingId;
  }

  /**
   * Set connection state
   */
  setConnected(connected: boolean): void {
    this.connected = connected;
  }

  /**
   * Check if should throw error based on config
   */
  private maybeThrowError(listingId?: number): void {
    const { errorMode, errorOnListingId, rateLimitRetryAfter } = this.config;

    if (!errorMode) return;
    if (errorOnListingId !== undefined && listingId !== errorOnListingId) return;

    const status = parseInt(errorMode, 10);
    const messages: Record<MockErrorMode, string> = {
      '401': 'Unauthorized - token expired or invalid',
      '403': 'Forbidden - insufficient scope',
      '404': 'Not Found - resource does not exist',
      '409': 'Conflict - concurrent modification detected',
      '422': 'Validation Error - invalid request data',
      '429': 'Rate Limited - too many requests',
    };

    throw new EtsyApiError(
      status,
      messages[errorMode] || `Error ${errorMode}`,
      errorMode === '429' ? (rateLimitRetryAfter ?? 60) : undefined
    );
  }

  /**
   * Check connection state
   */
  private checkConnected(): void {
    if (!this.connected) {
      throw new EtsyApiError(401, 'Not connected to Etsy');
    }
  }

  // ==========================================================================
  // IEtsyClient Implementation
  // ==========================================================================

  async getShop(): Promise<EtsyShop> {
    this.checkConnected();
    this.maybeThrowError();
    return { ...this.shop };
  }

  async getActiveListings(
    limit = 100,
    offset = 0
  ): Promise<{ listings: EtsyListing[]; count: number }> {
    this.checkConnected();
    this.maybeThrowError();

    // Filter to active listings only
    const activeListings = this.listings.filter((l) => l.state === 'active');

    // count = total matching rows (pre-slice)
    const count = activeListings.length;

    // Apply pagination (slice after filtering)
    const paginated = activeListings.slice(offset, offset + limit);

    // Return copies to prevent external mutation
    return {
      listings: paginated.map((l) => ({ ...l, price: { ...l.price } })),
      count,
    };
  }

  async getListingInventory(listingId: number): Promise<EtsyInventory> {
    this.checkConnected();
    this.maybeThrowError(listingId);

    const inventory = this.inventoryByListingId.get(listingId);
    if (!inventory) {
      throw new EtsyApiError(404, `Listing ${listingId} not found`);
    }

    // Return a deep copy with all fields
    return {
      listing_id: inventory.listing_id,
      price_on_property: [...(inventory.price_on_property || [])],
      quantity_on_property: [...(inventory.quantity_on_property || [])],
      sku_on_property: [...(inventory.sku_on_property || [])],
      products: inventory.products.map((p) => ({
        ...p,
        offerings: p.offerings.map((o) => ({ ...o, price: { ...o.price } })),
        property_values: p.property_values.map((pv) => ({
          ...pv,
          value_ids: [...(pv.value_ids || [])],
          values: [...pv.values],
        })),
      })),
    };
  }

  async getListingsByListingIds(
    listingIds: number[],
    includes?: ('Inventory' | 'Images' | 'Shop')[]
  ): Promise<EtsyListingWithInventory[]> {
    this.checkConnected();
    this.maybeThrowError();

    const results: EtsyListingWithInventory[] = [];
    for (const listingId of listingIds) {
      const listing = this.listings.find((l) => l.listing_id === listingId);
      if (!listing) continue;

      const result: EtsyListingWithInventory = { ...listing, price: { ...listing.price } };

      // Include inventory if requested
      if (includes?.includes('Inventory')) {
        const inventory = this.inventoryByListingId.get(listingId);
        if (inventory) {
          result.inventory = {
            listing_id: inventory.listing_id,
            price_on_property: [...(inventory.price_on_property || [])],
            quantity_on_property: [...(inventory.quantity_on_property || [])],
            sku_on_property: [...(inventory.sku_on_property || [])],
            products: inventory.products.map((p) => ({
              ...p,
              offerings: p.offerings.map((o) => ({ ...o, price: { ...o.price } })),
              property_values: p.property_values.map((pv) => ({
                ...pv,
                value_ids: [...(pv.value_ids || [])],
                values: [...pv.values],
              })),
            })),
          };
        }
      }

      results.push(result);
    }

    return results;
  }

  async updateListingInventory(
    listingId: number,
    products: EtsyInventoryUpdateProduct[],
    _currentInventory?: EtsyInventory,
    _options?: { skuOnProperty?: number[] }
  ): Promise<EtsyInventory> {
    this.checkConnected();
    this.maybeThrowError(listingId);

    const current = this.inventoryByListingId.get(listingId);
    if (!current) {
      throw new EtsyApiError(404, `Listing ${listingId} not found`);
    }

    // Apply updates to internal state
    // Match by property_values when SKU is empty (like real Etsy API)
    const updatedProducts = current.products.map((existingProduct) => {
      // Try to match by SKU first (if not empty)
      let updateProduct = existingProduct.sku
        ? products.find((p) => p.sku === existingProduct.sku)
        : null;

      // If SKU is empty, match by property_values (value_ids)
      if (!updateProduct && !existingProduct.sku) {
        updateProduct = products.find((p) => {
          if (p.property_values.length !== existingProduct.property_values.length) {
            return false;
          }
          return p.property_values.every((pv, idx) => {
            const existingPv = existingProduct.property_values[idx];
            if (!existingPv) return false;
            // Match by value_ids
            return (
              pv.property_id === existingPv.property_id &&
              pv.value_ids.length === existingPv.value_ids.length &&
              pv.value_ids.every((vid, i) => vid === existingPv.value_ids[i])
            );
          });
        });
      }

      if (!updateProduct) return existingProduct;

      return {
        ...existingProduct,
        // Persist SKU updates (important for SKU push functionality)
        sku: updateProduct.sku,
        offerings: existingProduct.offerings.map((offering, idx) => {
          const updateOffering = updateProduct!.offerings[idx];
          if (!updateOffering) return offering;

          return {
            ...offering,
            quantity: updateOffering.quantity,
            price: {
              amount: Math.round(updateOffering.price * 100),
              divisor: 100,
              currency_code: offering.price.currency_code,
            },
            is_enabled: updateOffering.is_enabled,
          };
        }),
      };
    });

    // Persist to state (preserve the *_on_property arrays)
    const updatedInventory: EtsyInventory = {
      listing_id: listingId,
      price_on_property: current.price_on_property || [],
      quantity_on_property: current.quantity_on_property || [],
      sku_on_property: current.sku_on_property || [],
      products: updatedProducts,
    };
    this.inventoryByListingId.set(listingId, updatedInventory);

    // Update listing total quantity
    const totalQty = updatedProducts.reduce((sum, p) => {
      const firstOffering = p.offerings[0];
      return sum + (firstOffering?.quantity ?? 0);
    }, 0);

    const listingIdx = this.listings.findIndex(
      (l) => l.listing_id === listingId
    );
    if (listingIdx >= 0) {
      this.listings[listingIdx] = { ...this.listings[listingIdx], quantity: totalQty };
    }

    // Return copy of updated inventory
    return this.getListingInventory(listingId);
  }

  async getReceipts(
    minCreated?: number,
    limit = 25
  ): Promise<{ receipts: EtsyReceipt[]; count: number }> {
    this.checkConnected();
    this.maybeThrowError();

    // Filter by minCreated if provided
    let filtered = this.receipts;
    if (minCreated !== undefined) {
      filtered = this.receipts.filter((r) => r.create_timestamp >= minCreated);
    }

    // Sort by create_timestamp descending (newest first)
    filtered = [...filtered].sort(
      (a, b) => b.create_timestamp - a.create_timestamp
    );

    // count = total matching rows (pre-slice)
    const count = filtered.length;

    // Apply pagination
    const paginated = filtered.slice(0, limit);

    // Return deep copies
    return {
      receipts: paginated.map((r) => ({
        ...r,
        grandtotal: { ...r.grandtotal },
        subtotal: { ...r.subtotal },
        total_shipping_cost: { ...r.total_shipping_cost },
        total_tax_cost: { ...r.total_tax_cost },
        transactions: r.transactions.map((t) => ({ ...t, price: { ...t.price } })),
      })),
      count,
    };
  }

  async isConnected(): Promise<boolean> {
    return this.connected;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  // ==========================================================================
  // Test Helpers
  // ==========================================================================

  /**
   * Add a listing (for test setup)
   */
  addListing(listing: EtsyListing, inventory: EtsyInventory): void {
    this.listings.push(listing);
    this.inventoryByListingId.set(listing.listing_id, inventory);
  }

  /**
   * Add a receipt (for test setup)
   */
  addReceipt(receipt: EtsyReceipt): void {
    this.receipts.push(receipt);
  }

  /**
   * Get current internal state (for test assertions)
   */
  getInternalState(): {
    shop: EtsyShop;
    listings: EtsyListing[];
    inventoryByListingId: Map<number, EtsyInventory>;
    receipts: EtsyReceipt[];
  } {
    return {
      shop: this.shop,
      listings: this.listings,
      inventoryByListingId: this.inventoryByListingId,
      receipts: this.receipts,
    };
  }
}
