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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

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

  const saleFor = (id: string, name: string, grossRevenue: number) => ({
    ...sampleSales[0],
    id,
    grossRevenue,
    lines: [{
      ...sampleSales[0].lines[0],
      hamper: { ...sampleSales[0].lines[0].hamper, name },
    }],
  });

  const summaryFor = (totalRevenue: number) => ({
    ...sampleSummary,
    totals: { ...sampleSummary.totals, totalRevenue },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockSalesList.mockResolvedValue({ sales: sampleSales, total: 1 });
    mockSalesSummary.mockResolvedValue(sampleSummary);
    mockHampersList.mockResolvedValue(sampleHampers as any);
    mockSalesPreview.mockResolvedValue(samplePreview as any);
    mockEtsyGetStatus.mockResolvedValue({ connected: false });
    mockGetPostageTiers.mockResolvedValue([]);
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

    it('shows every verification status filter option', async () => {
      render(<Sales />);

      const filter = await screen.findByLabelText('Verification status');
      expect(filter).toHaveValue('');
      expect(screen.getByRole('option', { name: 'All statuses' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Not applicable' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Pending' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Payment synced' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Statement verified' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Manually verified' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Manual review' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Needs verification' })).toBeInTheDocument();
    });

    it('passes an exact Pending filter to both list and summary requests', async () => {
      const user = userEvent.setup();
      render(<Sales />);
      const filter = await screen.findByLabelText('Verification status');
      vi.clearAllMocks();

      await user.selectOptions(filter, 'PENDING');

      await waitFor(() => {
        expect(mockSalesList).toHaveBeenCalledWith(expect.objectContaining({
          limit: 20,
          offset: 0,
          verificationStatus: 'PENDING',
        }));
        expect(mockSalesSummary).toHaveBeenCalledWith(expect.objectContaining({
          verificationStatus: 'PENDING',
        }));
      });
    });

    it('passes the combined Needs verification filter consistently to list and summary', async () => {
      const user = userEvent.setup();
      render(<Sales />);
      const filter = await screen.findByLabelText('Verification status');
      vi.clearAllMocks();

      await user.selectOptions(filter, 'needs_verification');

      await waitFor(() => {
        expect(mockSalesList).toHaveBeenCalledWith(expect.objectContaining({ verificationStatus: 'needs_verification' }));
        expect(mockSalesSummary).toHaveBeenCalledWith(expect.objectContaining({ verificationStatus: 'needs_verification' }));
      });
      const listParams = mockSalesList.mock.calls[mockSalesList.mock.calls.length - 1]?.[0];
      const summaryParams = mockSalesSummary.mock.calls[mockSalesSummary.mock.calls.length - 1]?.[0];
      expect(listParams?.verificationStatus).toBe(summaryParams?.verificationStatus);
    });

    it('preserves the verification filter while another filter reloads the data', async () => {
      const user = userEvent.setup();
      render(<Sales />);
      const filter = await screen.findByLabelText('Verification status');
      await user.selectOptions(filter, 'PENDING');
      await waitFor(() => expect(mockSalesSummary).toHaveBeenCalledWith(expect.objectContaining({ verificationStatus: 'PENDING' })));

      const search = screen.getByPlaceholderText('Search sales...');
      await user.type(search, 'gift');

      await waitFor(() => {
        expect(mockSalesSummary).toHaveBeenCalledWith(expect.objectContaining({
          search: 'gift',
          verificationStatus: 'PENDING',
        }));
      }, { timeout: 2000 });
      expect(filter).toHaveValue('PENDING');
    });

    it('ignores stale list and summary responses after rapid status changes', async () => {
      const user = userEvent.setup();
      render(<Sales />);
      const filter = await screen.findByLabelText('Verification status');

      const pendingList = deferred<{ sales: any[]; total: number }>();
      const pendingSummary = deferred<typeof sampleSummary>();
      const manualList = deferred<{ sales: any[]; total: number }>();
      const manualSummary = deferred<typeof sampleSummary>();
      mockSalesList.mockClear();
      mockSalesSummary.mockClear();
      mockSalesList.mockImplementation((params) => {
        if (params?.verificationStatus === 'PENDING') return pendingList.promise;
        if (params?.verificationStatus === 'MANUAL_REVIEW') return manualList.promise;
        return Promise.resolve({ sales: sampleSales, total: 1 });
      });
      mockSalesSummary.mockImplementation((params) => {
        if (params?.verificationStatus === 'PENDING') return pendingSummary.promise;
        if (params?.verificationStatus === 'MANUAL_REVIEW') return manualSummary.promise;
        return Promise.resolve(sampleSummary);
      });

      await user.selectOptions(filter, 'PENDING');
      await waitFor(() => expect(mockSalesList).toHaveBeenCalledWith(expect.objectContaining({ verificationStatus: 'PENDING' })));
      await user.selectOptions(filter, 'MANUAL_REVIEW');
      await waitFor(() => expect(mockSalesList).toHaveBeenCalledWith(expect.objectContaining({ verificationStatus: 'MANUAL_REVIEW' })));

      manualList.resolve({ sales: [saleFor('manual-sale', 'Manual sale', 75)], total: 1 });
      manualSummary.resolve(summaryFor(75));
      await waitFor(() => expect(screen.getByText('Manual sale ×1')).toBeInTheDocument());
      await user.click(screen.getByTitle('Toggle summary'));
      await waitFor(() => expect(screen.getAllByText('£75.00')).not.toHaveLength(0));

      pendingList.resolve({ sales: [saleFor('pending-sale', 'Pending sale', 15)], total: 1 });
      pendingSummary.resolve(summaryFor(15));
      await waitFor(() => expect(screen.getByText('Manual sale ×1')).toBeInTheDocument());
      expect(screen.queryByText('Pending sale ×1')).not.toBeInTheDocument();
      expect(screen.getAllByText('£75.00')).not.toHaveLength(0);
      expect(filter).toHaveValue('MANUAL_REVIEW');
    });

    it('does not append an old Load More response after the verification filter changes', async () => {
      const user = userEvent.setup();
      const moreSales = deferred<{ sales: any[]; total: number }>();
      const initialSale = saleFor('initial-sale', 'Initial sale', 35);
      const filteredSale = saleFor('filtered-sale', 'Filtered sale', 45);
      const staleSale = saleFor('stale-sale', 'Stale sale', 55);
      mockSalesList.mockImplementation((params) => {
        if (params?.offset === 1 && !params?.verificationStatus) return moreSales.promise;
        if (params?.verificationStatus === 'PENDING') return Promise.resolve({ sales: [filteredSale], total: 2 });
        return Promise.resolve({ sales: [initialSale], total: 2 });
      });
      render(<Sales />);
      await waitFor(() => expect(screen.getByText('Initial sale ×1')).toBeInTheDocument());

      await user.click(screen.getByRole('button', { name: 'Load More (1 of 2)' }));
      await waitFor(() => expect(mockSalesList).toHaveBeenCalledWith(expect.objectContaining({ offset: 1 })));

      const filter = screen.getByLabelText('Verification status');
      await user.selectOptions(filter, 'PENDING');
      await waitFor(() => expect(screen.getByText('Filtered sale ×1')).toBeInTheDocument());

      moreSales.resolve({ sales: [staleSale], total: 2 });
      await waitFor(() => expect(screen.getByRole('button', { name: 'Load More (1 of 2)' })).toBeEnabled());
      expect(screen.getByText('Filtered sale ×1')).toBeInTheDocument();
      expect(screen.queryByText('Stale sale ×1')).not.toBeInTheDocument();
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
      mockSalesList.mockResolvedValue({ sales: [saleWithFeeEvidence()], total: 1 });
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
      mockSalesList.mockResolvedValue({
        sales: [saleWithFeeEvidence({
          offsiteAdsAttributed: false,
          offsiteAdsFee: 0,
          vatOnOffsiteAdsFee: 0,
          etsyFeeReconciliationStatus: 'STATEMENT_VERIFIED',
          etsyFeeReconciliationSource: 'ETSY_STATEMENT',
          etsyFeeReconciledAt: '2024-02-01T10:00:00Z',
        })],
        total: 1,
      });
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
      mockSalesList.mockResolvedValue({
        sales: [saleWithFeeEvidence({
          offsiteAdsAttributed: true,
          offsiteAdsFee: 4.8,
          vatOnOffsiteAdsFee: 0.96,
          etsyFeeReconciliationStatus: 'PAYMENT_SYNCED',
          etsyFeeReconciliationSource: 'ETSY_PAYMENT_API',
          etsyFeeReconciledAt: '2024-02-01T10:00:00Z',
        })],
        total: 1,
      });
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
