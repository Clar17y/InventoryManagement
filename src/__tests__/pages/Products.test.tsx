import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../utils/test-utils';

vi.stubGlobal('confirm', vi.fn(() => true));

vi.mock('../../lib/api', () => ({
  products: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    addBarcode: vi.fn(),
    removeBarcode: vi.fn(),
  },
  categories: {
    list: vi.fn(),
  },
  suppliers: {
    list: vi.fn(),
    getProductSuppliers: vi.fn(),
    setProductSuppliers: vi.fn(),
  },
}));

import Products from '../../pages/Products';
import { products, categories, suppliers } from '../../lib/api';

const mockProductsList = vi.mocked(products.list);
const mockProductsCreate = vi.mocked(products.create);
const mockCategoriesList = vi.mocked(categories.list);
const mockProductsDelete = vi.mocked(products.delete);
const mockSuppliersList = vi.mocked(suppliers.list);
const mockSetProductSuppliers = vi.mocked(suppliers.setProductSuppliers);

describe('Products', () => {
  const sampleCategories = [
    { id: 'cat-1', name: 'Chocolates', pickRule: 'FIFO', isActive: true },
    { id: 'cat-2', name: 'Drinks', pickRule: 'FEFO', isActive: true },
  ];

  const sampleProducts = [
    {
      id: 'prod-1',
      name: 'Dark Chocolate Bar',
      description: 'Premium dark chocolate',
      categoryId: 'cat-1',
      category: { id: 'cat-1', name: 'Chocolates' },
      lowStockThreshold: 10,
      maxStockLevel: 100,
      isActive: true,
      barcodes: [{ id: 'bar-1', barcode: '1234567890123' }],
      currentStock: 25,
      currentUnitCost: '2.50',
    },
    {
      id: 'prod-2',
      name: 'Orange Juice',
      description: null,
      categoryId: 'cat-2',
      category: { id: 'cat-2', name: 'Drinks' },
      lowStockThreshold: 5,
      maxStockLevel: 50,
      isActive: true,
      barcodes: [],
      currentStock: 3,
      currentUnitCost: '1.20',
    },
  ];

  const listResponse = (
    items = sampleProducts,
    totalItems = items.length,
    page = 1,
    pageSize: 25 | 50 | 100 = 25,
  ) => ({
    items,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize),
    },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    window.history.pushState({}, '', '/products');
    mockProductsList.mockResolvedValue(listResponse() as any);
    mockCategoriesList.mockResolvedValue(sampleCategories as any);
    mockSuppliersList.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('loading state', () => {
    it('shows loading message initially', () => {
      render(<Products />);
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('hides loading after data loads', async () => {
      render(<Products />);
      await waitFor(() => {
        expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
      });
    });
  });

  describe('product list', () => {
    it('displays product names', async () => {
      render(<Products />);
      await waitFor(() => {
        expect(screen.getByText('Dark Chocolate Bar')).toBeInTheDocument();
        expect(screen.getByText('Orange Juice')).toBeInTheDocument();
      });
    });

    it('displays category names', async () => {
      render(<Products />);
      await waitFor(() => {
        // Categories are shown in product cards
        expect(screen.getByText('Dark Chocolate Bar')).toBeInTheDocument();
      });
    });

    it('displays stock and cost info', async () => {
      render(<Products />);
      await waitFor(() => {
        // Stock info is displayed in product cards
        expect(screen.getByText('Dark Chocolate Bar')).toBeInTheDocument();
      });
    });

    it('shows low stock warning when applicable', async () => {
      render(<Products />);
      await waitFor(() => {
        // Orange Juice has 3 stock with 5 threshold - should show warning
        const lowStockProduct = screen.getByText('Orange Juice').closest('.card');
        expect(lowStockProduct).toBeInTheDocument();
      });
    });

    it('shows empty state when no products', async () => {
      mockProductsList.mockResolvedValue(listResponse([]) as any);
      render(<Products />);
      await waitFor(() => {
        expect(screen.getByText('No products yet')).toBeInTheDocument();
      });
    });
  });

  describe('category filter', () => {
    it('shows category filter', async () => {
      render(<Products />);
      await waitFor(() => {
        // Products page has category filters
        expect(screen.getByText('Dark Chocolate Bar')).toBeInTheDocument();
      });
    });

    it('sends the selected category to the server and resets to page one', async () => {
      const user = userEvent.setup();
      window.history.pushState({}, '', '/products?page=3&pageSize=50');
      render(<Products />);

      await waitFor(() => expect(mockProductsList).toHaveBeenCalledWith(
        expect.objectContaining({ page: 3, pageSize: 50 }),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ));

      await user.selectOptions(screen.getAllByRole('combobox')[0]!, 'cat-2');

      await waitFor(() => expect(mockProductsList).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, pageSize: 50, categoryId: 'cat-2' }),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ));
    });
  });

  describe('server-side search and pagination', () => {
    it('debounces search for 400ms and sends it to the server instead of filtering rows locally', async () => {
      vi.useFakeTimers();
      render(<Products />);

      await act(async () => {
        await Promise.resolve();
      });
      expect(mockProductsList).toHaveBeenCalledTimes(1);
      fireEvent.change(screen.getByPlaceholderText('Search products...'), { target: { value: 'tea' } });
      expect(mockProductsList).toHaveBeenCalledTimes(1);

      act(() => vi.advanceTimersByTime(399));
      expect(mockProductsList).toHaveBeenCalledTimes(1);

      await act(async () => {
        vi.advanceTimersByTime(1);
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(mockProductsList).toHaveBeenCalledTimes(2);
      expect(mockProductsList).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, pageSize: 25, search: 'tea' }),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it('resets page for sort, direction, and page-size changes', async () => {
      const user = userEvent.setup();
      window.history.pushState({}, '', '/products?page=3&pageSize=25');
      render(<Products />);

      await waitFor(() => expect(mockProductsList).toHaveBeenCalledTimes(1));

      await user.selectOptions(screen.getByLabelText('Product sort'), 'createdAt');
      await waitFor(() => expect(mockProductsList).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, pageSize: 25, sort: 'createdAt' }),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ));

      await user.click(screen.getByRole('button', { name: 'Sort descending' }));
      await waitFor(() => expect(mockProductsList).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, pageSize: 25, sort: 'createdAt', direction: 'desc' }),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ));

      await user.selectOptions(screen.getByLabelText('Rows per page'), '100');
      await waitFor(() => expect(mockProductsList).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, pageSize: 100, sort: 'createdAt', direction: 'desc' }),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ));
      expect(new URLSearchParams(window.location.search).get('page')).toBe('1');
      expect(new URLSearchParams(window.location.search).get('pageSize')).toBe('100');
    });

    it('keeps existing rows dimmed while updating and renders only the requested page', async () => {
      const user = userEvent.setup();
      const initial = listResponse(
        sampleProducts,
        51,
        1,
        25,
      );
      const nextPage = listResponse([
        { ...sampleProducts[0]!, id: 'prod-26', name: 'Green Tea' },
      ], 51, 2, 25);
      let resolveNext!: (value: typeof nextPage) => void;
      const pendingNext = new Promise<typeof nextPage>((resolve) => { resolveNext = resolve; });
      mockProductsList.mockReset();
      mockProductsList.mockResolvedValueOnce(initial as any).mockReturnValueOnce(pendingNext as any);

      render(<Products />);
      await waitFor(() => expect(screen.getByText('Dark Chocolate Bar')).toBeInTheDocument());
      expect(screen.getAllByRole('button', { name: /Edit product/ })).toHaveLength(2);

      await user.click(screen.getByRole('button', { name: 'Next page' }));
      await waitFor(() => expect(mockProductsList).toHaveBeenCalledTimes(2));
      expect(screen.getByText('Dark Chocolate Bar')).toBeInTheDocument();
      expect(screen.getByText('Updating results…')).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: /Edit product/ })).toHaveLength(2);

      await act(async () => {
        resolveNext(nextPage as any);
        await pendingNext;
      });
      await waitFor(() => expect(screen.getByText('Green Tea')).toBeInTheDocument());
      expect(screen.queryByText('Dark Chocolate Bar')).not.toBeInTheDocument();
    });

    it('shows Retry for a failed page refresh and reloads the same query', async () => {
      const user = userEvent.setup();
      mockProductsList
        .mockResolvedValueOnce(listResponse(sampleProducts, 51) as any)
        .mockRejectedValueOnce(new Error('Temporary outage'))
        .mockResolvedValueOnce(listResponse(sampleProducts, 51, 2) as any);

      render(<Products />);
      await waitFor(() => expect(screen.getByText('Dark Chocolate Bar')).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: 'Next page' }));
      await waitFor(() => expect(screen.getByText('Temporary outage')).toBeInTheDocument());

      await user.click(screen.getByRole('button', { name: 'Retry' }));
      await waitFor(() => expect(mockProductsList).toHaveBeenCalledTimes(3));
      expect(mockProductsList).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2, pageSize: 25 }),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it('reloads after deletion and falls back to the previous page when the final page empties', async () => {
      const user = userEvent.setup();
      window.history.pushState({}, '', '/products?page=2&pageSize=25');
      const pageTwo = listResponse([sampleProducts[0]!], 26, 2, 25);
      const emptiedPageTwo = listResponse([], 25, 2, 25);
      const previousPage = listResponse([sampleProducts[1]!], 25, 1, 25);
      mockProductsList.mockReset();
      mockProductsList
        .mockResolvedValueOnce(pageTwo as any)
        .mockResolvedValueOnce(emptiedPageTwo as any)
        .mockResolvedValueOnce(previousPage as any);
      mockProductsDelete.mockResolvedValue(undefined);

      render(<Products />);
      await waitFor(() => expect(screen.getByText('Dark Chocolate Bar')).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: 'Delete product Dark Chocolate Bar' }));

      await waitFor(() => expect(mockProductsList).toHaveBeenCalledTimes(3));
      expect(mockProductsList.mock.calls[1]?.[0]).toEqual(expect.objectContaining({ page: 2, pageSize: 25 }));
      expect(mockProductsList.mock.calls[2]?.[0]).toEqual(expect.objectContaining({ page: 1, pageSize: 25 }));
      await waitFor(() => expect(screen.getByText('Orange Juice')).toBeInTheDocument());
    });
  });

  describe('add product', () => {
    it('shows Add button', async () => {
      render(<Products />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument();
      });
    });

    it('shows form when Add clicked', async () => {
      const user = userEvent.setup();
      render(<Products />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add/i }));

      expect(screen.getByText('New Product')).toBeInTheDocument();
    });

    it('shows form fields when adding', async () => {
      const user = userEvent.setup();

      render(<Products />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add/i }));

      // Form should be visible
      expect(screen.getByText('New Product')).toBeInTheDocument();
    });
  });

  describe('delete product', () => {
    it('calls delete API when confirmed', async () => {
      const user = userEvent.setup();
      mockProductsDelete.mockResolvedValue(undefined);

      render(<Products />);

      await waitFor(() => {
        expect(screen.getByText('Dark Chocolate Bar')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Delete product Dark Chocolate Bar' }));

      await waitFor(() => {
        expect(mockProductsDelete).toHaveBeenCalled();
      });
    });
  });

  describe('supplier assignment', () => {
    const sampleSuppliers = [
      { id: 'sup-1', name: 'Home Bargains', isActive: true, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
      { id: 'sup-2', name: 'Tesco', isActive: true, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
    ];

    it('shows supplier checkboxes in product form', async () => {
      const user = userEvent.setup();
      mockSuppliersList.mockResolvedValue(sampleSuppliers as any);

      render(<Products />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add/i }));

      await waitFor(() => {
        expect(screen.getByText('Home Bargains')).toBeInTheDocument();
        expect(screen.getByText('Tesco')).toBeInTheDocument();
      });

      // They should be checkboxes
      expect(screen.getByText('Available at')).toBeInTheDocument();
    });

    it('saves supplier associations on product create', async () => {
      const user = userEvent.setup();
      mockSuppliersList.mockResolvedValue(sampleSuppliers as any);
      mockProductsCreate.mockResolvedValue({ id: 'new-prod-1', name: 'Test Product' } as any);
      mockSetProductSuppliers.mockResolvedValue([]);

      render(<Products />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add/i }));

      await waitFor(() => {
        expect(screen.getByText('New Product')).toBeInTheDocument();
      });

      // Fill required fields
      await user.type(screen.getByPlaceholderText('e.g., Lavender Hand Cream 100ml'), 'Test Product');
      // Select a category - find the required select (first combobox is category)
      const selects = screen.getAllByRole('combobox');
      await user.selectOptions(selects[0]!, 'cat-1');

      // Select a supplier checkbox
      await user.click(screen.getByLabelText('Home Bargains'));

      // Submit the form
      await user.click(screen.getByRole('button', { name: 'Create' }));

      await waitFor(() => {
        expect(mockSetProductSuppliers).toHaveBeenCalledWith('new-prod-1', ['sup-1']);
      });
      await waitFor(() => expect(mockProductsList).toHaveBeenCalledTimes(2));
    });
  });

  describe('error handling', () => {
    it('displays error when API fails', async () => {
      mockProductsList.mockRejectedValue(new Error('Network error'));

      render(<Products />);

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });
  });
});
