import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../utils/test-utils';

vi.stubGlobal('confirm', vi.fn(() => true));

vi.mock('../../lib/api', () => ({
  inventory: {
    list: vi.fn(),
    lots: vi.fn(),
    lowStock: vi.fn(),
    expiring: vi.fn(),
    updateLot: vi.fn(),
    deleteLot: vi.fn(),
  },
  products: {
    list: vi.fn(),
    listAll: vi.fn(),
  },
}));

import Inventory from '../../pages/Inventory';
import { inventory, products, type InventoryProduct, type LowStockProduct, type InventoryLot } from '../../lib/api';

const mockLots = vi.mocked(inventory.lots);
const mockInventoryList = vi.mocked(inventory.list);
const mockLowStock = vi.mocked(inventory.lowStock);
const mockExpiring = vi.mocked(inventory.expiring);
const mockDeleteLot = vi.mocked(inventory.deleteLot);
const mockProductsList = vi.mocked(products.listAll);
const mockProductsPage = vi.mocked(products.list);

describe('Inventory', () => {
  const sampleCategories = [
    {
      id: 'cat-1',
      name: 'Chocolates',
      description: null,
      pickRule: 'FIFO' as const,
      isActive: true,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    },
    {
      id: 'cat-2',
      name: 'Drinks',
      description: null,
      pickRule: 'FEFO' as const,
      isActive: true,
      createdAt: '2024-01-02T00:00:00Z',
      updatedAt: '2024-01-02T00:00:00Z',
    },
  ];

  const sampleProducts: InventoryProduct[] = [
    {
      id: 'prod-1',
      name: 'Dark Chocolate',
      categoryId: 'cat-1',
      category: sampleCategories[0]!,
      unit: 'units',
      lowStockThreshold: 10,
      isActive: true,
      totalStock: 25,
      totalRemaining: 25,
      lotCount: 1,
      currentCost: 2.5,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    },
    {
      id: 'prod-2',
      name: 'Orange Juice',
      categoryId: 'cat-2',
      category: sampleCategories[1]!,
      unit: 'units',
      lowStockThreshold: 5,
      isActive: true,
      totalStock: 3,
      totalRemaining: 3,
      lotCount: 1,
      currentCost: 1.2,
      createdAt: '2024-01-02T00:00:00Z',
      updatedAt: '2024-01-02T00:00:00Z',
    },
  ];

  const sampleLots: InventoryLot[] = [
    {
      id: 'lot-1',
      productId: 'prod-1',
      quantity: 20,
      remaining: 15,
      unitCost: 2.5,
      receivedAt: '2024-01-01T00:00:00Z',
      expiresAt: '2025-06-01T00:00:00Z',
    },
  ];

  const sampleLowStock: LowStockProduct = {
    id: 'prod-2',
    name: 'Orange Juice',
    categoryId: 'cat-2',
    category: sampleCategories[1]!,
    unit: 'units',
    lowStockThreshold: 5,
    isActive: true,
    createdAt: '2024-01-02T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
    totalStock: 3,
    totalRemaining: 3,
    lotCount: 1,
  };

  beforeEach(() => {
    window.history.pushState({}, '', '/inventory');
    localStorage.clear();
    vi.clearAllMocks();
    mockInventoryList.mockResolvedValue({
      items: sampleProducts.map((product) => ({
        ...product,
        totalRemaining: product.totalStock ?? 0,
        lotCount: product.unit === 'units' ? 1 : product.lotCount ?? 0,
      })),
      pagination: { page: 1, pageSize: 25, totalItems: sampleProducts.length, totalPages: 1 },
    });
    mockLots.mockResolvedValue(sampleLots);
    mockLowStock.mockResolvedValue([sampleLowStock]);
    mockExpiring.mockResolvedValue([]);
    mockDeleteLot.mockResolvedValue(undefined);
  });

  it('renders products after loading', async () => {
    render(<Inventory />);
    expect(await screen.findByText('Dark Chocolate')).toBeInTheDocument();
    expect(mockProductsList).not.toHaveBeenCalled();
    expect(mockProductsPage).not.toHaveBeenCalled();
  });

  it('passes URL paging, search, category, low-stock, and sort state to inventory.list', async () => {
    const categoryId = `c${'1'.repeat(24)}`;
    window.history.pushState({}, '', `/inventory?page=2&pageSize=50&search=dark&categoryId=${categoryId}&filter=low-stock&sort=cost-desc`);

    render(<Inventory />);

    await waitFor(() => {
      expect(mockInventoryList).toHaveBeenCalledWith({
        page: 2,
        pageSize: 50,
        search: 'dark',
        categoryId,
        lowStockOnly: true,
        sort: 'cost-desc',
      }, { signal: expect.any(AbortSignal) });
    });
  });

  it('keeps the current rows visible while the next page is pending', async () => {
    let resolveNext!: (value: Awaited<ReturnType<typeof inventory.list>>) => void;
    mockInventoryList
      .mockResolvedValueOnce({
        items: sampleProducts.map((product) => ({
          ...product,
          totalRemaining: product.totalStock ?? 0,
          lotCount: 1,
        })),
        pagination: { page: 1, pageSize: 25, totalItems: 51, totalPages: 3 },
      })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveNext = resolve; }));
    const user = userEvent.setup();
    render(<Inventory />);
    await screen.findByText('Dark Chocolate');

    await user.click(screen.getByRole('button', { name: 'Next page' }));

    expect(screen.getByText('Dark Chocolate')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Updating results');
    await act(async () => {
      resolveNext!({
        items: [],
        pagination: { page: 2, pageSize: 25, totalItems: 51, totalPages: 3 },
      });
    });
  });

  it('groups only the products returned on the current category-sorted page', async () => {
    const currentPageProduct = {
      ...sampleProducts[0]!,
      totalRemaining: 25,
      lotCount: 1,
    };
    mockInventoryList.mockResolvedValueOnce({
      items: [currentPageProduct],
      pagination: { page: 2, pageSize: 25, totalItems: 51, totalPages: 3 },
    });
    window.history.pushState({}, '', '/inventory?page=2&sort=category');

    render(<Inventory />);

    expect(await screen.findByText('Dark Chocolate')).toBeInTheDocument();
    expect(screen.getByText('Chocolates')).toBeInTheDocument();
    expect(screen.queryByText('Orange Juice')).not.toBeInTheDocument();
    expect(screen.queryByText('Drinks')).not.toBeInTheDocument();
  });

  it('renders a product returned on a 100-row inventory page', async () => {
    const allProducts = Array.from({ length: 101 }, (_, index) => ({
      ...sampleProducts[0]!,
      id: `prod-${index + 1}`,
      name: `Chocolate ${index + 1}`,
    }));
    mockInventoryList.mockResolvedValue({
      items: allProducts,
      pagination: { page: 1, pageSize: 100, totalItems: 101, totalPages: 2 },
    } as any);

    render(<Inventory />);

    expect(await screen.findByText('Chocolate 101')).toBeInTheDocument();
  });

  it('shows Add Stock button', async () => {
    render(<Inventory />);
    await screen.findByText('Dark Chocolate');
    expect(screen.getByRole('button', { name: /add stock/i })).toBeInTheDocument();
  });

  it('shows summary counts', async () => {
    render(<Inventory />);
    await screen.findByText('Dark Chocolate');

    const productsCard = screen.getByText('Products').closest('.card') as HTMLElement | null;
    expect(productsCard).not.toBeNull();
    expect(within(productsCard!).getByText('2')).toBeInTheDocument();

    const lowStockCard = screen.getByText('Low Stock').closest('.card') as HTMLElement | null;
    expect(lowStockCard).not.toBeNull();
    expect(within(lowStockCard!).getByText('1')).toBeInTheDocument();

    const expiringCard = screen.getByText('Expiring').closest('.card') as HTMLElement | null;
    expect(expiringCard).not.toBeNull();
    expect(within(expiringCard!).getByText('0')).toBeInTheDocument();
  });

  it('loads lots when a product is expanded', async () => {
    const user = userEvent.setup();
    render(<Inventory />);

    await screen.findByText('Dark Chocolate');
    await user.click(screen.getByRole('button', { name: /dark chocolate/i }));

    await waitFor(() => {
      expect(mockLots).toHaveBeenCalledWith('prod-1');
    });

    expect(await screen.findByText('Lot Breakdown')).toBeInTheDocument();
  });

  it('calls deleteLot when delete confirmed', async () => {
    const user = userEvent.setup();
    render(<Inventory />);

    await screen.findByText('Dark Chocolate');
    await user.click(screen.getByRole('button', { name: /dark chocolate/i }));
    await screen.findByText('£2.50');

    await user.click(screen.getByRole('button', { name: 'Delete lot lot-1' }));

    await waitFor(() => {
      expect(mockDeleteLot).toHaveBeenCalledWith('lot-1');
    });
  });

  describe('low stock filter', () => {
    it('shows all products by default', async () => {
      render(<Inventory />);

      await waitFor(() => {
        expect(screen.getByText('Dark Chocolate')).toBeInTheDocument();
        expect(screen.getByText('Orange Juice')).toBeInTheDocument();
      });

      // No filter chip should be shown
      expect(screen.queryByText('Low Stock Only')).not.toBeInTheDocument();
    });

    it('shows low stock filter chip when URL param set', async () => {
      window.history.pushState({}, '', '/inventory?filter=low-stock');

      render(<Inventory />);

      await waitFor(() => {
        expect(screen.getByText('Low Stock Only')).toBeInTheDocument();
      });

      // Reset URL
      window.history.pushState({}, '', '/');
    });

    it('filters to only low stock products when filter active', async () => {
      mockInventoryList.mockResolvedValueOnce({
        items: [{ ...sampleProducts[1]!, totalRemaining: 3, lotCount: 1 }],
        pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
      });
      window.history.pushState({}, '', '/inventory?filter=low-stock');

      render(<Inventory />);

      await waitFor(() => {
        // Orange Juice: totalStock=3, lowStockThreshold=5 -> low stock (3 <= 5)
        expect(screen.getByText('Orange Juice')).toBeInTheDocument();
      });

      // Dark Chocolate: totalStock=25, lowStockThreshold=10 -> NOT low stock (25 > 10)
      expect(screen.queryByText('Dark Chocolate')).not.toBeInTheDocument();

      // Reset URL
      window.history.pushState({}, '', '/');
    });

    it('removes filter when chip X is clicked', async () => {
      const user = userEvent.setup();
      window.history.pushState({}, '', '/inventory?filter=low-stock');

      render(<Inventory />);

      await waitFor(() => {
        expect(screen.getByText('Low Stock Only')).toBeInTheDocument();
      });

      // Click the X button on the chip
      const chip = screen.getByText('Low Stock Only');
      const closeButton = chip.parentElement!.querySelector('button')!;
      await user.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByText('Low Stock Only')).not.toBeInTheDocument();
      });

      // All products should be visible again
      await waitFor(() => {
        expect(screen.getByText('Dark Chocolate')).toBeInTheDocument();
        expect(screen.getByText('Orange Juice')).toBeInTheDocument();
      });

      // Reset URL
      window.history.pushState({}, '', '/');
    });
  });

  it('shows empty state when load fails', async () => {
    mockInventoryList.mockRejectedValueOnce(new Error('Network error'));

    render(<Inventory />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Network error');
  });
});
