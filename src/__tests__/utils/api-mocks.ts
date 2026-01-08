import { vi } from 'vitest';
import type { Category } from '../../lib/api/categories';
import type { Product } from '../../lib/api/products';
import type { InventoryLot, CategoryLot } from '../../lib/api/inventory';
import type { Hamper, HamperDetail } from '../../lib/api/hampers';

type InventoryCategorySummary = { id: string; name: string; productCount: number; totalStock: number };

// Mock request function
export const mockRequest = vi.fn();

// Category mocks
export const mockCategories = {
  list: vi.fn<() => Promise<Category[]>>(),
  get: vi.fn<(id: string) => Promise<Category>>(),
  create: vi.fn<(data: { name: string; description?: string; pickRule?: string }) => Promise<Category>>(),
  update: vi.fn<(id: string, data: Partial<{ name: string; description: string; pickRule: string }>) => Promise<Category>>(),
  delete: vi.fn<(id: string) => Promise<void>>(),
};

// Product mocks
export const mockProducts = {
  list: vi.fn<(categoryId?: string) => Promise<Product[]>>(),
  get: vi.fn<(id: string) => Promise<Product>>(),
  getByBarcode: vi.fn<(barcode: string) => Promise<Product | null>>(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn<(id: string) => Promise<void>>(),
  addBarcode: vi.fn(),
  removeBarcode: vi.fn(),
};

// Inventory mocks
export const mockInventory = {
  byCategory: vi.fn<() => Promise<InventoryCategorySummary[]>>(),
  lots: vi.fn<(productId: string) => Promise<InventoryLot[]>>(),
  lotsByCategory: vi.fn<(categoryId: string) => Promise<CategoryLot[]>>(),
  addLot: vi.fn(),
  updateLot: vi.fn(),
  deleteLot: vi.fn<(id: string) => Promise<void>>(),
  lowStock: vi.fn<() => Promise<Product[]>>(),
  expiring: vi.fn<(days?: number) => Promise<InventoryLot[]>>(),
};

// Hamper mocks
export const mockHampers = {
  list: vi.fn<() => Promise<Hamper[]>>(),
  get: vi.fn<(id: string) => Promise<HamperDetail>>(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn<(id: string) => Promise<void>>(),
};

// Sales mocks
export const mockSales = {
  list: vi.fn(),
  get: vi.fn(),
  preview: vi.fn(),
  create: vi.fn(),
  summary: vi.fn(),
  analytics: vi.fn(),
};

// Expenses mocks
export const mockExpenses = {
  list: vi.fn(),
  get: vi.fn(),
  summary: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

// Settings mocks
export const mockSettings = {
  dashboardStats: vi.fn(),
  getEtsyFees: vi.fn(),
  createEtsyFees: vi.fn(),
  getPackagingOverhead: vi.fn(),
  createPackagingOverhead: vi.fn(),
  updatePackagingOverhead: vi.fn(),
  deletePackagingOverhead: vi.fn(),
};

// Etsy mocks
export const mockEtsy = {
  getStatus: vi.fn(),
  initiateAuth: vi.fn(),
  disconnect: vi.fn(),
  getListings: vi.fn(),
  importListings: vi.fn(),
  getComparison: vi.fn(),
  pushUpdates: vi.fn(),
  getPendingOrders: vi.fn(),
  importOrder: vi.fn(),
};

// Reset all mocks
export const resetAllMocks = () => {
  Object.values(mockCategories).forEach((fn) => fn.mockReset());
  Object.values(mockProducts).forEach((fn) => fn.mockReset());
  Object.values(mockInventory).forEach((fn) => fn.mockReset());
  Object.values(mockHampers).forEach((fn) => fn.mockReset());
  Object.values(mockSales).forEach((fn) => fn.mockReset());
  Object.values(mockExpenses).forEach((fn) => fn.mockReset());
  Object.values(mockSettings).forEach((fn) => fn.mockReset());
  Object.values(mockEtsy).forEach((fn) => fn.mockReset());
};
