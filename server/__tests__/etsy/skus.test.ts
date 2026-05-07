import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/prisma', () => ({
  prisma: {
    hamper: { findMany: vi.fn() },
    hamperVariant: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('../../lib/etsyClient', () => ({
  etsyClient: {
    getListingInventory: vi.fn(),
    getListingsByListingIds: vi.fn(),
    updateListingInventory: vi.fn(),
  },
}));

vi.mock('../../lib/etsy/debugLogger', () => ({
  logWorkflow: vi.fn(),
  startLogSession: vi.fn().mockReturnValue('test-session'),
  endLogSession: vi.fn(),
}));

import { prisma } from '../../lib/prisma';
import { etsyClient } from '../../lib/etsyClient';
import { clearInventoryCache, getListingInventoryCached } from '../../lib/etsy/inventoryCache';
import {
  generateSkus,
  getDuplicateSkuReport,
  getPendingSkus,
  repairDuplicateSkus,
  pushSkus,
} from '../../lib/etsy/sync/skus';

const mockPrisma = prisma as unknown as {
  hamper: { findMany: ReturnType<typeof vi.fn> };
  hamperVariant: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

const mockEtsyClient = etsyClient as unknown as {
  getListingInventory: ReturnType<typeof vi.fn>;
  getListingsByListingIds: ReturnType<typeof vi.fn>;
  updateListingInventory: ReturnType<typeof vi.fn>;
};

describe('SKU Sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearInventoryCache();
    process.env.ETSY_THROTTLE_DELAY_MS = '0';
    process.env.ETSY_MAX_UPDATES_PER_MIN = '1000';
  });

  it('generates a hamper SKU for a non-variant listing (creating a Default variant if needed)', async () => {
    mockPrisma.hamper.findMany.mockResolvedValue([
      {
        id: 'hamper-1',
        name: 'Luxury Pamper Hamper',
        etsyListingId: '1234567890',
        isActive: true,
        hasVariants: false,
        variants: [],
      },
    ]);

    mockPrisma.hamperVariant.findMany.mockResolvedValue([]);
    mockPrisma.hamperVariant.create.mockResolvedValue({
      id: 'variant-default-1',
      hamperId: 'hamper-1',
      name: 'Default',
      etsySku: null,
      etsyProductId: null,
      sellingPrice: null,
      isActive: true,
    });

    mockPrisma.hamperVariant.update.mockResolvedValue({});

    const result = await generateSkus();

    expect(result.success).toBe(true);
    expect(result.generated).toBe(1);
    expect(mockPrisma.hamperVariant.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.hamperVariant.update).toHaveBeenCalledWith({
      where: { id: 'variant-default-1' },
      data: { etsySku: 'LPH-7890' },
    });
    expect(result.results[0]).toEqual({
      hamperName: 'Luxury Pamper Hamper',
      variantName: 'Default',
      sku: 'LPH-7890',
    });
  });

  it('includes non-variant listings in pending SKU syncs (single-product inventory)', async () => {
    mockPrisma.hamper.findMany.mockResolvedValue([
      {
        id: 'hamper-1',
        name: 'Luxury Pamper Hamper',
        etsyListingId: '1234567890',
        isActive: true,
        hasVariants: false,
        variants: [
          {
            id: 'variant-default-1',
            name: 'Default',
            etsySku: 'LPH-7890',
            etsyProductId: null,
            isActive: true,
          },
        ],
      },
    ]);

    mockEtsyClient.getListingsByListingIds.mockResolvedValue([
      {
        listing_id: 1234567890,
        inventory: {
          listing_id: 1234567890,
          products: [
            {
              product_id: 111,
              sku: '',
              property_values: [],
              offerings: [],
            },
          ],
        },
      },
    ]);

    const result = await getPendingSkus();

    expect(result.totalVariants).toBe(1);
    expect(result.needsSyncCount).toBe(1);
    expect(result.skus[0]).toMatchObject({
      hamperId: 'hamper-1',
      hamperName: 'Luxury Pamper Hamper',
      etsyListingId: '1234567890',
      variantId: 'variant-default-1',
      variantName: 'Default',
      localSku: 'LPH-7890',
      etsySku: null,
      etsyProductId: '111',
      needsSync: true,
    });
  });

  it('pushes a non-variant SKU to Etsy by treating single-product listings as Default', async () => {
    mockPrisma.hamper.findMany.mockResolvedValue([
      {
        id: 'hamper-1',
        name: 'Luxury Pamper Hamper',
        etsyListingId: '123',
        isActive: true,
        variants: [
          {
            id: 'variant-default-1',
            name: 'Default',
            etsySku: 'LPH-0123',
            etsyProductId: null,
          },
        ],
      },
    ]);

    mockEtsyClient.getListingInventory.mockResolvedValue({
      listing_id: 123,
      products: [
        {
          product_id: 111,
          sku: '',
          property_values: [],
          offerings: [
            {
              quantity: 5,
              price: { amount: 1000, divisor: 100 },
              is_enabled: true,
              readiness_state_id: null,
            },
          ],
        },
      ],
    });

    mockEtsyClient.updateListingInventory.mockResolvedValue({});

    const result = await pushSkus(['123']);

    expect(result.success).toBe(true);
    expect(mockEtsyClient.updateListingInventory).toHaveBeenCalledTimes(1);
    const [, updatedProducts] = mockEtsyClient.updateListingInventory.mock.calls[0];
    expect(updatedProducts[0].sku).toBe('LPH-0123');
  });

  it('reports duplicate live Etsy SKUs by listing and product', async () => {
    mockPrisma.hamper.findMany.mockResolvedValue([
      {
        id: 'hamper-1',
        name: 'New Parent Survival Kit - Medium',
        etsyListingId: '4389575255',
        isActive: true,
        variants: [],
      },
    ]);

    mockEtsyClient.getListingsByListingIds.mockResolvedValue([
      {
        listing_id: 4389575255,
        title: 'New Parent Survival Kit - Medium',
        inventory: {
          listing_id: 4389575255,
          products: [
            product(1, 'DUP-SKU', 'Grey Marble / Boy'),
            product(2, 'DUP-SKU', 'Mustard Star / Boy'),
            product(3, 'UNIQUE-SKU', 'Grey Marble / Girl'),
          ],
        },
      },
    ]);

    const result = await getDuplicateSkuReport(['4389575255']);

    expect(result.summary).toEqual({
      scannedListings: 1,
      listingsWithDuplicateSkus: 1,
      duplicateSkuGroups: 1,
      productsInDuplicateGroups: 2,
    });
    expect(result.listings[0].duplicateGroups[0]).toMatchObject({
      sku: 'DUP-SKU',
      count: 2,
      products: [
        { etsyProductId: '1', variantName: 'Grey Marble / Boy' },
        { etsyProductId: '2', variantName: 'Mustard Star / Boy' },
      ],
    });
  });

  it('dry-runs duplicate SKU repair without pushing to Etsy or updating local variants', async () => {
    mockPrisma.hamper.findMany.mockResolvedValue([
      {
        id: 'hamper-1',
        name: 'New Parent Survival Kit - Medium',
        etsyListingId: '4389575255',
        isActive: true,
        variants: [
          {
            id: 'variant-mustard',
            name: 'Mustard Star / Boy',
            etsySku: 'DUP-SKU',
            etsyProductId: '2',
          },
          {
            id: 'variant-grey',
            name: 'Grey Marble / Boy',
            etsySku: null,
            etsyProductId: '1',
          },
        ],
      },
    ]);
    mockPrisma.hamperVariant.findMany.mockResolvedValue([
      { etsySku: 'DUP-SKU' },
    ]);
    mockEtsyClient.getListingInventory.mockResolvedValue({
      listing_id: 4389575255,
      products: [
        product(1, 'DUP-SKU', 'Grey Marble / Boy'),
        product(2, 'DUP-SKU', 'Mustard Star / Boy'),
      ],
      price_on_property: [1],
      quantity_on_property: [1],
      sku_on_property: [1],
    });

    const result = await repairDuplicateSkus({ listingIds: ['4389575255'], dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.totalWouldChange).toBe(1);
    expect(result.results[0].changes).toEqual([
      expect.objectContaining({
        etsyProductId: '1',
        variantName: 'Grey Marble / Boy',
        oldSku: 'DUP-SKU',
        newSku: 'NPSK-5255-GMB',
        localVariantId: 'variant-grey',
      }),
    ]);
    expect(mockEtsyClient.updateListingInventory).not.toHaveBeenCalled();
    expect(mockPrisma.hamperVariant.update).not.toHaveBeenCalled();
  });

  it('repairs duplicate SKUs by product ID and updates linked local variants', async () => {
    mockPrisma.hamper.findMany.mockResolvedValue([
      {
        id: 'hamper-1',
        name: 'New Parent Survival Kit - Medium',
        etsyListingId: '4389575255',
        isActive: true,
        variants: [
          {
            id: 'variant-mustard',
            name: 'Mustard Star / Boy',
            etsySku: 'DUP-SKU',
            etsyProductId: '2',
          },
          {
            id: 'variant-grey',
            name: 'Grey Marble / Boy',
            etsySku: null,
            etsyProductId: '1',
          },
        ],
      },
    ]);
    mockPrisma.hamperVariant.findMany.mockResolvedValue([
      { etsySku: 'DUP-SKU' },
    ]);
    mockPrisma.hamperVariant.update.mockResolvedValue({});
    mockEtsyClient.getListingInventory.mockResolvedValue({
      listing_id: 4389575255,
      products: [
        product(1, 'DUP-SKU', 'Grey Marble / Boy'),
        product(2, 'DUP-SKU', 'Mustard Star / Boy'),
      ],
      price_on_property: [1],
      quantity_on_property: [1],
      sku_on_property: [1],
    });
    mockEtsyClient.updateListingInventory.mockResolvedValue({});

    const result = await repairDuplicateSkus({ listingIds: ['4389575255'], dryRun: false });

    expect(result.dryRun).toBe(false);
    expect(result.totalUpdated).toBe(1);
    expect(mockEtsyClient.updateListingInventory).toHaveBeenCalledTimes(1);
    const [, updatedProducts] = mockEtsyClient.updateListingInventory.mock.calls[0];
    expect(updatedProducts.map((p: { sku: string }) => p.sku)).toEqual([
      'NPSK-5255-GMB',
      'DUP-SKU',
    ]);
    expect(mockPrisma.hamperVariant.update).toHaveBeenCalledWith({
      where: { id: 'variant-grey' },
      data: { etsySku: 'NPSK-5255-GMB' },
    });
  });

  it('repairs duplicate SKUs from fresh Etsy inventory instead of a cached snapshot', async () => {
    mockPrisma.hamper.findMany.mockResolvedValue([
      {
        id: 'hamper-1',
        name: 'New Parent Survival Kit - Medium',
        etsyListingId: '4389575255',
        isActive: true,
        variants: [
          { id: 'variant-grey', name: 'Grey Marble / Boy', etsySku: null, etsyProductId: '1' },
          { id: 'variant-mustard', name: 'Mustard Star / Boy', etsySku: 'DUP-SKU', etsyProductId: '2' },
        ],
      },
    ]);
    mockPrisma.hamperVariant.findMany.mockResolvedValue([{ etsySku: 'DUP-SKU' }]);
    mockEtsyClient.getListingInventory
      .mockResolvedValueOnce({
        listing_id: 4389575255,
        products: [product(1, 'STALE-SKU', 'Grey Marble / Boy')],
        price_on_property: [1],
        quantity_on_property: [1],
        sku_on_property: [1],
      })
      .mockResolvedValueOnce({
        listing_id: 4389575255,
        products: [
          product(1, 'DUP-SKU', 'Grey Marble / Boy'),
          product(2, 'DUP-SKU', 'Mustard Star / Boy'),
        ],
        price_on_property: [1],
        quantity_on_property: [1],
        sku_on_property: [1],
      });

    await getListingInventoryCached(4389575255);
    const result = await repairDuplicateSkus({ listingIds: ['4389575255'], dryRun: true });

    expect(mockEtsyClient.getListingInventory).toHaveBeenCalledTimes(2);
    expect(result.totalWouldChange).toBe(1);
  });

  it('does not repair a duplicate SKU to a local SKU already used by another Etsy product', async () => {
    mockPrisma.hamper.findMany.mockResolvedValue([
      {
        id: 'hamper-1',
        name: 'New Parent Survival Kit - Medium',
        etsyListingId: '4389575255',
        isActive: true,
        variants: [
          { id: 'variant-grey', name: 'Grey Marble / Boy', etsySku: 'LOCAL-SKU', etsyProductId: '1' },
          { id: 'variant-mustard', name: 'Mustard Star / Boy', etsySku: 'DUP-SKU', etsyProductId: '2' },
          { id: 'variant-blue', name: 'Blue Star / Boy', etsySku: 'LOCAL-SKU', etsyProductId: '3' },
        ],
      },
    ]);
    mockPrisma.hamperVariant.findMany.mockResolvedValue([
      { etsySku: 'DUP-SKU' },
      { etsySku: 'LOCAL-SKU' },
    ]);
    mockEtsyClient.getListingInventory.mockResolvedValue({
      listing_id: 4389575255,
      products: [
        product(1, 'DUP-SKU', 'Grey Marble / Boy'),
        product(2, 'DUP-SKU', 'Mustard Star / Boy'),
        product(3, 'LOCAL-SKU', 'Blue Star / Boy'),
      ],
      price_on_property: [1],
      quantity_on_property: [1],
      sku_on_property: [1],
    });

    const result = await repairDuplicateSkus({ listingIds: ['4389575255'], dryRun: true });

    expect(result.results[0].changes[0]).toMatchObject({
      etsyProductId: '1',
      newSku: 'LOCAL-SKU-2',
    });
  });
});

function product(productId: number, sku: string, variantName: string) {
  const values = variantName.split(' / ');
  return {
    product_id: productId,
    sku,
    is_deleted: false,
    property_values: values.map((value, index) => ({
      property_id: index + 1,
      property_name: index === 0 ? 'Design' : 'Gender',
      scale_id: null,
      scale_name: null,
      value_ids: [productId + index],
      values: [value],
    })),
    offerings: [
      {
        offering_id: productId * 10,
        quantity: 2,
        price: { amount: 2800, divisor: 100, currency_code: 'GBP' },
        is_enabled: true,
        readiness_state_id: null,
      },
    ],
  };
}

