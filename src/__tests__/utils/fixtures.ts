import type { DashboardStats } from '../../lib/api/settings';
import type { Category } from '../../lib/api/categories';
import type { Product } from '../../lib/api/products';
import type { InventoryLot, LowStockProduct } from '../../lib/api/inventory';
import type { Hamper } from '../../lib/api/hampers';

export const categoryFixtures: Category[] = [
  {
    id: 'cat-1',
    name: 'Chocolates',
    description: 'Chocolate items',
    pickRule: 'FIFO',
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    _count: { products: 5 },
  },
  {
    id: 'cat-2',
    name: 'Drinks',
    description: 'Beverages',
    pickRule: 'FEFO',
    isActive: true,
    createdAt: '2024-01-02T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
    _count: { products: 3 },
  },
  {
    id: 'cat-3',
    name: 'Snacks',
    description: null,
    pickRule: 'CHEAPEST',
    isActive: true,
    createdAt: '2024-01-03T00:00:00Z',
    updatedAt: '2024-01-03T00:00:00Z',
    _count: { products: 0 },
  },
];

export const productFixtures: Product[] = [
  {
    id: 'prod-1',
    name: 'Dark Chocolate Bar',
    barcode: '1234567890123',
    barcodes: [{ id: 'bar-1', barcode: '1234567890123' }],
    categoryId: 'cat-1',
    category: categoryFixtures[0]!,
    unit: 'units',
    lowStockThreshold: 10,
    isActive: true,
    totalStock: 25,
    currentCost: 2.5,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'prod-2',
    name: 'Orange Juice',
    barcode: null,
    barcodes: [],
    categoryId: 'cat-2',
    category: categoryFixtures[1]!,
    unit: 'units',
    lowStockThreshold: 5,
    isActive: true,
    totalStock: 3,
    currentCost: 1.2,
    createdAt: '2024-01-02T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
  },
];

export const lotFixtures: InventoryLot[] = [
  {
    id: 'lot-1',
    productId: 'prod-1',
    product: productFixtures[0]!,
    quantity: 20,
    remaining: 15,
    unitCost: 2.5,
    receivedAt: '2024-01-01T00:00:00Z',
    expiresAt: '2025-06-01T00:00:00Z',
  },
  {
    id: 'lot-2',
    productId: 'prod-1',
    product: productFixtures[0]!,
    quantity: 10,
    remaining: 10,
    unitCost: 2.75,
    receivedAt: '2024-01-15T00:00:00Z',
    expiresAt: null,
  },
  {
    id: 'lot-3',
    productId: 'prod-2',
    product: productFixtures[1]!,
    quantity: 5,
    remaining: 3,
    unitCost: 1.2,
    receivedAt: '2024-01-10T00:00:00Z',
    expiresAt: '2024-02-01T00:00:00Z',
  },
];

export const hamperFixtures: Hamper[] = [
  {
    id: 'ham-1',
    name: 'Chocolate Lovers',
    sellingPrice: 35,
    etsyListingId: '12345',
    hasVariants: false,
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    canMake: 5,
    requirements: [
      {
        id: 'req-1',
        categoryId: 'cat-1',
        category: { id: 'cat-1', name: 'Chocolates' },
        quantity: 3,
        isOptional: false,
      },
    ],
  },
  {
    id: 'ham-2',
    name: 'Refreshment Pack',
    sellingPrice: 25,
    etsyListingId: null,
    hasVariants: false,
    isActive: true,
    createdAt: '2024-01-02T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
    canMake: 0,
    requirements: [
      {
        id: 'req-2',
        categoryId: 'cat-2',
        category: { id: 'cat-2', name: 'Drinks' },
        quantity: 2,
        isOptional: false,
      },
      {
        id: 'req-3',
        categoryId: 'cat-3',
        category: { id: 'cat-3', name: 'Snacks' },
        quantity: 1,
        isOptional: false,
      },
    ],
  },
];

export const dashboardStatsFixture: DashboardStats = {
  products: 15,
  categories: 3,
  hampers: 8,
  lowStockProducts: 1,
  today: { salesCount: 3, revenue: 105, margin: 52 },
  thisWeek: { salesCount: 15, revenue: 525, margin: 260 },
};

export const lowStockFixture: LowStockProduct[] = [
  {
    id: 'prod-2',
    name: 'Orange Juice',
    categoryId: 'cat-2',
    category: categoryFixtures[1]!,
    unit: 'units',
    lowStockThreshold: 5,
    isActive: true,
    createdAt: '2024-01-02T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
    totalStock: 3,
    totalRemaining: 3,
    lotCount: 1,
  },
];
export const expiringLotsFixture: InventoryLot[] = [lotFixtures[2]!];
