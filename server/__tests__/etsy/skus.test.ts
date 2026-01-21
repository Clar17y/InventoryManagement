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
import { generateSkus, getPendingSkus, pushSkus } from '../../lib/etsy/sync/skus';

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
});

