import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
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
    listAll: vi.fn(),
  },
  hamperVariants: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

import Hampers from '../../pages/Hampers';
import { hampers, categories, products, hamperVariants } from '../../lib/api';

  const mockHampersList = vi.mocked(hampers.list);
  const mockHampersGet = vi.mocked(hampers.get);
  const mockHampersUpdate = vi.mocked(hampers.update);
  const mockHampersDelete = vi.mocked(hampers.delete);
  const mockCategoriesList = vi.mocked(categories.list);
  const mockProductsList = vi.mocked(products.list);
  const mockProductsListAll = vi.mocked(products.listAll);
  const mockHamperVariantUpdate = vi.mocked(hamperVariants.update);

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
      etsyIsEnabled: true,
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
      etsyIsEnabled: true,
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

  const listResponse = (
    items: any[] = sampleHampers,
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
    localStorage.clear();
    window.history.pushState({}, '', '/');
    mockHampersList.mockResolvedValue(listResponse() as any);
    mockHampersGet.mockResolvedValue(sampleHamperDetail as any);
    mockCategoriesList.mockResolvedValue(sampleCategories as any);
    mockProductsList.mockResolvedValue({
      items: sampleProducts,
      pagination: { page: 1, pageSize: 25, totalItems: sampleProducts.length, totalPages: 1 },
    } as any);
    mockProductsListAll.mockResolvedValue({
      items: sampleProducts,
      pagination: { page: 1, pageSize: 25, totalItems: sampleProducts.length, totalPages: 1 },
    } as any);
  });

  describe('loading state', () => {
    it('shows loading message initially', async () => {
      render(<Hampers />);
      expect(screen.getByText('Loading...')).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());
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
      mockHampersList.mockResolvedValue(listResponse([], 0) as any);
      render(<Hampers />);
      await waitFor(() => {
        expect(screen.getByText('No hampers defined yet')).toBeInTheDocument();
      });
    });

    it('hides Etsy-disabled hampers and variants by default with a toggle to show them', async () => {
      const user = userEvent.setup();
      const variantHamper = {
          id: 'ham-visible-variants',
          name: 'Variant Hamper',
          sellingPrice: 42,
          etsyListingId: '98765',
          hasVariants: true,
          etsyIsEnabled: true,
          isActive: true,
          createdAt: '2024-01-03T00:00:00Z',
          requirements: [],
          canMake: 0,
          variantAvailability: [
            {
              variantId: 'var-blue',
              name: 'Blue Suitcase',
              etsySku: 'BLUE-SUITCASE',
              sellingPrice: 42,
              indicativeQuantity: null,
              etsyIsEnabled: true,
              canMake: 2,
            },
            {
              variantId: 'var-squirrel',
              name: 'Squirrel Medium Suitcase',
              etsySku: 'SQUIRREL-MEDIUM',
              sellingPrice: 42,
              indicativeQuantity: null,
              etsyIsEnabled: false,
              canMake: 1,
            },
          ],
        };
      const hiddenHamper = {
          id: 'ham-hidden',
          name: 'Hidden Etsy Hamper',
          sellingPrice: 30,
          etsyListingId: '54321',
          hasVariants: false,
          etsyIsEnabled: false,
          isActive: true,
          createdAt: '2024-01-04T00:00:00Z',
          requirements: [],
          canMake: 4,
        };
      mockHampersList.mockImplementation((params) => Promise.resolve(listResponse(
        params?.hideEtsyHidden === false
          ? [variantHamper, hiddenHamper]
          : [{
              ...variantHamper,
              variantAvailability: variantHamper.variantAvailability.filter(
                (variant) => variant.etsyIsEnabled,
              ),
            }],
      )) as any);

      render(<Hampers />);

      await waitFor(() => {
        expect(screen.getByText('Variant Hamper')).toBeInTheDocument();
      });

      const toggle = screen.getByRole('checkbox', { name: /hide etsy hidden/i });
      expect(toggle).toBeChecked();
      expect(screen.getByText(/Blue Suitcase: 2/)).toBeInTheDocument();
      expect(screen.queryByText(/Squirrel Medium Suitcase/)).not.toBeInTheDocument();
      expect(screen.queryByText('Hidden Etsy Hamper')).not.toBeInTheDocument();

      await user.click(toggle);

      await waitFor(() => {
        expect(screen.getByText(/Squirrel Medium Suitcase: 1/)).toBeInTheDocument();
        expect(screen.getByText('Hidden Etsy Hamper')).toBeInTheDocument();
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
        const sortSelect = screen.getByRole('combobox', { name: 'Sort hampers' });
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

      await user.click(screen.getByRole('checkbox', { name: /add chocolates/i }));

      expect(screen.getByRole('checkbox', { name: /remove chocolates/i })).toBeInTheDocument();
    });

    it('preserves an existing mapping label and replaces its ID through product lookup', async () => {
      const user = userEvent.setup();
      mockProductsList.mockResolvedValue({
        items: [{ id: 'prod-new', name: 'New Chocolate', categoryId: 'cat-1', unit: 'units' }],
        pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
      } as any);
      const variantHamper = {
        ...sampleHampers[0],
        id: 'ham-variants',
        name: 'Variant Chocolate Hamper',
        hasVariants: true,
        requirements: [
          ...sampleHampers[0]!.requirements,
          { id: 'req-2', categoryId: 'cat-2', category: { id: 'cat-2', name: 'Drinks' }, quantity: 1, isOptional: false },
        ],
      };
      const existingVariant = {
        id: 'variant-1',
        hamperId: 'ham-variants',
        name: 'Classic',
        etsySku: null,
        etsyIsEnabled: true,
        isActive: true,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        mappings: [{
          categoryId: 'cat-1',
          productId: 'prod-existing',
          priority: 1,
          category: { id: 'cat-1', name: 'Chocolates' },
          product: { id: 'prod-existing', name: 'Legacy Chocolate' },
        }, {
          categoryId: 'cat-2',
          productId: 'prod-drink',
          priority: 1,
          category: { id: 'cat-2', name: 'Drinks' },
          product: { id: 'prod-drink', name: 'Legacy Drink' },
        }],
      };
      mockHampersList.mockResolvedValue(listResponse([variantHamper]) as any);
      mockHampersGet.mockResolvedValue({ ...variantHamper, variants: [existingVariant] } as any);
      mockHamperVariantUpdate.mockResolvedValue(existingVariant as any);

      render(<Hampers />);
      await waitFor(() => expect(screen.getByText('Variant Chocolate Hamper')).toBeInTheDocument());
      expect(mockProductsList).not.toHaveBeenCalled();
      expect(mockProductsListAll).not.toHaveBeenCalled();
      await user.click(screen.getByRole('button', { name: 'Edit hamper Variant Chocolate Hamper' }));
      await user.click(await screen.findByTitle('Edit variant'));

      expect((await screen.findAllByText(/Legacy Chocolate/)).length).toBeGreaterThan(0);
      expect(screen.getAllByRole('searchbox', { name: 'Search products' })).toHaveLength(4);
      expect(mockProductsList).not.toHaveBeenCalled();

      await user.click(screen.getAllByRole('searchbox', { name: 'Search products' })[0]!);
      await waitFor(() => expect(mockProductsList).toHaveBeenCalledTimes(1));
      expect(mockProductsList).toHaveBeenCalledWith(
        { categoryId: 'cat-1', page: 1, pageSize: 25, search: undefined },
        { signal: expect.any(AbortSignal) },
      );

      await user.click(await screen.findByRole('button', { name: 'Select New Chocolate' }));
      await user.click(screen.getByRole('button', { name: 'Update Variant' }));

      await waitFor(() => expect(mockHamperVariantUpdate).toHaveBeenCalledWith(
        'ham-variants',
        'variant-1',
        expect.objectContaining({
          mappings: [
            { categoryId: 'cat-1', productId: 'prod-new', priority: 1 },
            { categoryId: 'cat-2', productId: 'prod-drink', priority: 1 },
          ],
        }),
      ));
      expect(mockProductsListAll).not.toHaveBeenCalled();
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
        mockHampersList.mockResolvedValue(listResponse([
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
        ]) as any);

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

    it('can clear all requirements on update', async () => {
      const user = userEvent.setup();

      mockHampersUpdate.mockResolvedValue({
        id: 'ham-clear-1',
        name: 'Clearable Hamper',
        sellingPrice: 35,
        etsyListingId: null,
        hasVariants: false,
        isActive: true,
        createdAt: '2024-01-01T00:00:00Z',
        requirements: [],
        canMake: 0,
      } as any);

      mockHampersList.mockResolvedValue(listResponse([
        {
          id: 'ham-clear-1',
          name: 'Clearable Hamper',
          sellingPrice: 35,
          etsyListingId: null,
          hasVariants: false,
          isActive: true,
          createdAt: '2024-01-01T00:00:00Z',
          requirements: [
            { id: 'req-1', categoryId: 'cat-1', category: { id: 'cat-1', name: 'Chocolates' }, quantity: 1, isOptional: false },
          ],
          canMake: 0,
        },
      ]) as any);

      render(<Hampers />);

      await waitFor(() => {
        expect(screen.getByText('Clearable Hamper')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Edit hamper Clearable Hamper' }));

      await waitFor(() => {
        expect(screen.getByText('Edit Hamper')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('checkbox', { name: /remove chocolates/i }));

      await user.click(screen.getByRole('button', { name: /update basic info/i }));

      await waitFor(() => {
        expect(mockHampersUpdate).toHaveBeenCalledWith(
          'ham-clear-1',
          expect.objectContaining({ requirements: [] })
        );
      });
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

  describe('pagination and request lifecycle', () => {
    it('loads the first page once and does not load the complete product catalogue', async () => {
      render(<Hampers />);

      await waitFor(() => expect(screen.getByText('Chocolate Lovers')).toBeInTheDocument());

      expect(mockHampersList).toHaveBeenCalledTimes(1);
      expect(mockProductsList).not.toHaveBeenCalled();
      expect(mockProductsListAll).not.toHaveBeenCalled();
    });

    it('changes only the hamper page query when moving to page two', async () => {
      mockHampersList.mockResolvedValue(listResponse(sampleHampers, 51) as any);
      render(<Hampers />);

      await waitFor(() => expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument());
      await userEvent.click(screen.getByRole('button', { name: '2' }));

      await waitFor(() => expect(mockHampersList).toHaveBeenCalledTimes(2));
      expect(mockHampersList.mock.calls[1]?.[0]).toEqual(expect.objectContaining({ page: 2 }));
      expect(mockCategoriesList).toHaveBeenCalledTimes(1);
    });

    it('retains the previous rows and announces updates while a new page is pending', async () => {
      let resolvePageTwo: ((value: ReturnType<typeof listResponse>) => void) | undefined;
      mockHampersList.mockImplementation((params) => {
        if (params?.page === 2) {
          return new Promise((resolve) => {
            resolvePageTwo = resolve;
          });
        }
        return Promise.resolve(listResponse(sampleHampers, 51) as any);
      });
      render(<Hampers />);

      await waitFor(() => expect(screen.getByText('Chocolate Lovers')).toBeInTheDocument());
      await userEvent.click(screen.getByRole('button', { name: '2' }));

      expect(screen.getByText('Chocolate Lovers')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('Updating results…');

      resolvePageTwo?.(listResponse([], 51, 2));
      await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    });

    it('keeps old rows and exposes Retry when the current page fails', async () => {
      let pageTwoAttempts = 0;
      mockHampersList.mockImplementation((params) => {
        if (params?.page === 2) {
          pageTwoAttempts += 1;
          return pageTwoAttempts === 1
            ? Promise.reject(new Error('Page failed'))
            : Promise.resolve(listResponse(sampleHampers, 51, 2));
        }
        return Promise.resolve(listResponse(sampleHampers, 51));
      });
      render(<Hampers />);

      await waitFor(() => expect(screen.getByText('Chocolate Lovers')).toBeInTheDocument());
      await userEvent.click(screen.getByRole('button', { name: '2' }));

      await waitFor(() => expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument());
      expect(screen.getByText('Chocolate Lovers')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent('Page failed');

      await userEvent.click(screen.getByRole('button', { name: /retry/i }));
      await waitFor(() => expect(pageTwoAttempts).toBe(2));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('ignores an earlier filter response after a later response settles', async () => {
      const hamperA = { ...sampleHampers[0], id: 'ham-a', name: 'Older response' };
      const hamperB = { ...sampleHampers[0], id: 'ham-b', name: 'Latest response' };
      let resolveA: ((value: ReturnType<typeof listResponse>) => void) | undefined;
      let resolveB: ((value: ReturnType<typeof listResponse>) => void) | undefined;
      mockHampersList.mockImplementation((params) => {
        if (params?.search === 'older') {
          return new Promise((resolve) => { resolveA = resolve; });
        }
        if (params?.search === 'latest') {
          return new Promise((resolve) => { resolveB = resolve; });
        }
        return Promise.resolve(listResponse(sampleHampers));
      });
      render(<Hampers />);

      await waitFor(() => expect(screen.getByText('Chocolate Lovers')).toBeInTheDocument());
      const search = screen.getByPlaceholderText('Search hampers...');
      fireEvent.change(search, { target: { value: 'older' } });
      await waitFor(() => expect(mockHampersList).toHaveBeenCalledTimes(2));
      fireEvent.change(search, { target: { value: 'latest' } });

      await waitFor(() => expect(mockHampersList).toHaveBeenCalledTimes(3));
      resolveB?.(listResponse([hamperB]));
      await waitFor(() => expect(screen.getByText('Latest response')).toBeInTheDocument());
      resolveA?.(listResponse([hamperA]));

      await waitFor(() => expect(screen.getByText('Latest response')).toBeInTheDocument());
      expect(screen.queryByText('Older response')).not.toBeInTheDocument();
    });

    it('resets the URL page when filters or page size change', async () => {
      window.history.pushState({}, '', '/?page=3&pageSize=50');
      mockHampersList.mockResolvedValue(listResponse(sampleHampers, 101, 3, 50) as any);
      render(<Hampers />);

      await waitFor(() => expect(screen.getByText('Chocolate Lovers')).toBeInTheDocument());
      const search = screen.getByPlaceholderText('Search hampers...');
      fireEvent.change(search, { target: { value: 'chocolate' } });
      await waitFor(() => expect(mockHampersList.mock.calls.some(([params]) => params?.page === 1)).toBe(true));

      const pageSize = screen.getByRole('combobox', { name: 'Rows per page' });
      await userEvent.selectOptions(pageSize, '100');
      await waitFor(() => {
      const lastCall = mockHampersList.mock.calls[mockHampersList.mock.calls.length - 1]?.[0];
        expect(lastCall).toEqual(expect.objectContaining({ page: 1, pageSize: 100 }));
      });
    });

    it('replaces Load More with the visible result range', async () => {
      mockHampersList.mockResolvedValue(listResponse(sampleHampers, 51) as any);
      render(<Hampers />);

      await waitFor(() => expect(screen.getByText('Showing 1–25 of 51')).toBeInTheDocument());
      expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
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
