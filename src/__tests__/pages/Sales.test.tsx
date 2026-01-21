import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../utils/test-utils';

vi.mock('../../lib/api', () => ({
  sales: {
    list: vi.fn(),
    summary: vi.fn(),
    preview: vi.fn(),
    create: vi.fn(),
  },
  hampers: {
    list: vi.fn(),
  },
  inventory: {
    lotsByCategory: vi.fn(),
  },
  etsy: {
    getStatus: vi.fn(),
    initiateAuth: vi.fn(),
    disconnect: vi.fn(),
    getPendingOrders: vi.fn(),
    importOrder: vi.fn(),
  },
}));

import Sales from '../../pages/Sales';
import { sales, hampers, etsy } from '../../lib/api';

const mockSalesList = vi.mocked(sales.list);
const mockSalesSummary = vi.mocked(sales.summary);
const mockSalesPreview = vi.mocked(sales.preview);
const mockHampersList = vi.mocked(hampers.list);
const mockEtsyGetStatus = vi.mocked(etsy.getStatus);

describe('Sales', () => {
  const sampleHampers = [
    {
      id: 'ham-1',
      name: 'Chocolate Lovers',
      sellingPrice: 35,
      hasVariants: false,
      canMake: 5,
      requirements: [],
    },
  ];

  const sampleSales: any = [
    {
      id: 'sale-1',
      saleDate: '2024-01-15T10:00:00Z',
      saleChannel: 'etsy' as const,
      etsyOrderId: '123456',
      grossRevenue: 35,
      postageCharged: 5,
      postageCost: 3.5,
      etsyFees: 4.5,
      totalCost: 15,
      margin: 17,
      lines: [
        {
          id: 'line-1',
          hamperId: 'ham-1',
          hamper: { id: 'ham-1', name: 'Chocolate Lovers' },
          quantity: 1,
          unitPrice: 35,
          consumptions: [],
        },
      ],
    },
  ];

  const sampleSummary = {
    totals: {
      salesCount: 1,
      totalRevenue: 35,
      totalPostageCharged: 5,
      totalPostageCost: 3.5,
      totalFees: 4.5,
      totalCost: 15,
      totalMargin: 17,
    },
    byChannel: [
      { channel: 'etsy' as const, count: 1, revenue: 35, fees: 4.5, margin: 17 },
    ],
    byHamper: [],
  };

  const samplePreview = {
    lines: [
      {
        hamperId: 'ham-1',
        hamperName: 'Chocolate Lovers',
        quantity: 1,
        unitPrice: 35,
        canFulfill: true,
        requirements: [
          {
            categoryId: 'cat-1',
            categoryName: 'Chocolates',
            quantityRequired: 3,
            fulfilled: true,
            totalCost: 10,
            allocations: [{ productName: 'Dark Chocolate', quantity: 3, unitCost: 3.33 }],
          },
        ],
        totalCost: 10,
      },
    ],
    summary: {
      totalGross: 35,
      postageCharged: 5,
      totalCost: 10,
      estimatedFees: 4.5,
      packagingOverhead: 1.5,
      estimatedMargin: 24,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSalesList.mockResolvedValue({ sales: sampleSales, total: 1 });
    mockSalesSummary.mockResolvedValue(sampleSummary);
    mockHampersList.mockResolvedValue(sampleHampers as any);
    mockSalesPreview.mockResolvedValue(samplePreview as any);
    mockEtsyGetStatus.mockResolvedValue({ connected: false });
  });

  describe('loading state', () => {
    it('shows loading message initially', () => {
      render(<Sales />);
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('hides loading after data loads', async () => {
      render(<Sales />);
      await waitFor(() => {
        expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
      });
    });
  });

  describe('sales list view', () => {
    it('displays page title', async () => {
      render(<Sales />);
      await waitFor(() => {
        expect(screen.getByText('Sales')).toBeInTheDocument();
      });
    });

    it('has Etsy Sync button', async () => {
      render(<Sales />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /etsy sync/i })).toBeInTheDocument();
      });
    });

    it('displays sale channel badges', async () => {
      render(<Sales />);
      await waitFor(() => {
        expect(screen.getByText('Etsy')).toBeInTheDocument();
      });
    });

    it('displays hamper names in sales', async () => {
      render(<Sales />);
      await waitFor(() => {
        expect(screen.getByText(/Chocolate Lovers/)).toBeInTheDocument();
      });
    });

    it('displays gross revenue', async () => {
      render(<Sales />);
      await waitFor(() => {
        expect(screen.getByText('£35.00')).toBeInTheDocument();
      });
    });

    it('displays margin badge', async () => {
      render(<Sales />);
      await waitFor(() => {
        expect(screen.getByText(/£17.00/)).toBeInTheDocument();
      });
    });

    it('shows empty state when no sales', async () => {
      mockSalesList.mockResolvedValue({ sales: [], total: 0 });
      render(<Sales />);
      await waitFor(() => {
        expect(screen.getByText('No sales recorded yet')).toBeInTheDocument();
      });
    });
  });

  describe('sale expansion', () => {
    it('shows sale details when expanded', async () => {
      const user = userEvent.setup();
      render(<Sales />);

      await waitFor(() => {
        expect(screen.getByText(/Chocolate Lovers/)).toBeInTheDocument();
      });

      // Click to expand
      await user.click(screen.getByText(/Chocolate Lovers/));

      await waitFor(() => {
        expect(screen.getByText('Gross Revenue')).toBeInTheDocument();
        expect(screen.getByText('Stock Cost')).toBeInTheDocument();
      });
    });
  });

  describe('summary toggle', () => {
    it('has summary toggle button', async () => {
      render(<Sales />);
      await waitFor(() => {
        expect(screen.getByTitle('Toggle summary')).toBeInTheDocument();
      });
    });

    it('shows summary when toggled', async () => {
      const user = userEvent.setup();
      render(<Sales />);

      await waitFor(() => {
        expect(screen.getByTitle('Toggle summary')).toBeInTheDocument();
      });

      await user.click(screen.getByTitle('Toggle summary'));

      await waitFor(() => {
        expect(screen.getByText('Sales Summary')).toBeInTheDocument();
        expect(screen.getByText('Total Sales')).toBeInTheDocument();
      });
    });
  });

  describe('record sale mode', () => {
    it('has Record Sale button', async () => {
      render(<Sales />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /record sale/i })).toBeInTheDocument();
      });
    });

    it('switches to record mode when button clicked', async () => {
      const user = userEvent.setup();
      render(<Sales />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /record sale/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /record sale/i }));

      expect(screen.getByText('Record Sale')).toBeInTheDocument();
    });

    it('shows sale channel selection in record mode', async () => {
      const user = userEvent.setup();
      render(<Sales />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /record sale/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /record sale/i }));

      expect(screen.getByText('Sale Channel')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Etsy' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Direct' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Fair/Market' })).toBeInTheDocument();
    });

    it('has hamper selection dropdown', async () => {
      const user = userEvent.setup();
      render(<Sales />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /record sale/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /record sale/i }));

      expect(screen.getByText('Items')).toBeInTheDocument();
      expect(screen.getByText('Select hamper...')).toBeInTheDocument();
    });

    it('has postage inputs', async () => {
      const user = userEvent.setup();
      render(<Sales />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /record sale/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /record sale/i }));

      expect(screen.getByText('Postage')).toBeInTheDocument();
      expect(screen.getByText('Postage Charged')).toBeInTheDocument();
      expect(screen.getByText('Postage Cost')).toBeInTheDocument();
    });

    it('shows preview when hamper selected', async () => {
      const user = userEvent.setup();
      render(<Sales />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /record sale/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /record sale/i }));

      // Select a hamper
      const hamperSelect = screen.getByRole('combobox');
      await user.selectOptions(hamperSelect, 'ham-1');

      await waitFor(() => {
        expect(mockSalesPreview).toHaveBeenCalled();
      });
    });

    it('has cancel button', async () => {
      const user = userEvent.setup();
      render(<Sales />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /record sale/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /record sale/i }));

      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });

    it('returns to list view when cancel clicked', async () => {
      const user = userEvent.setup();
      render(<Sales />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /record sale/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /record sale/i }));
      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      await waitFor(() => {
        // Should be back in list view
        expect(screen.getByRole('button', { name: /record sale/i })).toBeInTheDocument();
      });
    });

    it('can add bespoke item', async () => {
      const user = userEvent.setup();
      render(<Sales />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /record sale/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /record sale/i }));

      await user.click(screen.getByText('+ Bespoke Item'));

      expect(screen.getByText('Bespoke')).toBeInTheDocument();
    });
  });

  describe('date filter', () => {
    it('shows date filter component', async () => {
      render(<Sales />);
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search sales...')).toBeInTheDocument();
      });
    });
  });

  describe('error handling', () => {
    it('displays error when API fails', async () => {
      mockSalesList.mockRejectedValue(new Error('Network error'));

      render(<Sales />);

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });
  });
});
