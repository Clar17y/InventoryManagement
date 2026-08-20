import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
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
  settings: {
    getPostageTiers: vi.fn(),
  },
}));

import Sales from '../../pages/Sales';
import { sales, hampers, etsy, settings } from '../../lib/api';

const mockSalesList = vi.mocked(sales.list);
const mockSalesSummary = vi.mocked(sales.summary);
const mockSalesPreview = vi.mocked(sales.preview);
const mockHampersList = vi.mocked(hampers.list);
const mockEtsyGetStatus = vi.mocked(etsy.getStatus);
const mockGetPostageTiers = vi.mocked(settings.getPostageTiers);

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

  const saleWithFeeEvidence = (overrides: Record<string, unknown> = {}) => ({
    ...sampleSales[0],
    offsiteAdsAttributed: null,
    offsiteAdsFee: null,
    vatOnOffsiteAdsFee: null,
    etsyPaymentGross: null,
    etsyPaymentFees: null,
    etsyPaymentNet: null,
    etsyFeeReconciliationStatus: 'PENDING',
    etsyFeeReconciliationSource: null,
    etsyFeeReconciledAt: null,
    ...overrides,
  });

  const sampleSummary = {
    unverifiedEtsySales: 0,
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

  const listResponse = (
    items: any[] = sampleSales,
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
    window.history.pushState({}, '', '/');
    mockSalesList.mockResolvedValue(listResponse());
    mockSalesSummary.mockResolvedValue(sampleSummary);
    mockHampersList.mockResolvedValue(sampleHampers as any);
    mockSalesPreview.mockResolvedValue(samplePreview as any);
    mockEtsyGetStatus.mockResolvedValue({ connected: false });
    mockGetPostageTiers.mockResolvedValue([]);
  });

  describe('loading state', () => {
    it('shows loading message initially', async () => {
      render(<Sales />);
      expect(screen.getByText('Loading...')).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());
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
      mockSalesList.mockResolvedValue(listResponse([], 0));
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

    it('shows not checked attribution without turning unknown fees into zero', async () => {
      const user = userEvent.setup();
      mockSalesList.mockResolvedValue(listResponse([saleWithFeeEvidence()]));
      render(<Sales />);

      await waitFor(() => {
        expect(screen.getByText(/Chocolate Lovers/)).toBeInTheDocument();
      });
      await user.click(screen.getByText(/Chocolate Lovers/));

      expect(screen.getByText('Offsite Ads: Not checked')).toBeInTheDocument();
      expect(screen.queryByText('Offsite Ads fee: £0.00')).not.toBeInTheDocument();
    });

    it('shows verified no attribution and statement source', async () => {
      const user = userEvent.setup();
      mockSalesList.mockResolvedValue(listResponse([saleWithFeeEvidence({
          offsiteAdsAttributed: false,
          offsiteAdsFee: 0,
          vatOnOffsiteAdsFee: 0,
          etsyFeeReconciliationStatus: 'STATEMENT_VERIFIED',
          etsyFeeReconciliationSource: 'ETSY_STATEMENT',
          etsyFeeReconciledAt: '2024-02-01T10:00:00Z',
        })]));
      render(<Sales />);

      await waitFor(() => {
        expect(screen.getByText(/Chocolate Lovers/)).toBeInTheDocument();
      });
      await user.click(screen.getByText(/Chocolate Lovers/));

      expect(screen.getByText('Offsite Ads: No')).toBeInTheDocument();
      expect(screen.getByText('Status: Statement verified')).toBeInTheDocument();
      expect(screen.getByText('Source: Etsy statement')).toBeInTheDocument();
      expect(screen.getByText('Offsite Ads fee: £0.00')).toBeInTheDocument();
      expect(screen.getByText('VAT on Offsite Ads fee: £0.00')).toBeInTheDocument();
    });

    it('shows verified attribution with Offsite fee, VAT, and Payment source', async () => {
      const user = userEvent.setup();
      mockSalesList.mockResolvedValue(listResponse([saleWithFeeEvidence({
          offsiteAdsAttributed: true,
          offsiteAdsFee: 4.8,
          vatOnOffsiteAdsFee: 0.96,
          etsyFeeReconciliationStatus: 'PAYMENT_SYNCED',
          etsyFeeReconciliationSource: 'ETSY_PAYMENT_API',
          etsyFeeReconciledAt: '2024-02-01T10:00:00Z',
        })]));
      render(<Sales />);

      await waitFor(() => {
        expect(screen.getByText(/Chocolate Lovers/)).toBeInTheDocument();
      });
      await user.click(screen.getByText(/Chocolate Lovers/));

      expect(screen.getByText('Offsite Ads: Yes')).toBeInTheDocument();
      expect(screen.getByText('Offsite Ads fee: £4.80')).toBeInTheDocument();
      expect(screen.getByText('VAT on Offsite Ads fee: £0.96')).toBeInTheDocument();
      expect(screen.getByText('Status: Payment synced')).toBeInTheDocument();
      expect(screen.getByText('Source: Etsy Payment API')).toBeInTheDocument();
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

    it('warns when Etsy sales still need statement verification', async () => {
      const user = userEvent.setup();
      mockSalesSummary.mockResolvedValue({ ...sampleSummary, unverifiedEtsySales: 12 });
      render(<Sales />);

      await waitFor(() => {
        expect(screen.getByTitle('Toggle summary')).toBeInTheDocument();
      });
      await user.click(screen.getByTitle('Toggle summary'));

      expect(screen.getByText('12 Etsy sales in this period still need statement verification')).toBeInTheDocument();
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

  describe('pagination and request lifecycle', () => {
    it('loads the sales list once on initial render', async () => {
      render(<Sales />);

      await waitFor(() => expect(mockSalesList).toHaveBeenCalled());

      expect(mockSalesList).toHaveBeenCalledTimes(1);
    });

    it('reloads the list and summary for a date change without reloading hampers', async () => {
      render(<Sales />);

      await waitFor(() => expect(screen.getByText(/Chocolate Lovers/)).toBeInTheDocument());
      const startDateInput = document.querySelector('input[type="date"]');
      expect(startDateInput).not.toBeNull();
      fireEvent.change(startDateInput!, { target: { value: '2026-08-01' } });

      await waitFor(() => {
        expect(mockSalesList).toHaveBeenCalledTimes(2);
        expect(mockSalesSummary).toHaveBeenCalledTimes(2);
      });
      expect(mockHampersList).toHaveBeenCalledTimes(1);
    });

    it('changes only the list query when moving to page two', async () => {
      mockSalesList.mockResolvedValue(listResponse(sampleSales, 51));
      render(<Sales />);

      await waitFor(() => expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument());
      await userEvent.click(screen.getByRole('button', { name: '2' }));

      await waitFor(() => expect(mockSalesList).toHaveBeenCalledTimes(2));
      expect(mockSalesSummary).toHaveBeenCalledTimes(1);
      expect(mockSalesList.mock.calls[1]?.[0]).toEqual(expect.objectContaining({ page: 2 }));
    });

    it('retains the previous row and announces updates while page two is pending', async () => {
      let resolvePageTwo: ((value: ReturnType<typeof listResponse>) => void) | undefined;
      mockSalesList.mockImplementation((params) => {
        if (params?.page === 2) {
          return new Promise((resolve) => {
            resolvePageTwo = resolve;
          });
        }
        return Promise.resolve(listResponse(sampleSales, 51));
      });
      render(<Sales />);

      await waitFor(() => expect(screen.getByText(/Chocolate Lovers/)).toBeInTheDocument());
      await userEvent.click(screen.getByRole('button', { name: '2' }));

      expect(screen.getByText(/Chocolate Lovers/)).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('Updating results…');

      resolvePageTwo?.(listResponse([], 51, 2));
      await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    });

    it('keeps old rows and exposes Retry when the current page request rejects', async () => {
      mockSalesList.mockImplementation((params) => {
        if (params?.page === 2) return Promise.reject(new Error('Page failed'));
        return Promise.resolve(listResponse(sampleSales, 51));
      });
      render(<Sales />);

      await waitFor(() => expect(screen.getByText(/Chocolate Lovers/)).toBeInTheDocument());
      await userEvent.click(screen.getByRole('button', { name: '2' }));

      await waitFor(() => expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument());
      expect(screen.getByText(/Chocolate Lovers/)).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent('Page failed');
    });

    it('does not let an earlier filter response overwrite the latest response', async () => {
      const saleA = { ...sampleSales[0], id: 'sale-a', etsyOrderId: 'order-a' };
      const saleB = { ...sampleSales[0], id: 'sale-b', etsyOrderId: 'order-b' };
      let resolveA: ((value: ReturnType<typeof listResponse>) => void) | undefined;
      let resolveB: ((value: ReturnType<typeof listResponse>) => void) | undefined;
      mockSalesList.mockImplementation((params) => {
        if (params?.startDate === '2026-08-01') {
          return new Promise((resolve) => {
            resolveA = resolve;
          });
        }
        if (params?.startDate === '2026-08-02') {
          return new Promise((resolve) => {
            resolveB = resolve;
          });
        }
        return Promise.resolve(listResponse(sampleSales));
      });
      render(<Sales />);

      await waitFor(() => expect(screen.getByText(/Chocolate Lovers/)).toBeInTheDocument());
      const startDateInput = document.querySelector('input[type="date"]');
      expect(startDateInput).not.toBeNull();
      fireEvent.change(startDateInput!, { target: { value: '2026-08-01' } });
      fireEvent.change(startDateInput!, { target: { value: '2026-08-02' } });

      await waitFor(() => expect(mockSalesList).toHaveBeenCalledTimes(3));
      resolveB?.(listResponse([saleB]));
      await waitFor(() => expect(mockSalesList).toHaveBeenCalledTimes(3));
      resolveA?.(listResponse([saleA]));

      await waitFor(() => expect(screen.getByText(/#order-b/)).toBeInTheDocument());
      expect(screen.queryByText(/#order-a/)).not.toBeInTheDocument();
    });

    it('replaces Load More with a visible result range', async () => {
      mockSalesList.mockResolvedValue(listResponse(sampleSales, 51));
      render(<Sales />);

      await waitFor(() => expect(screen.getByText('Showing 1–25 of 51')).toBeInTheDocument());

      expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
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
