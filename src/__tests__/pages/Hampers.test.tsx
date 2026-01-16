import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../utils/test-utils';

vi.stubGlobal('confirm', vi.fn(() => true));

vi.mock('../../lib/api', () => ({
  hampers: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  categories: {
    list: vi.fn(),
  },
  products: {
    list: vi.fn(),
  },
  hamperVariants: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

import Hampers from '../../pages/Hampers';
import { hampers, categories, products } from '../../lib/api';

const mockHampersList = vi.mocked(hampers.list);
const mockHampersGet = vi.mocked(hampers.get);
const mockHampersDelete = vi.mocked(hampers.delete);
const mockCategoriesList = vi.mocked(categories.list);
const mockProductsList = vi.mocked(products.list);

describe('Hampers', () => {
  const sampleCategories = [
    { id: 'cat-1', name: 'Chocolates', pickRule: 'FIFO', isActive: true },
    { id: 'cat-2', name: 'Drinks', pickRule: 'FEFO', isActive: true },
  ];

  const sampleProducts = [
    { id: 'prod-1', name: 'Dark Chocolate', categoryId: 'cat-1' },
    { id: 'prod-2', name: 'Orange Juice', categoryId: 'cat-2' },
  ];

  const sampleHampers = [
    {
      id: 'ham-1',
      name: 'Chocolate Lovers',
      sellingPrice: 35,
      etsyListingId: '12345',
      hasVariants: false,
      isActive: true,
      createdAt: '2024-01-01T00:00:00Z',
      requirements: [
        { id: 'req-1', categoryId: 'cat-1', category: { id: 'cat-1', name: 'Chocolates' }, quantity: 3, isOptional: false },
      ],
      canMake: 5,
    },
    {
      id: 'ham-2',
      name: 'Refreshment Pack',
      sellingPrice: 25,
      etsyListingId: null,
      hasVariants: false,
      isActive: true,
      createdAt: '2024-01-02T00:00:00Z',
      requirements: [
        { id: 'req-2', categoryId: 'cat-2', category: { id: 'cat-2', name: 'Drinks' }, quantity: 2, isOptional: false },
      ],
      canMake: 0,
    },
  ];

  const sampleHamperDetail = {
    ...sampleHampers[0],
    estimatedCost: 10,
    estimatedMargin: 25,
    requirements: [
      {
        id: 'req-1',
        categoryId: 'cat-1',
        category: { id: 'cat-1', name: 'Chocolates' },
        quantity: 3,
        isOptional: false,
        quantityRequired: 3,
        availableStock: 15,
        canFulfill: 5,
        estimatedCost: 10,
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockHampersList.mockResolvedValue(sampleHampers as any);
    mockHampersGet.mockResolvedValue(sampleHamperDetail as any);
    mockCategoriesList.mockResolvedValue(sampleCategories as any);
    mockProductsList.mockResolvedValue(sampleProducts as any);
  });

  describe('loading state', () => {
    it('shows loading message initially', () => {
      render(<Hampers />);
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('hides loading after data loads', async () => {
      render(<Hampers />);
      await waitFor(() => {
        expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
      });
    });
  });

  describe('hamper list', () => {
    it('displays hamper names', async () => {
      render(<Hampers />);
      await waitFor(() => {
        expect(screen.getByText('Chocolate Lovers')).toBeInTheDocument();
        expect(screen.getByText('Refreshment Pack')).toBeInTheDocument();
      });
    });

    it('displays selling prices', async () => {
      render(<Hampers />);
      await waitFor(() => {
        expect(screen.getByText(/£35.00/)).toBeInTheDocument();
        expect(screen.getByText(/£25.00/)).toBeInTheDocument();
      });
    });

    it('displays can make count', async () => {
      render(<Hampers />);
      await waitFor(() => {
        expect(screen.getByText('Can make: 5')).toBeInTheDocument();
        expect(screen.getByText('Can make: 0')).toBeInTheDocument();
      });
    });

    it('shows different colors for availability', async () => {
      render(<Hampers />);
      await waitFor(() => {
        // High availability (5) should be green
        const highBadge = screen.getByText('Can make: 5');
        expect(highBadge.className).toContain('green');

        // No availability (0) should be red
        const lowBadge = screen.getByText('Can make: 0');
        expect(lowBadge.className).toContain('red');
      });
    });

    it('shows empty state when no hampers', async () => {
      mockHampersList.mockResolvedValue([]);
      render(<Hampers />);
      await waitFor(() => {
        expect(screen.getByText('No hampers defined yet')).toBeInTheDocument();
      });
    });
  });

  describe('sorting', () => {
    it('has sort dropdown', async () => {
      render(<Hampers />);
      await waitFor(() => {
        expect(screen.getByText('Sort:')).toBeInTheDocument();
      });
    });

    it('sorts by can make by default', async () => {
      render(<Hampers />);
      await waitFor(() => {
        const sortSelect = screen.getByRole('combobox');
        expect(sortSelect).toHaveValue('canmake-desc');
      });
    });
  });

  describe('hamper expansion', () => {
    it('loads hamper detail when expanded', async () => {
      const user = userEvent.setup();
      render(<Hampers />);

      await waitFor(() => {
        expect(screen.getByText('Chocolate Lovers')).toBeInTheDocument();
      });

      // Click on hamper to expand
      await user.click(screen.getByText('Chocolate Lovers'));

      await waitFor(() => {
        expect(mockHampersGet).toHaveBeenCalledWith('ham-1');
      });
    });

    it('shows hamper details when expanded', async () => {
      const user = userEvent.setup();
      render(<Hampers />);

      await waitFor(() => {
        expect(screen.getByText('Chocolate Lovers')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Chocolate Lovers'));

      await waitFor(() => {
        expect(screen.getByText('Selling Price')).toBeInTheDocument();
        expect(screen.getByText('Est. Cost')).toBeInTheDocument();
        expect(screen.getByText('Est. Margin')).toBeInTheDocument();
      });
    });
  });

  describe('add hamper', () => {
    it('shows New Hamper button', async () => {
      render(<Hampers />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /new hamper/i })).toBeInTheDocument();
      });
    });

    it('shows form when New Hamper clicked', async () => {
      const user = userEvent.setup();
      render(<Hampers />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /new hamper/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /new hamper/i }));

      expect(screen.getByText('New Hamper')).toBeInTheDocument();
    });

    it('shows requirements section in form', async () => {
      const user = userEvent.setup();
      render(<Hampers />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /new hamper/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /new hamper/i }));

      expect(screen.getByText('Requirements *')).toBeInTheDocument();
    });

    it('can add requirement', async () => {
      const user = userEvent.setup();
      render(<Hampers />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /new hamper/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /new hamper/i }));

      const addReqButton = screen.getByText('+ Add Requirement');
      await user.click(addReqButton);

      // Should now have 2 requirement rows
      const categorySelects = screen.getAllByText('Select category...');
      expect(categorySelects.length).toBe(2);
    });
  });

  describe('delete hamper', () => {
    it('calls delete API when confirmed', async () => {
      const user = userEvent.setup();
      mockHampersDelete.mockResolvedValue(undefined);

      render(<Hampers />);

      await waitFor(() => {
        expect(screen.getByText('Chocolate Lovers')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Delete hamper Chocolate Lovers' }));

      await waitFor(() => {
        expect(mockHampersDelete).toHaveBeenCalled();
      });
    });
  });

  describe('edit hamper', () => {
    it('scrolls to the form when editing a hamper', async () => {
      const user = userEvent.setup();
      const scrollSpy = vi.fn();

      const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        value: scrollSpy,
        writable: true,
      });

      try {
        mockHampersList.mockResolvedValue([
          {
            id: 'ham-mock-1',
            name: 'Mock Imported Hamper',
            sellingPrice: 35,
            etsyListingId: '2000',
            hasVariants: true,
            isActive: true,
            createdAt: '2024-01-03T00:00:00Z',
            requirements: [],
            canMake: 0,
          },
        ] as any);

        render(<Hampers />);

        await waitFor(() => {
          expect(screen.getByText('Mock Imported Hamper')).toBeInTheDocument();
        });

        await user.click(screen.getByRole('button', { name: 'Edit hamper Mock Imported Hamper' }));

        await waitFor(() => {
          expect(screen.getByText('Edit Hamper')).toBeInTheDocument();
        });

        await waitFor(() => {
          expect(scrollSpy).toHaveBeenCalled();
        });
      } finally {
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
          value: originalScrollIntoView,
          writable: true,
        });
      }
    });
  });

  describe('Etsy sync', () => {
    it('has Etsy Sync button', async () => {
      render(<Hampers />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /etsy sync/i })).toBeInTheDocument();
      });
    });
  });

  describe('error handling', () => {
    it('displays error when API fails', async () => {
      mockHampersList.mockRejectedValue(new Error('Network error'));

      render(<Hampers />);

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });
  });
});
