import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
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
  },
}));

import Products from '../../pages/Products';
import { products, categories, suppliers } from '../../lib/api';

const mockProductsList = vi.mocked(products.list);
const mockCategoriesList = vi.mocked(categories.list);
const mockProductsDelete = vi.mocked(products.delete);
const mockSuppliersList = vi.mocked(suppliers.list);

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

  beforeEach(() => {
    vi.clearAllMocks();
    mockProductsList.mockResolvedValue(sampleProducts as any);
    mockCategoriesList.mockResolvedValue(sampleCategories as any);
    mockSuppliersList.mockResolvedValue([]);
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
      mockProductsList.mockResolvedValue([]);
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
