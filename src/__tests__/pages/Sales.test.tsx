import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../utils/test-utils';

vi.mock('../../lib/api', () => ({
  sales: {
    list: vi.fn(),
    get: vi.fn(),
    summary: vi.fn(),
    preview: vi.fn(),
    create: vi.fn(),
    previewEtsyResolution: vi.fn(),
    applyEtsyResolution: vi.fn(),
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
    getFeeReconciliationSummary: vi.fn(),
  },
  settings: {
    getPostageTiers: vi.fn(),
  },
}));

import Sales from '../../pages/Sales';
import { sales, hampers, etsy, settings } from '../../lib/api';

const mockSalesList = vi.mocked(sales.list);
const mockSalesGet = vi.mocked(sales.get);
const mockSalesSummary = vi.mocked(sales.summary);
const mockSalesPreview = vi.mocked(sales.preview);
const mockPreviewEtsyResolution = vi.mocked(sales.previewEtsyResolution);
const mockApplyEtsyResolution = vi.mocked(sales.applyEtsyResolution);
const mockHampersList = vi.mocked(hampers.list);
const mockEtsyGetStatus = vi.mocked(etsy.getStatus);
const mockEtsyFeeSummary = vi.mocked(etsy.getFeeReconciliationSummary);
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
    window.history.pushState({}, '', '/');
    mockSalesList.mockResolvedValue(listResponse());
    mockSalesSummary.mockResolvedValue(sampleSummary);
    mockHampersList.mockResolvedValue({
      items: sampleHampers,
      pagination: { page: 1, pageSize: 25, totalItems: sampleHampers.length, totalPages: 1 },
    } as any);
    mockSalesGet.mockResolvedValue(sampleSales[0]);
    mockSalesPreview.mockResolvedValue(samplePreview as any);
    mockPreviewEtsyResolution.mockResolvedValue({
      resolution: { type: 'reclassify', channel: 'direct' },
      baseReceiptId: '123456',
      saleIds: ['sale-1'],
      fingerprint: 'a'.repeat(64),
      summary: {
        oldFeesPence: 450,
        newFeesPence: 0,
        feeDeltaPence: -450,
        oldNetRevenuePence: 3050,
        newNetRevenuePence: 3500,
        netRevenueDeltaPence: 450,
        oldMarginPence: 1700,
        newMarginPence: 2150,
        marginDeltaPence: 450,
      },
      rows: [],
      warnings: ['Etsy fees will be removed'],
    } as any);
    mockApplyEtsyResolution.mockResolvedValue({ rows: [{ saleId: 'sale-1' }] } as any);
    mockEtsyGetStatus.mockResolvedValue({ connected: false });
    mockGetPostageTiers.mockResolvedValue([]);
    mockEtsyFeeSummary.mockResolvedValue({ counts: {
      NOT_APPLICABLE: 0,
      PENDING: 1,
      PAYMENT_SYNCED: 0,
      STATEMENT_VERIFIED: 0,
      MANUALLY_VERIFIED: 0,
      MANUAL_REVIEW: 0,
    } });
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
          page: 1,
          pageSize: 25,
          verificationStatus: 'PENDING',
        }), expect.anything());
        expect(mockSalesSummary).toHaveBeenCalledWith(expect.objectContaining({
          verificationStatus: 'PENDING',
        }), expect.anything());
      });
    });

    it('passes the combined Needs verification filter consistently to list and summary', async () => {
      const user = userEvent.setup();
      render(<Sales />);
      const filter = await screen.findByLabelText('Verification status');
      vi.clearAllMocks();

      await user.selectOptions(filter, 'needs_verification');

      await waitFor(() => {
        expect(mockSalesList).toHaveBeenCalledWith(expect.objectContaining({ verificationStatus: 'needs_verification' }), expect.anything());
        expect(mockSalesSummary).toHaveBeenCalledWith(expect.objectContaining({ verificationStatus: 'needs_verification' }), expect.anything());
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
      await waitFor(() => expect(mockSalesSummary).toHaveBeenCalledWith(expect.objectContaining({ verificationStatus: 'PENDING' }), expect.anything()));

      const search = screen.getByPlaceholderText('Search sales...');
      await user.type(search, 'gift');

      await waitFor(() => {
        expect(mockSalesSummary).toHaveBeenCalledWith(expect.objectContaining({
          search: 'gift',
          verificationStatus: 'PENDING',
        }), expect.anything());
      }, { timeout: 2000 });
      expect(filter).toHaveValue('PENDING');
    });

    it('ignores stale list and summary responses after rapid status changes', async () => {
      const user = userEvent.setup();
      render(<Sales />);
      const filter = await screen.findByLabelText('Verification status');

      const pendingList = deferred<ReturnType<typeof listResponse>>();
      const pendingSummary = deferred<typeof sampleSummary>();
      const manualList = deferred<ReturnType<typeof listResponse>>();
      const manualSummary = deferred<typeof sampleSummary>();
      mockSalesList.mockClear();
      mockSalesSummary.mockClear();
      mockSalesList.mockImplementation((params) => {
        if (params?.verificationStatus === 'PENDING') return pendingList.promise;
        if (params?.verificationStatus === 'MANUAL_REVIEW') return manualList.promise;
        return Promise.resolve(listResponse());
      });
      mockSalesSummary.mockImplementation((params) => {
        if (params?.verificationStatus === 'PENDING') return pendingSummary.promise;
        if (params?.verificationStatus === 'MANUAL_REVIEW') return manualSummary.promise;
        return Promise.resolve(sampleSummary);
      });

      await user.selectOptions(filter, 'PENDING');
      await waitFor(() => expect(mockSalesList).toHaveBeenCalledWith(expect.objectContaining({ verificationStatus: 'PENDING' }), expect.anything()));
      await user.selectOptions(filter, 'MANUAL_REVIEW');
      await waitFor(() => expect(mockSalesList).toHaveBeenCalledWith(expect.objectContaining({ verificationStatus: 'MANUAL_REVIEW' }), expect.anything()));

      manualList.resolve(listResponse([saleFor('manual-sale', 'Manual sale', 75)]));
      manualSummary.resolve(summaryFor(75));
      await waitFor(() => expect(screen.getByText('Manual sale ×1')).toBeInTheDocument());
      await user.click(screen.getByTitle('Toggle summary'));
      await waitFor(() => expect(screen.getAllByText('£75.00')).not.toHaveLength(0));

      pendingList.resolve(listResponse([saleFor('pending-sale', 'Pending sale', 15)]));
      pendingSummary.resolve(summaryFor(15));
      await waitFor(() => expect(screen.getByText('Manual sale ×1')).toBeInTheDocument());
      expect(screen.queryByText('Pending sale ×1')).not.toBeInTheDocument();
      expect(screen.getAllByText('£75.00')).not.toHaveLength(0);
      expect(filter).toHaveValue('MANUAL_REVIEW');
    });

    it('does not apply an old page response after the verification filter changes', async () => {
      const user = userEvent.setup();
      const moreSales = deferred<ReturnType<typeof listResponse>>();
      const initialSale = saleFor('initial-sale', 'Initial sale', 35);
      const filteredSale = saleFor('filtered-sale', 'Filtered sale', 45);
      const staleSale = saleFor('stale-sale', 'Stale sale', 55);
      mockSalesList.mockImplementation((params) => {
        if (params?.page === 2 && !params?.verificationStatus) return moreSales.promise;
        if (params?.verificationStatus === 'PENDING') return Promise.resolve(listResponse([filteredSale], 26));
        return Promise.resolve(listResponse([initialSale], 26));
      });
      render(<Sales />);
      await waitFor(() => expect(screen.getByText('Initial sale ×1')).toBeInTheDocument());

      await user.click(screen.getByRole('button', { name: '2' }));
      await waitFor(() => expect(mockSalesList).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }), expect.anything()));

      const filter = screen.getByLabelText('Verification status');
      await user.selectOptions(filter, 'PENDING');
      await waitFor(() => expect(screen.getByText('Filtered sale ×1')).toBeInTheDocument());

      moreSales.resolve(listResponse([staleSale], 2, 2));
      await waitFor(() => expect(screen.getByText('Filtered sale ×1')).toBeInTheDocument());
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

    it('shows the optional manual resolution note in Etsy fee details', async () => {
      const user = userEvent.setup();
      mockSalesList.mockResolvedValue(listResponse([
        saleWithFeeEvidence({ etsyManualResolutionNote: 'Checked against the receipt detail' }),
      ]));
      render(<Sales />);

      await user.click(await screen.findByText(/Chocolate Lovers/));
      expect(screen.getByText('Manual note: Checked against the receipt detail')).toBeInTheDocument();
    });

    it('shows guarded Etsy resolution only for unresolved Etsy sales', async () => {
      const user = userEvent.setup();
      mockSalesList.mockResolvedValue(listResponse([saleWithFeeEvidence()]));
      render(<Sales />);

      await user.click(await screen.findByText(/Chocolate Lovers/));
      expect(screen.getByRole('button', { name: 'Resolve Etsy sale' })).toBeInTheDocument();
    });

    it('hides guarded Etsy resolution for statement/manual verification and non-Etsy channels', async () => {
      const user = userEvent.setup();
      const cases = [
        saleWithFeeEvidence({ etsyFeeReconciliationStatus: 'STATEMENT_VERIFIED' }),
        saleWithFeeEvidence({ etsyFeeReconciliationStatus: 'MANUALLY_VERIFIED' }),
        saleWithFeeEvidence({ saleChannel: 'direct' }),
      ];

      for (const candidate of cases) {
        mockSalesList.mockResolvedValue(listResponse([candidate]));
        const { unmount } = render(<Sales />);
        await user.click(await screen.findByText(/Chocolate Lovers/));
        expect(screen.queryByRole('button', { name: 'Resolve Etsy sale' })).not.toBeInTheDocument();
        unmount();
      }
    });

    it('refreshes filtered list, summary, and expanded detail after resolution', async () => {
      const user = userEvent.setup();
      const unresolved = saleWithFeeEvidence();
      mockSalesList.mockResolvedValue(listResponse([unresolved]));
      mockSalesGet.mockResolvedValue({ ...unresolved, margin: 12 } as any);
      render(<Sales />);

      const filter = await screen.findByLabelText('Verification status');
      await user.selectOptions(filter, 'PENDING');
      await waitFor(() => expect(mockSalesList).toHaveBeenCalledWith(expect.objectContaining({ verificationStatus: 'PENDING' }), expect.anything()));
      await user.click(screen.getByText(/Chocolate Lovers/));
      await user.click(screen.getByRole('button', { name: 'Resolve Etsy sale' }));
      await user.click(screen.getByRole('radio', { name: 'This was not an Etsy sale' }));
      await user.click(screen.getByRole('button', { name: 'Preview resolution' }));
      await screen.findByText('Preview ready');
      await user.click(screen.getByRole('button', { name: 'Confirm resolution' }));

      await waitFor(() => expect(mockSalesGet).toHaveBeenCalledWith('sale-1'));
      expect(mockEtsyFeeSummary).not.toHaveBeenCalled();
      expect(mockSalesList.mock.calls[mockSalesList.mock.calls.length - 1]?.[0]).toEqual(expect.objectContaining({ verificationStatus: 'PENDING' }));
      expect(mockSalesSummary.mock.calls[mockSalesSummary.mock.calls.length - 1]?.[0]).toEqual(expect.objectContaining({ verificationStatus: 'PENDING' }));
      expect(screen.getByText('Etsy fee verification')).toBeInTheDocument();
    });

    it('refreshes the mounted Etsy reconciliation panel counts after resolution', async () => {
      const user = userEvent.setup();
      const unresolved = saleWithFeeEvidence();
      const resolved = { ...unresolved, saleChannel: 'direct', etsyFeeReconciliationStatus: 'NOT_APPLICABLE' };
      mockSalesList.mockResolvedValue(listResponse([unresolved]));
      mockSalesGet.mockResolvedValue(resolved as any);
      mockEtsyGetStatus.mockResolvedValue({ connected: true, shopId: 'shop-1', shopName: 'Savvy Hampers' });
      mockEtsyFeeSummary
        .mockResolvedValueOnce({ counts: {
          NOT_APPLICABLE: 0,
          PENDING: 1,
          PAYMENT_SYNCED: 0,
          STATEMENT_VERIFIED: 0,
          MANUALLY_VERIFIED: 0,
          MANUAL_REVIEW: 0,
        } })
        .mockResolvedValueOnce({ counts: {
          NOT_APPLICABLE: 0,
          PENDING: 0,
          PAYMENT_SYNCED: 0,
          STATEMENT_VERIFIED: 0,
          MANUALLY_VERIFIED: 0,
          MANUAL_REVIEW: 0,
        } });
      render(<Sales />);

      await user.click(await screen.findByRole('button', { name: /etsy sync/i }));
      expect(await screen.findByText('1 Etsy sales need statement verification')).toBeInTheDocument();
      await user.click(screen.getByText(/Chocolate Lovers/));
      await user.click(screen.getByRole('button', { name: 'Resolve Etsy sale' }));
      await user.click(screen.getByRole('radio', { name: 'This was not an Etsy sale' }));
      await user.click(screen.getByRole('button', { name: 'Preview resolution' }));
      await screen.findByText('Preview ready');
      await user.click(screen.getByRole('button', { name: 'Confirm resolution' }));

      expect(await screen.findByText('0 Etsy sales need statement verification')).toBeInTheDocument();
      const reconciliationPanel = screen.getByRole('heading', { name: 'Etsy fee reconciliation' }).closest('section');
      expect(reconciliationPanel).not.toBeNull();
      expect(within(reconciliationPanel!).getByText('Pending').parentElement).toHaveTextContent('0');
    });

    it('preserves an expanded loaded sale beyond the refreshed first page', async () => {
      const user = userEvent.setup();
      const firstPage = Array.from({ length: 25 }, (_, index) => saleFor(`sale-${index + 1}`, `Sale ${index + 1}`, 35));
      const loadedSale = saleWithFeeEvidence({
        id: 'sale-26',
        lines: [{
          ...sampleSales[0].lines[0],
          hamper: { ...sampleSales[0].lines[0].hamper, name: 'Sale 21' },
        }],
      });
      const refreshedSale = { ...loadedSale, margin: 12 };

      mockSalesList.mockImplementation(async (params) => {
        if (params?.page === 2) return listResponse([refreshedSale], 26, 2);
        return listResponse(firstPage, 26);
      });
      mockSalesGet.mockResolvedValue(refreshedSale as any);
      mockApplyEtsyResolution.mockResolvedValue({ rows: [{ saleId: loadedSale.id }] } as any);
      render(<Sales />);

      await waitFor(() => expect(screen.getByText('Sale 1 ×1')).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: '2' }));
      await waitFor(() => expect(screen.getByText('Sale 21 ×1')).toBeInTheDocument());
      await user.click(screen.getByText('Sale 21 ×1'));
      await user.click(screen.getByRole('button', { name: 'Resolve Etsy sale' }));
      await user.click(screen.getByRole('radio', { name: 'This was not an Etsy sale' }));
      await user.click(screen.getByRole('button', { name: 'Preview resolution' }));
      await screen.findByText('Preview ready');
      await user.click(screen.getByRole('button', { name: 'Confirm resolution' }));

      await waitFor(() => expect(mockSalesGet).toHaveBeenCalledWith('sale-26'));
      expect(screen.getByText('Sale 21 ×1')).toBeInTheDocument();
      expect(screen.getByText('Etsy fee verification')).toBeInTheDocument();
      expect(screen.getByText('Net Margin')).toBeInTheDocument();
    });

    it('refreshes and removes an affected page-two sibling under the active status filter', async () => {
      const user = userEvent.setup();
      const firstPage = Array.from({ length: 25 }, (_, index) => saleFor(`sale-${index + 1}`, `Sale ${index + 1}`, 35));
      const target = saleWithFeeEvidence({
        id: 'sale-26',
        lines: [{
          ...sampleSales[0].lines[0],
          hamper: { ...sampleSales[0].lines[0].hamper, name: 'Sale 21' },
        }],
      });
      const sibling = saleWithFeeEvidence({
        id: 'sale-27',
        lines: [{
          ...sampleSales[0].lines[0],
          hamper: { ...sampleSales[0].lines[0].hamper, name: 'Sale 22' },
        }],
      });
      const resolvedTarget = { ...target, saleChannel: 'direct', etsyFeeReconciliationStatus: 'NOT_APPLICABLE' };
      const resolvedSibling = { ...sibling, saleChannel: 'direct', etsyFeeReconciliationStatus: 'NOT_APPLICABLE' };
      let resolutionApplied = false;

      mockSalesList.mockImplementation(async (params) => {
        if (params?.page === 2) {
          return resolutionApplied
            ? listResponse([], 25, 2)
            : listResponse([target, sibling], 27, 2);
        }
        return listResponse(firstPage, 27);
      });
      mockSalesGet.mockImplementation(async (id) => {
        if (id === target.id) return resolvedTarget as any;
        if (id === sibling.id) return resolvedSibling as any;
        return target as any;
      });
      mockApplyEtsyResolution.mockImplementation(async () => {
        resolutionApplied = true;
        return {
          applied: true,
          rows: [{ saleId: target.id }, { saleId: sibling.id }],
        } as any;
      });
      render(<Sales />);

      const filter = await screen.findByLabelText('Verification status');
      await user.selectOptions(filter, 'PENDING');
      await waitFor(() => expect(mockSalesList).toHaveBeenCalledWith(expect.objectContaining({ verificationStatus: 'PENDING' }), expect.anything()));
      await user.click(screen.getByRole('button', { name: '2' }));
      await waitFor(() => expect(screen.getByText('Sale 22 ×1')).toBeInTheDocument());
      await user.click(screen.getByText('Sale 21 ×1'));
      await user.click(screen.getByRole('button', { name: 'Resolve Etsy sale' }));
      await user.click(screen.getByRole('radio', { name: 'This was not an Etsy sale' }));
      await user.click(screen.getByRole('button', { name: 'Preview resolution' }));
      await screen.findByText('Preview ready');
      await user.click(screen.getByRole('button', { name: 'Confirm resolution' }));

      await waitFor(() => expect(mockSalesGet).toHaveBeenCalledWith(sibling.id));
      expect(screen.queryByText('Sale 21 ×1')).not.toBeInTheDocument();
      expect(screen.queryByText('Sale 22 ×1')).not.toBeInTheDocument();
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

    it('has a searchable Hamper lookup', async () => {
      const user = userEvent.setup();
      render(<Sales />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /record sale/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /record sale/i }));

      expect(screen.getByText('Items')).toBeInTheDocument();
      expect(screen.getByRole('searchbox', { name: 'Search hampers' })).toBeInTheDocument();
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

      const hamperSearch = screen.getByRole('searchbox', { name: 'Search hampers' });
      await user.click(hamperSearch);
      await user.click(await screen.findByRole('button', { name: 'Select Chocolate Lovers' }));

      await waitFor(() => {
        expect(mockSalesPreview).toHaveBeenCalledWith(expect.objectContaining({
          lines: [expect.objectContaining({ hamperId: 'ham-1' })],
        }));
      });
    });

    it('reaches Hampers beyond the first 100 through local numbered pages', async () => {
      const target = { ...sampleHampers[0]!, id: 'ham-101', name: 'Hamper 101' };
      mockHampersList.mockImplementation((params) => Promise.resolve({
        items: params?.page === 2 ? [target] : sampleHampers,
        pagination: { page: params?.page ?? 1, pageSize: 25, totalItems: 101, totalPages: 5 },
      } as any));
      const user = userEvent.setup();
      render(<Sales />);

      await user.click(await screen.findByRole('button', { name: /record sale/i }));
      await user.click(screen.getByRole('searchbox', { name: 'Search hampers' }));
      await waitFor(() => expect(mockHampersList).toHaveBeenCalledWith(
        { page: 1, pageSize: 25, search: undefined, hideEtsyHidden: false, sort: 'name-asc' },
        { signal: expect.any(AbortSignal) },
      ));
      await user.click(await screen.findByRole('button', { name: '2' }));
      await user.click(await screen.findByRole('button', { name: 'Select Hamper 101' }));

      expect(screen.getByText('Selected: Hamper 101')).toBeInTheDocument();
      expect(window.location.search).toBe('');
    });

    it('server-searches all eligible Hampers without changing the Sales URL', async () => {
      const target = { ...sampleHampers[0]!, id: 'ham-rare', name: 'Rare Hamper' };
      mockHampersList.mockImplementation((params) => Promise.resolve({
        items: params?.search === 'rare' ? [target] : sampleHampers,
        pagination: { page: 1, pageSize: 25, totalItems: params?.search === 'rare' ? 1 : 101, totalPages: params?.search === 'rare' ? 1 : 5 },
      } as any));
      const user = userEvent.setup();
      render(<Sales />);

      await user.click(await screen.findByRole('button', { name: /record sale/i }));
      const search = screen.getByRole('searchbox', { name: 'Search hampers' });
      await user.click(search);
      await user.type(search, 'rare');

      await waitFor(() => expect(mockHampersList).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, pageSize: 25, search: 'rare' }),
        { signal: expect.any(AbortSignal) },
      ));
      await user.click(await screen.findByRole('button', { name: 'Select Rare Hamper' }));
      expect(screen.getByText('Selected: Rare Hamper')).toBeInTheDocument();
      expect(window.location.search).toBe('');
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
      expect(mockHampersList).not.toHaveBeenCalled();
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

    it('aborts an obsolete summary request when filters change', async () => {
      const signals: AbortSignal[] = [];
      mockSalesSummary.mockImplementation((_params, options) => {
        if (options?.signal) signals.push(options.signal);
        return Promise.resolve(sampleSummary);
      });
      render(<Sales />);

      await waitFor(() => expect(signals).toHaveLength(1));
      const startDateInput = document.querySelector('input[type="date"]');
      expect(startDateInput).not.toBeNull();
      fireEvent.change(startDateInput!, { target: { value: '2026-08-01' } });

      await waitFor(() => expect(signals).toHaveLength(2));
      expect(signals[0]?.aborted).toBe(true);
      expect(signals[1]?.aborted).toBe(false);
    });

    it('replaces Load More with a visible result range', async () => {
      mockSalesList.mockResolvedValue(listResponse(sampleSales, 51));
      render(<Sales />);

      await waitFor(() => expect(screen.getByText('Showing 1–25 of 51')).toBeInTheDocument());

      expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
    });

    it('corrects a stale high page with one request for the final page', async () => {
      window.history.pushState({}, '', '/sales?page=999&pageSize=25');
      mockSalesList.mockImplementation((params) => {
        if (params?.page === 999) return Promise.resolve(listResponse([], 51, 999));
        if (params?.page === 3) return Promise.resolve(listResponse(sampleSales, 51, 3));
        return Promise.reject(new Error(`Unexpected page ${params?.page}`));
      });

      render(<Sales />);

      await waitFor(() => expect(screen.getByText(/Chocolate Lovers/)).toBeInTheDocument());
      expect(mockSalesList).toHaveBeenCalledTimes(2);
      expect(mockSalesList.mock.calls.map(([params]) => params?.page)).toEqual([999, 3]);
      expect(new URLSearchParams(window.location.search).get('page')).toBe('3');
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
