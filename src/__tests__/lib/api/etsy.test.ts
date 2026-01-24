import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/api/request', () => ({
  request: vi.fn(),
  requestWithSchema: vi.fn(),
}))

import {
  etsyAccountsResponseSchema,
  etsyAuthResponseSchema,
  etsyDisconnectResponseSchema,
  etsyImportResponseSchema,
  etsyListingsResponseSchema,
  etsyStatusResponseSchema,
} from '#contracts/routes/etsy'
import {
  etsyOrderImportResponseSchema,
  etsyPendingOrdersResponseSchema,
  etsyPricesPendingResponseSchema,
  etsyPricesPushResponseSchema,
  etsySkusPendingResponseSchema,
  etsySkusPushResponseSchema,
  etsySkuGenerateResponseSchema,
  etsySyncComparisonResponseSchema,
  etsySyncPushResponseSchema,
  etsyOrdersBulkImportResponseSchema,
} from '#contracts/routes/etsySync'
import {
  etsy,
  EtsyAccount,
  EtsyBulkImportResult,
  EtsyImportResult,
  EtsyListing,
  EtsyOrderImportResult,
  EtsyPendingOrder,
  EtsySkuPushResult,
  EtsyStatus,
  EtsySyncComparison,
  EtsySyncPushResult,
} from '../../../lib/api/etsy'
import { request, requestWithSchema } from '../../../lib/api/request'

const mockRequest = vi.mocked(request)
const mockRequestWithSchema = vi.mocked(requestWithSchema)

describe('etsy API', () => {
  beforeEach(() => {
    mockRequest.mockReset()
    mockRequestWithSchema.mockReset()
  })

  describe('getStatus', () => {
    it('calls requestWithSchema with correct endpoint', async () => {
      const status: EtsyStatus = {
        connected: true,
        shopId: '123',
        shopName: 'Test Shop',
        expiresAt: '2024-01-01T00:00:00Z',
      }
      mockRequestWithSchema.mockResolvedValue(status)

      await etsy.getStatus()

      expect(mockRequestWithSchema).toHaveBeenCalledWith('/etsy/status', etsyStatusResponseSchema)
    })

    it('returns connection status', async () => {
      const status: EtsyStatus = { connected: true, shopId: '123', shopName: 'Test Shop' }
      mockRequestWithSchema.mockResolvedValue(status)

      const result = await etsy.getStatus()

      expect(result).toEqual(status)
    })

    it('returns disconnected status', async () => {
      mockRequestWithSchema.mockResolvedValue({ connected: false })

      const result = await etsy.getStatus()

      expect(result.connected).toBe(false)
    })
  })

  describe('initiateAuth', () => {
    it('calls requestWithSchema with correct endpoint', async () => {
      mockRequestWithSchema.mockResolvedValue({ authUrl: 'https://etsy.com/oauth', state: 'abc123' })

      await etsy.initiateAuth()

      expect(mockRequestWithSchema).toHaveBeenCalledWith('/etsy/auth', etsyAuthResponseSchema)
    })

    it('returns auth URL and state', async () => {
      const authResponse = { authUrl: 'https://etsy.com/oauth?client_id=...', state: 'random-state' }
      mockRequestWithSchema.mockResolvedValue(authResponse)

      const result = await etsy.initiateAuth()

      expect(result.authUrl).toContain('etsy.com')
      expect(result.state).toBeTruthy()
    })

    it('throws when mock mode auth response returned', async () => {
      mockRequestWithSchema.mockResolvedValue({
        mockMode: true,
        message: 'Mock mode active - no OAuth required. Already connected.',
      })

      await expect(etsy.initiateAuth()).rejects.toThrow('Mock mode active')
    })
  })

  describe('disconnect', () => {
    it('calls requestWithSchema with POST method', async () => {
      mockRequestWithSchema.mockResolvedValue({ success: true })

      await etsy.disconnect()

      expect(mockRequestWithSchema).toHaveBeenCalledWith('/etsy/disconnect', etsyDisconnectResponseSchema, {
        method: 'POST',
      })
    })

    it('returns success status', async () => {
      mockRequestWithSchema.mockResolvedValue({ success: true })

      const result = await etsy.disconnect()

      expect(result.success).toBe(true)
    })
  })

  describe('getListings', () => {
    const sampleListing: EtsyListing = {
      listing_id: 1,
      title: 'Test Product',
      description: 'Test description',
      price: { amount: 3000, divisor: 100, currency_code: 'GBP' },
      quantity: 5,
      state: 'active',
      url: 'https://www.etsy.com/listing/1',
      has_variations: false,
      inventory: null,
    }

    it('calls requestWithSchema with correct endpoint', async () => {
      mockRequestWithSchema.mockResolvedValue({ listings: [], count: 0 })

      await etsy.getListings()

      expect(mockRequestWithSchema).toHaveBeenCalledWith('/etsy/listings', etsyListingsResponseSchema)
    })

    it('returns listings array and count', async () => {
      mockRequestWithSchema.mockResolvedValue({ listings: [sampleListing], count: 1 })

      const result = await etsy.getListings()

      expect(result.listings).toHaveLength(1)
      expect(result.count).toBe(1)
    })
  })

  describe('importListings', () => {
    it('calls requestWithSchema with POST method', async () => {
      const importResult: EtsyImportResult = { created: 0, updated: 0, skipped: 0, errors: [] }
      mockRequestWithSchema.mockResolvedValue(importResult)

      await etsy.importListings()

      expect(mockRequestWithSchema).toHaveBeenCalledWith('/etsy/import', etsyImportResponseSchema, { method: 'POST' })
    })

    it('returns import results', async () => {
      const importResult: EtsyImportResult = { created: 5, updated: 2, skipped: 1, errors: [] }
      mockRequestWithSchema.mockResolvedValue(importResult)

      const result = await etsy.importListings()

      expect(result.created).toBe(5)
      expect(result.updated).toBe(2)
      expect(result.skipped).toBe(1)
      expect(result.errors).toHaveLength(0)
    })

    it('returns errors when import fails for some listings', async () => {
      const importResult: EtsyImportResult = { created: 3, updated: 0, skipped: 0, errors: ['Listing 123 failed'] }
      mockRequestWithSchema.mockResolvedValue(importResult)

      const result = await etsy.importListings()

      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('failed')
    })
  })

  describe('getComparison', () => {
    it('calls requestWithSchema with correct endpoint', async () => {
      mockRequestWithSchema.mockResolvedValue({ comparisons: [] })

      await etsy.getComparison()

      expect(mockRequestWithSchema).toHaveBeenCalledWith(
        '/etsy/sync/comparison',
        etsySyncComparisonResponseSchema,
      )
    })

    it('returns comparison data', async () => {
      const comparisons: EtsySyncComparison[] = [
        {
          etsyListingId: '123',
          title: 'Test Hamper',
          hamperName: 'Test Hamper',
          hamperId: 'clx0q2p1w0000s1l1n4m9n9n9',
          variants: [
            {
              etsySku: null,
              etsyProductId: null,
              variantId: null,
              variantName: 'Default',
              etsyQuantity: 5,
              inventoryQuantity: 10,
              indicativeQuantity: null,
              isIndicative: false,
              difference: 5,
              needsSync: true,
            },
          ],
        },
      ]
      mockRequestWithSchema.mockResolvedValue({ comparisons })

      const result = await etsy.getComparison()

      expect(result.comparisons).toHaveLength(1)
      const comparison = result.comparisons[0]!
      expect(comparison.variants).toHaveLength(1)
      const variant = comparison.variants[0]!
      expect(variant.needsSync).toBe(true)
    })
  })

  describe('pushUpdates', () => {
    const sampleResult: EtsySyncPushResult = {
      success: true,
      dryRun: false,
      updated: 1,
      skipped: 0,
      errors: 0,
      results: [
        {
          listingId: '123',
          success: true,
          skipped: false,
          dryRun: false,
          changes: [{ sku: 'SKU-1', currentQuantity: 5, newQuantity: 10 }],
        },
      ],
    }

    it('calls requestWithSchema with POST and update data', async () => {
      mockRequestWithSchema.mockResolvedValue(sampleResult)

      const updates = {
        updates: [{ etsyListingId: '123', etsySku: null, etsyProductId: '456', quantity: 10 }],
      }

      await etsy.pushUpdates(updates)

      expect(mockRequestWithSchema).toHaveBeenCalledWith('/etsy/sync/push', etsySyncPushResponseSchema, {
        method: 'POST',
        body: JSON.stringify(updates),
      })
    })

    it('returns success result', async () => {
      mockRequestWithSchema.mockResolvedValue({ ...sampleResult, updated: 3 })

      const result = await etsy.pushUpdates({ updates: [] })

      expect(result.success).toBe(true)
      expect(result.updated).toBe(3)
    })

    it('returns failure result when some updates error', async () => {
      mockRequestWithSchema.mockResolvedValue({
        ...sampleResult,
        success: false,
        errors: 1,
        results: [
          {
            listingId: '123',
            success: false,
            skipped: false,
            dryRun: false,
            error: 'Rate limited',
          },
        ],
      })

      const result = await etsy.pushUpdates({ updates: [] })

      expect(result.success).toBe(false)
      expect(result.errors).toBe(1)
    })
  })

  describe('getPendingOrders', () => {
    it('calls requestWithSchema with correct endpoint', async () => {
      mockRequestWithSchema.mockResolvedValue({ orders: [] })

      await etsy.getPendingOrders()

      expect(mockRequestWithSchema).toHaveBeenCalledWith('/etsy/sync/orders/pending', etsyPendingOrdersResponseSchema)
    })

    it('returns pending orders', async () => {
      const orders: EtsyPendingOrder[] = [
        {
          receiptId: 12345,
          buyerName: 'John Doe',
          createdAt: '2024-01-15T10:00:00Z',
          isPaid: true,
          isShipped: false,
          grandTotal: 35,
          subtotal: 30,
          shippingCost: 5,
          items: [
            {
              transactionId: 1,
              listingId: 123,
              title: 'Test',
              quantity: 1,
              price: 30,
              sku: null,
              productId: null,
              variantName: null,
            },
          ],
        },
      ]
      mockRequestWithSchema.mockResolvedValue({ orders })

      const result = await etsy.getPendingOrders()

      expect(result.orders).toHaveLength(1)
      expect(result.orders[0]!.buyerName).toBe('John Doe')
    })
  })

  describe('importOrder', () => {
    const sampleImport: EtsyOrderImportResult = {
      success: true,
      sale: { id: 'clx0q2p1w0000s1l1n4m9n9n9', etsyOrderId: '12345', totalCost: 10, margin: 5, lines: 1 },
    }

    it('calls requestWithSchema with POST and order data', async () => {
      mockRequestWithSchema.mockResolvedValue(sampleImport)

      await etsy.importOrder({ receiptId: 12345, postageCost: 3.5 })

      expect(mockRequestWithSchema).toHaveBeenCalledWith('/etsy/sync/orders/import', etsyOrderImportResponseSchema, {
        method: 'POST',
        body: JSON.stringify({ receiptId: 12345, postageCost: 3.5 }),
      })
    })

    it('returns imported sale info', async () => {
      mockRequestWithSchema.mockResolvedValue({
        ...sampleImport,
        sale: { ...sampleImport.sale, lines: 2 },
      })

      const result = await etsy.importOrder({ receiptId: 12345, postageCost: 3.5 })

      expect(result.success).toBe(true)
      expect(result.sale.id).toBe(sampleImport.sale.id)
      expect(result.sale.lines).toBe(2)
    })
  })

  describe('importOrdersBulk', () => {
    const sampleBulk: EtsyBulkImportResult = {
      success: true,
      imported: 1,
      failed: 0,
      results: [{ receiptId: 12345, success: true, saleId: 'clx0q2p1w0000s1l1n4m9n9n9n9' }],
    }

    it('calls requestWithSchema with POST and bulk order data', async () => {
      mockRequestWithSchema.mockResolvedValue(sampleBulk)

      const data = { orders: [{ receiptId: 12345, postageCost: 3.5 }] }

      await etsy.importOrdersBulk(data)

      expect(mockRequestWithSchema).toHaveBeenCalledWith('/etsy/sync/orders/import-bulk', etsyOrdersBulkImportResponseSchema, {
        method: 'POST',
        body: JSON.stringify(data),
      })
    })
  })

  describe('generateSkus', () => {
    it('calls requestWithSchema with correct endpoint', async () => {
      mockRequestWithSchema.mockResolvedValue({ success: true, generated: 0, results: [] })

      await etsy.generateSkus()

      expect(mockRequestWithSchema).toHaveBeenCalledWith('/etsy/sync/skus/generate', etsySkuGenerateResponseSchema, {
        method: 'POST',
      })
    })
  })

  describe('getPendingSkus', () => {
    it('calls requestWithSchema with correct endpoint', async () => {
      const data = { skus: [], needsSyncCount: 0, totalVariants: 0 }
      mockRequestWithSchema.mockResolvedValue(data)

      await etsy.getPendingSkus(['123'])

      expect(mockRequestWithSchema).toHaveBeenCalledWith(
        '/etsy/sync/skus/pending?listingIds=123',
        etsySkusPendingResponseSchema,
      )
    })
  })

  describe('pushSkus', () => {
    const sample: EtsySkuPushResult = {
      success: true,
      totalUpdated: 0,
      totalListings: 0,
      errors: 0,
      results: [],
    }

    it('calls requestWithSchema with correct endpoint and body', async () => {
      mockRequestWithSchema.mockResolvedValue(sample)

      await etsy.pushSkus(['123'])

      expect(mockRequestWithSchema).toHaveBeenCalledWith('/etsy/sync/skus/push', etsySkusPushResponseSchema, {
        method: 'POST',
        body: JSON.stringify({ listingIds: ['123'] }),
      })
    })
  })

  describe('getPendingPriceUpdates', () => {
    it('calls requestWithSchema with correct endpoint', async () => {
      const data = { updates: [], count: 0, needsSyncCount: 0 }
      mockRequestWithSchema.mockResolvedValue(data)

      await etsy.getPendingPriceUpdates(['123'])

      expect(mockRequestWithSchema).toHaveBeenCalledWith(
        '/etsy/sync/prices/pending?listingIds=123',
        etsyPricesPendingResponseSchema,
      )
    })
  })

  describe('pushPrices', () => {
    it('calls requestWithSchema with correct endpoint and body', async () => {
      mockRequestWithSchema.mockResolvedValue({ success: true, updated: 0, errors: 0, results: [] })

      const updates = [{ etsyListingId: '123', etsySku: null, etsyProductId: null, price: 10 }]

      await etsy.pushPrices(updates)

      expect(mockRequestWithSchema).toHaveBeenCalledWith('/etsy/sync/prices/push', etsyPricesPushResponseSchema, {
        method: 'POST',
        body: JSON.stringify({ updates }),
      })
    })
  })

  describe('getAccounts', () => {
    const sampleAccount: EtsyAccount = {
      userId: 'u-1',
      shopId: 's-1',
      shopName: 'Test Shop',
      loginName: null,
      isDefault: true,
      isAppOwner: true,
      expiresAt: '2024-01-01T00:00:00Z',
    }

    it('calls requestWithSchema with correct endpoint', async () => {
      mockRequestWithSchema.mockResolvedValue({ accounts: [sampleAccount] })

      await etsy.getAccounts()

      expect(mockRequestWithSchema).toHaveBeenCalledWith('/etsy/accounts', etsyAccountsResponseSchema)
    })
  })
})
