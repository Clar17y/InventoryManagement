import { vi } from 'vitest';
import type { Category } from '../../lib/api/categories';
import type { Product, ProductsListQuery, ProductsListResponse } from '../../lib/api/products';
import type {
  InventoryLot,
  CategoryLot,
  LowStockProduct,
  InventoryProductsQuery,
  InventoryProductsResponse,
} from '../../lib/api/inventory';
import type { Hamper, HamperDetail } from '../../lib/api/hampers';
import type {
  BusinessExpense,
  ExpenseListQuery,
  ExpenseListResponse,
} from '../../lib/api/expenses';
import type { HampersListQuery, HampersListResponse } from '#contracts/routes/hampers';
import type { Sale } from '../../lib/api/sales';
import type { SalesListQuery, SalesListResponse } from '#contracts/routes/sales';
import type { PaginatedResponse } from '#contracts/http/pagination';

type InventoryCategorySummary = { id: string; name: string; productCount: number; totalStock: number };

const emptyPaginatedResponse = <T>(): PaginatedResponse<T> => ({
  items: [],
  pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 },
});

export const emptyProductsListResponse: ProductsListResponse = emptyPaginatedResponse<Product>();
export const emptyInventoryProductsResponse: InventoryProductsResponse = emptyPaginatedResponse<InventoryProductsResponse['items'][number]>();
export const emptyHampersListResponse: HampersListResponse = emptyPaginatedResponse<Hamper>();
export const emptySalesListResponse: SalesListResponse = emptyPaginatedResponse<Sale>();
export const emptyExpensesListResponse: ExpenseListResponse = emptyPaginatedResponse<BusinessExpense>();

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
  list: vi.fn<(
    params?: ProductsListQuery,
    options?: Pick<RequestInit, 'signal'>,
  ) => Promise<ProductsListResponse>>().mockResolvedValue(emptyProductsListResponse),
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
  list: vi.fn<(
    params?: InventoryProductsQuery,
    options?: Pick<RequestInit, 'signal'>,
  ) => Promise<InventoryProductsResponse>>().mockResolvedValue(emptyInventoryProductsResponse),
  byCategory: vi.fn<() => Promise<InventoryCategorySummary[]>>(),
  lots: vi.fn<(productId: string) => Promise<InventoryLot[]>>(),
  lotsByCategory: vi.fn<(categoryId: string) => Promise<CategoryLot[]>>(),
  addLot: vi.fn(),
  updateLot: vi.fn(),
  deleteLot: vi.fn<(id: string) => Promise<void>>(),
  lowStock: vi.fn<() => Promise<LowStockProduct[]>>(),
  expiring: vi.fn<(days?: number) => Promise<InventoryLot[]>>(),
};

// Hamper mocks
export const mockHampers = {
  list: vi.fn<(
    params?: HampersListQuery,
    options?: Pick<RequestInit, 'signal'>,
  ) => Promise<HampersListResponse>>().mockResolvedValue(emptyHampersListResponse),
  get: vi.fn<(id: string) => Promise<HamperDetail>>(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn<(id: string) => Promise<void>>(),
};

// Sales mocks
export const mockSales = {
  list: vi.fn<(
    params?: SalesListQuery,
    options?: Pick<RequestInit, 'signal'>,
  ) => Promise<SalesListResponse>>().mockResolvedValue(emptySalesListResponse),
  get: vi.fn(),
  preview: vi.fn(),
  create: vi.fn(),
  summary: vi.fn(),
  analytics: vi.fn(),
};

// Expenses mocks
export const mockExpenses = {
  list: vi.fn<(
    params?: ExpenseListQuery,
    options?: Pick<RequestInit, 'signal'>,
  ) => Promise<ExpenseListResponse>>().mockResolvedValue(emptyExpensesListResponse),
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
  mockProducts.list.mockResolvedValue(emptyProductsListResponse);
  Object.values(mockInventory).forEach((fn) => fn.mockReset());
  mockInventory.list.mockResolvedValue(emptyInventoryProductsResponse);
  Object.values(mockHampers).forEach((fn) => fn.mockReset());
  mockHampers.list.mockResolvedValue(emptyHampersListResponse);
  Object.values(mockSales).forEach((fn) => fn.mockReset());
  mockSales.list.mockResolvedValue(emptySalesListResponse);
  Object.values(mockExpenses).forEach((fn) => fn.mockReset());
  mockExpenses.list.mockResolvedValue(emptyExpensesListResponse);
  Object.values(mockSettings).forEach((fn) => fn.mockReset());
  Object.values(mockEtsy).forEach((fn) => fn.mockReset());
};
