import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../utils/test-utils';

vi.mock('../../lib/api', () => ({
  suppliers: {
    list: vi.fn(),
    lowStock: vi.fn(),
  },
}));

import ShoppingListPage from '../../features/shopping-list/pages/ShoppingListPage';
import { suppliers } from '../../lib/api';

const mockList = vi.mocked(suppliers.list);
const mockLowStock = vi.mocked(suppliers.lowStock);

const sampleSuppliers = [
  { id: 's1', name: 'Home Bargains', isActive: true, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
  { id: 's2', name: 'Amazon', isActive: true, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
];

const sampleLowStock = [
  { id: 'p1', name: 'Ribbon', categoryName: 'Packaging', unit: 'units', totalStock: 2, lowStockThreshold: 5 },
  { id: 'p2', name: 'Gift Bags', categoryName: 'Packaging', unit: 'units', totalStock: 0, lowStockThreshold: 10 },
];

describe('ShoppingListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue(sampleSuppliers as any);
    mockLowStock.mockResolvedValue(sampleLowStock as any);
  });

  it('shows loading initially', () => {
    render(<ShoppingListPage />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders title after load', async () => {
    render(<ShoppingListPage />);

    await waitFor(() => {
      expect(screen.getByText('Shopping List')).toBeInTheDocument();
    });
  });

  it('renders supplier dropdown with all suppliers', async () => {
    render(<ShoppingListPage />);

    await waitFor(() => {
      expect(screen.getByText('Home Bargains')).toBeInTheDocument();
      expect(screen.getByText('Amazon')).toBeInTheDocument();
    });
  });

  it('shows "Select a shop..." default option', async () => {
    render(<ShoppingListPage />);

    await waitFor(() => {
      expect(screen.getByText('Select a shop...')).toBeInTheDocument();
    });
  });

  it('fetches and shows low stock items when supplier selected', async () => {
    const user = userEvent.setup();
    render(<ShoppingListPage />);

    await waitFor(() => {
      expect(screen.getByText('Select a shop...')).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByRole('combobox'), 's1');

    await waitFor(() => {
      expect(mockLowStock).toHaveBeenCalledWith('s1');
      expect(screen.getByText('Ribbon')).toBeInTheDocument();
      expect(screen.getByText('Gift Bags')).toBeInTheDocument();
    });
  });

  it('shows product name, category, stock count, and threshold for each item', async () => {
    const user = userEvent.setup();
    render(<ShoppingListPage />);

    await waitFor(() => {
      expect(screen.getByText('Select a shop...')).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByRole('combobox'), 's1');

    await waitFor(() => {
      expect(screen.getByText('Ribbon')).toBeInTheDocument();
      expect(screen.getAllByText('Packaging')).toHaveLength(2);
      expect(screen.getByText('2 units')).toBeInTheDocument();
      expect(screen.getByText('0 units')).toBeInTheDocument();
      expect(screen.getByText('threshold: 5')).toBeInTheDocument();
      expect(screen.getByText('threshold: 10')).toBeInTheDocument();
    });
  });

  it('shows count of items needing restocking', async () => {
    const user = userEvent.setup();
    render(<ShoppingListPage />);

    await waitFor(() => {
      expect(screen.getByText('Select a shop...')).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByRole('combobox'), 's1');

    await waitFor(() => {
      expect(screen.getByText('2 items need restocking')).toBeInTheDocument();
    });
  });

  it('shows empty state when no low stock items', async () => {
    mockLowStock.mockResolvedValue([]);
    const user = userEvent.setup();
    render(<ShoppingListPage />);

    await waitFor(() => {
      expect(screen.getByText('Select a shop...')).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByRole('combobox'), 's1');

    await waitFor(() => {
      expect(screen.getByText('All products from this shop are well stocked!')).toBeInTheDocument();
    });
  });

  it('shows error when API fails', async () => {
    mockList.mockRejectedValue(new Error('Failed to load suppliers'));

    render(<ShoppingListPage />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load suppliers')).toBeInTheDocument();
    });
  });
});
