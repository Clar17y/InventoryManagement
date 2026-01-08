import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../utils/test-utils';

vi.stubGlobal('confirm', vi.fn(() => true));

vi.mock('../../lib/api', () => ({
  inventory: {
    lots: vi.fn(),
    lowStock: vi.fn(),
    expiring: vi.fn(),
    updateLot: vi.fn(),
    deleteLot: vi.fn(),
  },
  products: {
    list: vi.fn(),
  },
}));

import Inventory from '../../pages/Inventory';
import { inventory, products, type Product, type InventoryLot } from '../../lib/api';

const mockLots = vi.mocked(inventory.lots);
const mockLowStock = vi.mocked(inventory.lowStock);
const mockExpiring = vi.mocked(inventory.expiring);
const mockDeleteLot = vi.mocked(inventory.deleteLot);
const mockProductsList = vi.mocked(products.list);

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

  const sampleProducts: Product[] = [
    {
      id: 'prod-1',
      name: 'Dark Chocolate',
      barcode: null,
      categoryId: 'cat-1',
      category: sampleCategories[0]!,
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
      categoryId: 'cat-2',
      category: sampleCategories[1]!,
      unit: 'units',
      lowStockThreshold: 5,
      isActive: true,
      totalStock: 3,
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

  beforeEach(() => {
    vi.clearAllMocks();
    mockProductsList.mockResolvedValue(sampleProducts);
    mockLots.mockResolvedValue(sampleLots);
    mockLowStock.mockResolvedValue([sampleProducts[1]!]);
    mockExpiring.mockResolvedValue([]);
    mockDeleteLot.mockResolvedValue(undefined);
  });

  it('renders products after loading', async () => {
    render(<Inventory />);
    expect(await screen.findByText('Dark Chocolate')).toBeInTheDocument();
  });

  it('shows Add Stock button', () => {
    render(<Inventory />);
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

  it('shows empty state when load fails', async () => {
    mockProductsList.mockRejectedValueOnce(new Error('Network error'));

    render(<Inventory />);

    expect(await screen.findByText('No products yet')).toBeInTheDocument();
  });
});
