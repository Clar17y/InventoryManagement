import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../utils/test-utils';
import SupplierProductsModal from '../../features/settings/components/SupplierProductsModal';

const mockProducts = [
  { id: 'p1', name: 'Vanilla Candle', category: { name: 'Candles' }, categoryId: 'c1' },
  { id: 'p2', name: 'Rose Candle', category: { name: 'Candles' }, categoryId: 'c1' },
  { id: 'p3', name: 'Hand Cream', category: { name: 'Skincare' }, categoryId: 'c2' },
];

const productListResponse = () => ({
  items: mockProducts,
  pagination: { page: 1, pageSize: 25 as const, totalItems: mockProducts.length, totalPages: 1 },
});

const mockListProducts = vi.fn().mockResolvedValue(productListResponse());
const mockListAllProducts = vi.fn().mockResolvedValue(productListResponse());
const mockGetSupplierProducts = vi.fn().mockResolvedValue(['p1']);
const mockSetSupplierProducts = vi.fn().mockResolvedValue(['p1', 'p3']);

vi.mock('../../lib/api', () => ({
  products: {
    list: (...args: unknown[]) => mockListProducts(...args),
    listAll: (...args: unknown[]) => mockListAllProducts(...args),
  },
  suppliers: {
    getSupplierProducts: (...args: unknown[]) => mockGetSupplierProducts(...args),
    setSupplierProducts: (...args: unknown[]) => mockSetSupplierProducts(...args),
  },
}));

const supplier = {
  id: 's1',
  name: 'Home Bargains',
  isActive: true,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
} as any;

const onClose = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockListProducts.mockImplementation(async (params: any) => {
    const query = params?.search?.toLowerCase();
    const items = query
      ? mockProducts.filter((product) => product.name.toLowerCase().includes(query))
      : mockProducts;
    return {
      items,
      pagination: { page: params?.page ?? 1, pageSize: 25 as const, totalItems: items.length, totalPages: 1 },
    };
  });
  mockListAllProducts.mockResolvedValue(productListResponse());
  mockGetSupplierProducts.mockResolvedValue(['p1']);
  mockSetSupplierProducts.mockResolvedValue(['p1', 'p3']);
});

describe('SupplierProductsModal', () => {
  it('shows supplier name in header', async () => {
    render(<SupplierProductsModal supplier={supplier} onClose={onClose} />);

    expect(screen.getByText('Home Bargains')).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    render(<SupplierProductsModal supplier={supplier} onClose={onClose} />);

    expect(screen.getByText('Loading products...')).toBeInTheDocument();
  });

  it('loads and displays products grouped by category', async () => {
    render(<SupplierProductsModal supplier={supplier} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('Candles')).toBeInTheDocument();
      expect(screen.getByText('Skincare')).toBeInTheDocument();
    });

    expect(screen.getByText('Vanilla Candle')).toBeInTheDocument();
    expect(screen.getByText('Rose Candle')).toBeInTheDocument();
    expect(screen.getByText('Hand Cream')).toBeInTheDocument();
  });

  it('retains selected IDs across pages and saves their union', async () => {
    mockListProducts.mockImplementation(async (params: any) => ({
      items: params?.page === 2 ? [mockProducts[2]] : mockProducts.slice(0, 2),
      pagination: { page: params?.page ?? 1, pageSize: 25, totalItems: 3, totalPages: 2 },
    }));
    const user = userEvent.setup();

    render(<SupplierProductsModal supplier={supplier} onClose={onClose} />);

    await user.click(await screen.findByText('Rose Candle'));
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    await user.click(await screen.findByText('Hand Cream'));
    await user.click(screen.getByText('Save'));

    await waitFor(() => expect(mockSetSupplierProducts).toHaveBeenCalledWith(
      's1',
      expect.arrayContaining(['p1', 'p2', 'p3']),
    ));
    expect(mockSetSupplierProducts.mock.calls[0]?.[1]).toHaveLength(3);
    expect(mockListAllProducts).not.toHaveBeenCalled();
  });

  it('sends search to the paginated product endpoint', async () => {
    const user = userEvent.setup();
    mockListProducts.mockResolvedValue({
      items: [mockProducts[2]],
      pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
    });

    render(<SupplierProductsModal supplier={supplier} onClose={onClose} />);
    await user.type(screen.getByPlaceholderText('Search products...'), 'Hand');

    await waitFor(() => expect(mockListProducts).toHaveBeenLastCalledWith(
      { categoryId: undefined, page: 1, pageSize: 25, search: 'Hand' },
      { signal: expect.any(AbortSignal) },
    ));
  });

  it('pre-selects products already linked to supplier', async () => {
    render(<SupplierProductsModal supplier={supplier} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('Vanilla Candle')).toBeInTheDocument();
    });

    // Shows "1 product selected" since p1 is pre-selected
    expect(screen.getByText('1 product selected')).toBeInTheDocument();
  });

  it('shows selected count in header', async () => {
    mockGetSupplierProducts.mockResolvedValue(['p1', 'p2']);

    render(<SupplierProductsModal supplier={supplier} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('2 products selected')).toBeInTheDocument();
    });
  });

  it('toggles product selection on click', async () => {
    const user = userEvent.setup();
    render(<SupplierProductsModal supplier={supplier} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('Hand Cream')).toBeInTheDocument();
    });

    // Click Hand Cream checkbox to select it
    await user.click(screen.getByText('Hand Cream'));

    expect(screen.getByText('2 products selected')).toBeInTheDocument();
  });

  it('Save button is disabled when no changes made', async () => {
    render(<SupplierProductsModal supplier={supplier} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('Vanilla Candle')).toBeInTheDocument();
    });

    expect(screen.getByText('Save')).toBeDisabled();
  });

  it('Save button is enabled when changes are made', async () => {
    const user = userEvent.setup();
    render(<SupplierProductsModal supplier={supplier} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('Hand Cream')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Hand Cream'));

    expect(screen.getByText('Save')).toBeEnabled();
  });

  it('calls setSupplierProducts and onClose on save', async () => {
    const user = userEvent.setup();
    render(<SupplierProductsModal supplier={supplier} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('Hand Cream')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Hand Cream'));
    await user.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(mockSetSupplierProducts).toHaveBeenCalledWith('s1', expect.arrayContaining(['p1', 'p3']));
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup();
    render(<SupplierProductsModal supplier={supplier} onClose={onClose} />);

    await user.click(screen.getByText('Cancel'));

    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when X button is clicked', async () => {
    const user = userEvent.setup();
    render(<SupplierProductsModal supplier={supplier} onClose={onClose} />);

    // The X button has an XMarkIcon - click the button in the header
    const closeButtons = screen.getAllByRole('button');
    // First button is the X close button in header
    await user.click(closeButtons[0]!);

    expect(onClose).toHaveBeenCalled();
  });

  it('filters products by search query', async () => {
    const user = userEvent.setup();
    render(<SupplierProductsModal supplier={supplier} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('Vanilla Candle')).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText('Search products...'), 'Hand');

    await waitFor(() => {
      expect(screen.queryByText('Vanilla Candle')).not.toBeInTheDocument();
      expect(screen.getByText('Hand Cream')).toBeInTheDocument();
    });
  });

  it('shows inline error when save fails', async () => {
    mockSetSupplierProducts.mockRejectedValueOnce(new Error('Network error'));
    const user = userEvent.setup();
    render(<SupplierProductsModal supplier={supplier} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('Hand Cream')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Hand Cream'));
    await user.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(screen.getByText('Failed to save. Please try again.')).toBeInTheDocument();
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows "No products match your search" for empty search results', async () => {
    const user = userEvent.setup();
    render(<SupplierProductsModal supplier={supplier} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('Vanilla Candle')).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText('Search products...'), 'xyznonexistent');

    await waitFor(() => {
      expect(screen.getByText('No products match your search')).toBeInTheDocument();
    });
  });
});
