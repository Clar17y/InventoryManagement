import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../utils/test-utils';

// Mock confirm dialog
vi.stubGlobal('confirm', vi.fn(() => true));

// Mock API
vi.mock('../../lib/api', () => ({
  categories: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  products: {
    list: vi.fn(),
    listAll: vi.fn(),
  },
}));

import Categories from '../../pages/Categories';
import { categories, products } from '../../lib/api';

const mockList = vi.mocked(categories.list);
const mockCreate = vi.mocked(categories.create);
const mockDelete = vi.mocked(categories.delete);
const mockProductsList = vi.mocked(products.listAll);

describe('Categories', () => {
  const sampleCategories = [
    {
      id: 'cat-1',
      name: 'Chocolates',
      description: 'Chocolate items',
      pickRule: 'FIFO' as const,
      isActive: true,
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
      _count: { products: 5 },
    },
    {
      id: 'cat-2',
      name: 'Drinks',
      description: null,
      pickRule: 'FEFO' as const,
      isActive: true,
      createdAt: '2024-01-02',
      updatedAt: '2024-01-02',
      _count: { products: 3 },
    },
  ];

  const sampleProducts = [
    { id: 'prod-1', name: 'Chocolate 1', categoryId: 'cat-1', unit: 'pcs', totalStock: 0 },
    { id: 'prod-2', name: 'Chocolate 2', categoryId: 'cat-1', unit: 'pcs', totalStock: 0 },
    { id: 'prod-3', name: 'Chocolate 3', categoryId: 'cat-1', unit: 'pcs', totalStock: 0 },
    { id: 'prod-4', name: 'Chocolate 4', categoryId: 'cat-1', unit: 'pcs', totalStock: 0 },
    { id: 'prod-5', name: 'Chocolate 5', categoryId: 'cat-1', unit: 'pcs', totalStock: 0 },
    { id: 'prod-6', name: 'Drink 1', categoryId: 'cat-2', unit: 'pcs', totalStock: 0 },
    { id: 'prod-7', name: 'Drink 2', categoryId: 'cat-2', unit: 'pcs', totalStock: 0 },
    { id: 'prod-8', name: 'Drink 3', categoryId: 'cat-2', unit: 'pcs', totalStock: 0 },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue(sampleCategories);
    mockProductsList.mockResolvedValue({
      items: sampleProducts,
      pagination: { page: 1, pageSize: 25, totalItems: sampleProducts.length, totalPages: 1 },
    } as any);
  });

  describe('loading state', () => {
    it('shows loading message initially', () => {
      render(<Categories />);

      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('hides loading after data loads', async () => {
      render(<Categories />);

      await waitFor(() => {
        expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
      });
    });
  });

  describe('category list', () => {
    it('displays category names', async () => {
      render(<Categories />);

      await waitFor(() => {
        expect(screen.getByText('Chocolates')).toBeInTheDocument();
        expect(screen.getByText('Drinks')).toBeInTheDocument();
      });
    });

    it('displays category descriptions', async () => {
      render(<Categories />);

      await waitFor(() => {
        expect(screen.getByText('Chocolate items')).toBeInTheDocument();
      });
    });

    it('displays product count and pick rule', async () => {
      render(<Categories />);

      await waitFor(() => {
        expect(screen.getByText('5 products • FIFO')).toBeInTheDocument();
        expect(screen.getByText('3 products • FEFO')).toBeInTheDocument();
      });
    });

    it('shows empty state when no categories', async () => {
      mockList.mockResolvedValue([]);

      render(<Categories />);

      await waitFor(() => {
        expect(screen.getByText('No categories yet')).toBeInTheDocument();
      });
    });

    it('renders the complete compatibility product set beyond the first 100 items', async () => {
      const allProducts = Array.from({ length: 101 }, (_, index) => ({
        id: `prod-${index + 1}`,
        name: `Chocolate ${index + 1}`,
        categoryId: 'cat-1',
        unit: 'pcs',
        totalStock: 0,
      }));
      mockProductsList.mockResolvedValue({
        items: allProducts,
        pagination: { page: 1, pageSize: 100, totalItems: 101, totalPages: 2 },
      } as any);

      render(<Categories />);

      await waitFor(() => expect(screen.getByText('101 products • FIFO')).toBeInTheDocument());
    });
  });

  describe('add category', () => {
    it('shows Add button', async () => {
      render(<Categories />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument();
      });
    });

    it('shows form when Add clicked', async () => {
      const user = userEvent.setup();
      render(<Categories />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add/i }));

      expect(screen.getByText('New Category')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('e.g., Hand Cream, Lip Balm')).toBeInTheDocument();
    });

    it('calls create API on form submit', async () => {
      const user = userEvent.setup();
      mockCreate.mockResolvedValue(sampleCategories[0]!);

      render(<Categories />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add/i }));

      const nameInput = screen.getByPlaceholderText('e.g., Hand Cream, Lip Balm');
      await user.type(nameInput, 'New Category');

      const createButton = screen.getByRole('button', { name: /create/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(mockCreate).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'New Category' })
        );
      });
    });

    it('hides form after successful create', async () => {
      const user = userEvent.setup();
      mockCreate.mockResolvedValue(sampleCategories[0]!);

      render(<Categories />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add/i }));

      const nameInput = screen.getByPlaceholderText('e.g., Hand Cream, Lip Balm');
      await user.type(nameInput, 'Test');

      await user.click(screen.getByRole('button', { name: /create/i }));

      await waitFor(() => {
        expect(screen.queryByText('New Category')).not.toBeInTheDocument();
      });
    });
  });

  describe('edit category', () => {
    it('shows edit form when edit button clicked', async () => {
      const user = userEvent.setup();
      render(<Categories />);

      await waitFor(() => {
        expect(screen.getByText('Chocolates')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Edit category Chocolates' }));

      await waitFor(() => {
        expect(screen.getByText('Edit Category')).toBeInTheDocument();
      });
    });

    it('populates form with existing data', async () => {
      const user = userEvent.setup();
      render(<Categories />);

      await waitFor(() => {
        expect(screen.getByText('Chocolates')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Edit category Chocolates' }));

      await waitFor(() => {
        const nameInput = screen.getByPlaceholderText('e.g., Hand Cream, Lip Balm') as HTMLInputElement;
        expect(nameInput.value).toBe('Chocolates');
      });
    });
  });

  describe('delete category', () => {
    it('calls delete API when confirmed', async () => {
      const user = userEvent.setup();
      mockDelete.mockResolvedValue(undefined);

      render(<Categories />);

      await waitFor(() => {
        expect(screen.getByText('Chocolates')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Delete category Chocolates' }));

      await waitFor(() => {
        expect(mockDelete).toHaveBeenCalledWith('cat-1');
      });
    });
  });

  describe('form controls', () => {
    it('has pick rule dropdown with all options', async () => {
      const user = userEvent.setup();
      render(<Categories />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add/i }));

      const select = screen.getByRole('combobox');
      expect(select).toBeInTheDocument();

      expect(screen.getByText('FIFO - First In, First Out')).toBeInTheDocument();
      expect(screen.getByText('FEFO - First Expiry, First Out')).toBeInTheDocument();
      expect(screen.getByText('Cheapest First')).toBeInTheDocument();
      expect(screen.getByText('Manual Selection')).toBeInTheDocument();
    });

    it('can cancel form', async () => {
      const user = userEvent.setup();
      render(<Categories />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add/i }));
      expect(screen.getByText('New Category')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /cancel/i }));

      await waitFor(() => {
        expect(screen.queryByText('New Category')).not.toBeInTheDocument();
      });
    });
  });

  describe('error handling', () => {
    it('displays error when API fails', async () => {
      mockList.mockRejectedValue(new Error('Network error'));

      render(<Categories />);

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });
  });
});
