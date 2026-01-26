import { describe, it, expect, vi, beforeEach } from 'vitest';
import { allocateStockForRequirement, allocateStockForVariantRequirement } from '../../lib/sales/allocation';

// Mock prisma
vi.mock('../../lib/prisma', () => ({
  prisma: {
    componentCategory: {
      findUnique: vi.fn(),
    },
    hamperVariantMapping: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from '../../lib/prisma';

const mockPrisma = prisma as unknown as {
  componentCategory: {
    findUnique: ReturnType<typeof vi.fn>;
  };
  hamperVariantMapping: {
    findMany: ReturnType<typeof vi.fn>;
  };
};

describe('Stock Allocation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('allocateStockForRequirement', () => {
    it('allocates from single lot when sufficient', async () => {
      mockPrisma.componentCategory.findUnique.mockResolvedValue({
        id: 'cat-1',
        name: 'Ribbon',
        products: [
          {
            id: 'prod-1',
            name: 'Blue Ribbon',
            lots: [
              { id: 'lot-1', remaining: 10, unitCost: 1.5, receivedAt: new Date('2024-01-01'), expiresAt: null },
            ],
          },
        ],
      });

      const result = await allocateStockForRequirement('cat-1', 5, 'FIFO');

      expect(result.fulfilled).toBe(true);
      expect(result.allocations).toHaveLength(1);
      expect(result.allocations[0].quantity).toBe(5);
      expect(result.totalCost).toBe(7.5);
    });

    it('allocates across multiple lots when needed', async () => {
      mockPrisma.componentCategory.findUnique.mockResolvedValue({
        id: 'cat-1',
        name: 'Ribbon',
        products: [
          {
            id: 'prod-1',
            name: 'Blue Ribbon',
            lots: [
              { id: 'lot-1', remaining: 3, unitCost: 1.0, receivedAt: new Date('2024-01-01'), expiresAt: null },
              { id: 'lot-2', remaining: 5, unitCost: 1.2, receivedAt: new Date('2024-01-02'), expiresAt: null },
            ],
          },
        ],
      });

      const result = await allocateStockForRequirement('cat-1', 6, 'FIFO');

      expect(result.fulfilled).toBe(true);
      expect(result.allocations).toHaveLength(2);
      expect(result.allocations[0]).toEqual(expect.objectContaining({ lotId: 'lot-1', quantity: 3 }));
      expect(result.allocations[1]).toEqual(expect.objectContaining({ lotId: 'lot-2', quantity: 3 }));
      expect(result.totalCost).toBe(3 * 1.0 + 3 * 1.2);
    });

    it('returns fulfilled=false when insufficient stock', async () => {
      mockPrisma.componentCategory.findUnique.mockResolvedValue({
        id: 'cat-1',
        name: 'Ribbon',
        products: [
          {
            id: 'prod-1',
            name: 'Blue Ribbon',
            lots: [
              { id: 'lot-1', remaining: 3, unitCost: 1.0, receivedAt: new Date('2024-01-01'), expiresAt: null },
            ],
          },
        ],
      });

      const result = await allocateStockForRequirement('cat-1', 10, 'FIFO');

      expect(result.fulfilled).toBe(false);
      expect(result.allocations).toHaveLength(1);
      expect(result.allocations[0].quantity).toBe(3); // Partial allocation
    });

    it('uses CHEAPEST pick rule correctly', async () => {
      mockPrisma.componentCategory.findUnique.mockResolvedValue({
        id: 'cat-1',
        name: 'Ribbon',
        products: [
          {
            id: 'prod-1',
            name: 'Expensive Ribbon',
            lots: [
              { id: 'lot-expensive', remaining: 10, unitCost: 5.0, receivedAt: new Date('2024-01-01'), expiresAt: null },
            ],
          },
          {
            id: 'prod-2',
            name: 'Cheap Ribbon',
            lots: [
              { id: 'lot-cheap', remaining: 10, unitCost: 1.0, receivedAt: new Date('2024-01-02'), expiresAt: null },
            ],
          },
        ],
      });

      const result = await allocateStockForRequirement('cat-1', 5, 'CHEAPEST');

      expect(result.fulfilled).toBe(true);
      expect(result.allocations[0].lotId).toBe('lot-cheap');
      expect(result.totalCost).toBe(5.0);
    });

    it('uses FEFO pick rule correctly', async () => {
      mockPrisma.componentCategory.findUnique.mockResolvedValue({
        id: 'cat-1',
        name: 'Food',
        products: [
          {
            id: 'prod-1',
            name: 'Cookies',
            lots: [
              { id: 'lot-later', remaining: 10, unitCost: 1.0, receivedAt: new Date('2024-01-01'), expiresAt: new Date('2025-06-01') },
              { id: 'lot-sooner', remaining: 10, unitCost: 1.0, receivedAt: new Date('2024-01-02'), expiresAt: new Date('2025-03-01') },
            ],
          },
        ],
      });

      const result = await allocateStockForRequirement('cat-1', 5, 'FEFO');

      expect(result.fulfilled).toBe(true);
      expect(result.allocations[0].lotId).toBe('lot-sooner'); // Expires first
    });
  });

  describe('Multi-line order allocation (aggregation behavior)', () => {
    it('correctly identifies shortage when multiple lines share a category', async () => {
      // Scenario: 2 hampers each need 3 ribbons, but only 5 in stock
      // Old bug: each line independently saw 5 available, both passed
      // Fixed: aggregate to 6 needed, check against 5 available = shortage

      mockPrisma.componentCategory.findUnique.mockResolvedValue({
        id: 'cat-ribbon',
        name: 'Ribbon',
        products: [
          {
            id: 'prod-1',
            name: 'Blue Ribbon',
            lots: [
              { id: 'lot-1', remaining: 5, unitCost: 1.0, receivedAt: new Date('2024-01-01'), expiresAt: null },
            ],
          },
        ],
      });

      // Simulate aggregated check (what the fixed endpoint does)
      const totalNeeded = 3 + 3; // Two lines, 3 each
      const result = await allocateStockForRequirement('cat-ribbon', totalNeeded, 'FIFO');

      expect(result.fulfilled).toBe(false);
      expect(result.quantityRequired).toBe(6);
      expect(result.allocations.reduce((sum, a) => sum + a.quantity, 0)).toBe(5);
    });

    it('succeeds when aggregated needs can be fulfilled', async () => {
      // Scenario: 2 hampers each need 3 ribbons, 10 in stock = OK
      mockPrisma.componentCategory.findUnique.mockResolvedValue({
        id: 'cat-ribbon',
        name: 'Ribbon',
        products: [
          {
            id: 'prod-1',
            name: 'Blue Ribbon',
            lots: [
              { id: 'lot-1', remaining: 10, unitCost: 1.0, receivedAt: new Date('2024-01-01'), expiresAt: null },
            ],
          },
        ],
      });

      const totalNeeded = 3 + 3;
      const result = await allocateStockForRequirement('cat-ribbon', totalNeeded, 'FIFO');

      expect(result.fulfilled).toBe(true);
      expect(result.allocations[0].quantity).toBe(6);
    });
  });

  describe('Transaction client usage', () => {
    it('accepts custom client for transaction context', async () => {
      const mockTxClient = {
        componentCategory: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'cat-1',
            name: 'Ribbon',
            products: [
              {
                id: 'prod-1',
                name: 'Blue Ribbon',
                lots: [
                  { id: 'lot-1', remaining: 10, unitCost: 1.0, receivedAt: new Date('2024-01-01'), expiresAt: null },
                ],
              },
            ],
          }),
        },
      };

      // @ts-expect-error - simplified mock
      const result = await allocateStockForRequirement('cat-1', 5, 'FIFO', mockTxClient);

      expect(result.fulfilled).toBe(true);
      expect(mockTxClient.componentCategory.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'cat-1' } })
      );
      // Default prisma should NOT have been called
      expect(mockPrisma.componentCategory.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('allocateStockForVariantRequirement', () => {
    it('falls back to category-wide allocation when no mappings exist', async () => {
      mockPrisma.hamperVariantMapping.findMany.mockResolvedValue([]);
      mockPrisma.componentCategory.findUnique.mockResolvedValue({
        id: 'cat-1',
        name: 'Rattle',
        products: [
          {
            id: 'prod-1',
            name: 'Blue Rattle',
            lots: [
              { id: 'lot-1', remaining: 10, unitCost: 2.0, receivedAt: new Date('2024-01-01'), expiresAt: null },
            ],
          },
        ],
      });

      const result = await allocateStockForVariantRequirement('var-1', 'cat-1', 3, 'FIFO');

      expect(result.fulfilled).toBe(true);
      expect(result.allocations).toHaveLength(1);
      expect(result.allocations[0].quantity).toBe(3);
    });

    it('allocates from priority 1 product first (waterfall)', async () => {
      mockPrisma.hamperVariantMapping.findMany.mockResolvedValue([
        {
          variantId: 'var-1',
          categoryId: 'cat-1',
          productId: 'prod-blue',
          priority: 1,
          category: { id: 'cat-1', name: 'Rattle' },
          product: {
            id: 'prod-blue',
            name: 'Blue Rattle',
            lots: [
              { id: 'lot-blue', remaining: 10, unitCost: 2.0, receivedAt: new Date('2024-01-01'), expiresAt: null },
            ],
          },
        },
        {
          variantId: 'var-1',
          categoryId: 'cat-1',
          productId: 'prod-grey',
          priority: 2,
          category: { id: 'cat-1', name: 'Rattle' },
          product: {
            id: 'prod-grey',
            name: 'Grey Rattle',
            lots: [
              { id: 'lot-grey', remaining: 10, unitCost: 1.5, receivedAt: new Date('2024-01-01'), expiresAt: null },
            ],
          },
        },
      ]);

      const result = await allocateStockForVariantRequirement('var-1', 'cat-1', 3, 'FIFO');

      expect(result.fulfilled).toBe(true);
      expect(result.allocations).toHaveLength(1);
      expect(result.allocations[0].productId).toBe('prod-blue'); // Priority 1 used first
      expect(result.allocations[0].quantity).toBe(3);
    });

    it('falls through to priority 2 when priority 1 depleted', async () => {
      mockPrisma.hamperVariantMapping.findMany.mockResolvedValue([
        {
          variantId: 'var-1',
          categoryId: 'cat-1',
          productId: 'prod-blue',
          priority: 1,
          category: { id: 'cat-1', name: 'Rattle' },
          product: {
            id: 'prod-blue',
            name: 'Blue Rattle',
            lots: [
              { id: 'lot-blue', remaining: 2, unitCost: 2.0, receivedAt: new Date('2024-01-01'), expiresAt: null },
            ],
          },
        },
        {
          variantId: 'var-1',
          categoryId: 'cat-1',
          productId: 'prod-grey',
          priority: 2,
          category: { id: 'cat-1', name: 'Rattle' },
          product: {
            id: 'prod-grey',
            name: 'Grey Rattle',
            lots: [
              { id: 'lot-grey', remaining: 10, unitCost: 1.5, receivedAt: new Date('2024-01-01'), expiresAt: null },
            ],
          },
        },
      ]);

      const result = await allocateStockForVariantRequirement('var-1', 'cat-1', 5, 'FIFO');

      expect(result.fulfilled).toBe(true);
      expect(result.allocations).toHaveLength(2);
      // First allocation from priority 1 (Blue)
      expect(result.allocations[0].productId).toBe('prod-blue');
      expect(result.allocations[0].quantity).toBe(2);
      // Second allocation from priority 2 (Grey)
      expect(result.allocations[1].productId).toBe('prod-grey');
      expect(result.allocations[1].quantity).toBe(3);
    });

    it('skips priority 1 entirely when out of stock', async () => {
      mockPrisma.hamperVariantMapping.findMany.mockResolvedValue([
        {
          variantId: 'var-1',
          categoryId: 'cat-1',
          productId: 'prod-blue',
          priority: 1,
          category: { id: 'cat-1', name: 'Rattle' },
          product: {
            id: 'prod-blue',
            name: 'Blue Rattle',
            lots: [], // No stock
          },
        },
        {
          variantId: 'var-1',
          categoryId: 'cat-1',
          productId: 'prod-grey',
          priority: 2,
          category: { id: 'cat-1', name: 'Rattle' },
          product: {
            id: 'prod-grey',
            name: 'Grey Rattle',
            lots: [
              { id: 'lot-grey', remaining: 10, unitCost: 1.5, receivedAt: new Date('2024-01-01'), expiresAt: null },
            ],
          },
        },
      ]);

      const result = await allocateStockForVariantRequirement('var-1', 'cat-1', 3, 'FIFO');

      expect(result.fulfilled).toBe(true);
      expect(result.allocations).toHaveLength(1);
      expect(result.allocations[0].productId).toBe('prod-grey'); // Fell through to priority 2
      expect(result.allocations[0].quantity).toBe(3);
    });

    it('returns unfulfilled when all alternatives exhausted', async () => {
      mockPrisma.hamperVariantMapping.findMany.mockResolvedValue([
        {
          variantId: 'var-1',
          categoryId: 'cat-1',
          productId: 'prod-blue',
          priority: 1,
          category: { id: 'cat-1', name: 'Rattle' },
          product: {
            id: 'prod-blue',
            name: 'Blue Rattle',
            lots: [
              { id: 'lot-blue', remaining: 2, unitCost: 2.0, receivedAt: new Date('2024-01-01'), expiresAt: null },
            ],
          },
        },
        {
          variantId: 'var-1',
          categoryId: 'cat-1',
          productId: 'prod-grey',
          priority: 2,
          category: { id: 'cat-1', name: 'Rattle' },
          product: {
            id: 'prod-grey',
            name: 'Grey Rattle',
            lots: [
              { id: 'lot-grey', remaining: 1, unitCost: 1.5, receivedAt: new Date('2024-01-01'), expiresAt: null },
            ],
          },
        },
      ]);

      const result = await allocateStockForVariantRequirement('var-1', 'cat-1', 5, 'FIFO');

      expect(result.fulfilled).toBe(false);
      expect(result.allocations).toHaveLength(2);
      // Partial allocation: 2 from blue + 1 from grey = 3 total (needed 5)
      expect(result.allocations.reduce((sum, a) => sum + a.quantity, 0)).toBe(3);
    });

    it('applies pick rule within each product lots', async () => {
      mockPrisma.hamperVariantMapping.findMany.mockResolvedValue([
        {
          variantId: 'var-1',
          categoryId: 'cat-1',
          productId: 'prod-blue',
          priority: 1,
          category: { id: 'cat-1', name: 'Rattle' },
          product: {
            id: 'prod-blue',
            name: 'Blue Rattle',
            lots: [
              { id: 'lot-expensive', remaining: 5, unitCost: 3.0, receivedAt: new Date('2024-01-01'), expiresAt: null },
              { id: 'lot-cheap', remaining: 5, unitCost: 1.0, receivedAt: new Date('2024-01-02'), expiresAt: null },
            ],
          },
        },
      ]);

      const result = await allocateStockForVariantRequirement('var-1', 'cat-1', 3, 'CHEAPEST');

      expect(result.fulfilled).toBe(true);
      expect(result.allocations).toHaveLength(1);
      expect(result.allocations[0].lotId).toBe('lot-cheap'); // CHEAPEST rule applied
      expect(result.totalCost).toBe(3.0); // 3 * 1.0
    });

    it('sets productId/Name when single mapping', async () => {
      mockPrisma.hamperVariantMapping.findMany.mockResolvedValue([
        {
          variantId: 'var-1',
          categoryId: 'cat-1',
          productId: 'prod-blue',
          priority: 1,
          category: { id: 'cat-1', name: 'Rattle' },
          product: {
            id: 'prod-blue',
            name: 'Blue Rattle',
            lots: [
              { id: 'lot-blue', remaining: 10, unitCost: 2.0, receivedAt: new Date('2024-01-01'), expiresAt: null },
            ],
          },
        },
      ]);

      const result = await allocateStockForVariantRequirement('var-1', 'cat-1', 3, 'FIFO');

      expect(result.productId).toBe('prod-blue');
      expect(result.productName).toBe('Blue Rattle');
    });

    it('does not set productId/Name when multiple mappings', async () => {
      mockPrisma.hamperVariantMapping.findMany.mockResolvedValue([
        {
          variantId: 'var-1',
          categoryId: 'cat-1',
          productId: 'prod-blue',
          priority: 1,
          category: { id: 'cat-1', name: 'Rattle' },
          product: {
            id: 'prod-blue',
            name: 'Blue Rattle',
            lots: [
              { id: 'lot-blue', remaining: 10, unitCost: 2.0, receivedAt: new Date('2024-01-01'), expiresAt: null },
            ],
          },
        },
        {
          variantId: 'var-1',
          categoryId: 'cat-1',
          productId: 'prod-grey',
          priority: 2,
          category: { id: 'cat-1', name: 'Rattle' },
          product: {
            id: 'prod-grey',
            name: 'Grey Rattle',
            lots: [
              { id: 'lot-grey', remaining: 10, unitCost: 1.5, receivedAt: new Date('2024-01-01'), expiresAt: null },
            ],
          },
        },
      ]);

      const result = await allocateStockForVariantRequirement('var-1', 'cat-1', 3, 'FIFO');

      expect(result.productId).toBeUndefined();
      expect(result.productName).toBeUndefined();
    });
  });
});
