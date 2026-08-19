import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../utils/test-utils';

vi.stubGlobal('confirm', vi.fn(() => true));

vi.mock('../../lib/api', () => ({
  settings: {
    getEtsyFees: vi.fn(),
    createEtsyFees: vi.fn(),
    getPackagingOverhead: vi.fn(),
    createPackagingOverhead: vi.fn(),
    deletePackagingOverhead: vi.fn(),
    getPostageTiers: vi.fn(),
    createPostageTier: vi.fn(),
    updatePostageTier: vi.fn(),
    deletePostageTier: vi.fn(),
    restorePostageTier: vi.fn(),
  },
  etsy: {
    getAccounts: vi.fn(),
    initiateAuth: vi.fn(),
    setDefaultAccount: vi.fn(),
    removeAccount: vi.fn(),
  },
  suppliers: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

import Settings from '../../pages/Settings';
import { settings, etsy, suppliers } from '../../lib/api';

const mockGetEtsyFees = vi.mocked(settings.getEtsyFees);
const mockCreateEtsyFees = vi.mocked(settings.createEtsyFees);
const mockGetPackagingOverhead = vi.mocked(settings.getPackagingOverhead);
const mockCreatePackagingOverhead = vi.mocked(settings.createPackagingOverhead);
const mockDeletePackagingOverhead = vi.mocked(settings.deletePackagingOverhead);
const mockGetPostageTiers = vi.mocked(settings.getPostageTiers);
const mockCreatePostageTier = vi.mocked(settings.createPostageTier);
const mockUpdatePostageTier = vi.mocked(settings.updatePostageTier);
const mockDeletePostageTier = vi.mocked(settings.deletePostageTier);
const mockRestorePostageTier = vi.mocked(settings.restorePostageTier);
const mockGetAccounts = vi.mocked(etsy.getAccounts);
const mockSuppliersList = vi.mocked(suppliers.list);
const mockSuppliersCreate = vi.mocked(suppliers.create);

const renderSettingsAt = (search = '') => {
  window.history.replaceState({}, '', `/settings${search}`);
  return render(<Settings />);
};

const renderSettings = (section: string) => renderSettingsAt(`?section=${section}`);

describe('Settings', () => {
  const sampleEtsyFee = {
    id: 'fee-1',
    name: 'UK Etsy Fees 2024',
    transactionFee: 0.065,
    regulatoryFee: 0.0032,
    paymentFeePercent: 0.04,
    paymentFeeFixed: 0.2,
    vatRate: 0.2,
    listingFee: 0.15,
    isActive: true,
  };

  const sampleOverhead = {
    id: 'pkg-1',
    name: 'Gift Box',
    costPerOrder: 1.5,
    isActive: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/settings');
    mockGetEtsyFees.mockResolvedValue([sampleEtsyFee] as any);
    mockGetPackagingOverhead.mockResolvedValue({
      overheads: [sampleOverhead],
      totalPerOrder: 1.5,
    } as any);
    mockGetAccounts.mockResolvedValue({ accounts: [] } as any);
    mockGetPostageTiers.mockResolvedValue([]);
    mockUpdatePostageTier.mockResolvedValue({} as any);
    mockDeletePostageTier.mockResolvedValue(undefined);
    mockRestorePostageTier.mockResolvedValue({} as any);
    mockSuppliersList.mockResolvedValue([]);
  });

  describe('loading state', () => {
    it('shows loading message initially', () => {
      render(<Settings />);
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('hides loading after data loads', async () => {
      render(<Settings />);
      await waitFor(() => {
        expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
      });
    });
  });

  describe('navigation links', () => {
    it('has link to Categories', async () => {
      render(<Settings />);
      await waitFor(() => {
        const link = screen.getByRole('link', { name: /categories/i });
        expect(link).toHaveAttribute('href', '/categories');
      });
    });

    it('has link to Products', async () => {
      render(<Settings />);
      await waitFor(() => {
        const link = screen.getByRole('link', { name: /manage products and their barcodes/i });
        expect(link).toHaveAttribute('href', '/products');
      });
    });

    it('has link to Expenses', async () => {
      render(<Settings />);
      await waitFor(() => {
        const link = screen.getByRole('link', { name: /business expenses/i });
        expect(link).toHaveAttribute('href', '/expenses');
      });
    });
  });

  describe('section navigation boundaries', () => {
    it('keeps every existing More link destination unchanged', async () => {
      renderSettingsAt();

      await waitFor(() => {
        const expectedLinks = [
          ['Sales', '/sales'],
          ['Analytics', '/analytics'],
          ['Shopping List', '/shopping-list'],
          ['Categories', '/categories'],
          ['Products', '/products'],
          ['Business Expenses', '/expenses'],
        ] as const;

        for (const [name, destination] of expectedLinks) {
          expect(screen.getByRole('link', { name: new RegExp(`^${name}\\b`, 'i') })).toHaveAttribute('href', destination);
        }
      });
    });

    it('starts on the Suppliers section when the URL requests it', async () => {
      renderSettings('suppliers');

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Suppliers / Shops' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Suppliers' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.queryByText('Postage Tiers')).not.toBeInTheDocument();
      });
    });

    it('updates the URL and only renders the selected section panel', async () => {
      const user = userEvent.setup();
      renderSettingsAt('?section=postage&view=all');

      await waitFor(() => {
        expect(screen.getByText('Postage Tiers')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('tab', { name: 'Packaging' }));

      await waitFor(() => {
        const search = new URLSearchParams(window.location.search);
        expect(search.get('section')).toBe('packaging');
        expect(search.get('view')).toBe('all');
        expect(screen.getByText('Packaging Overhead')).toBeInTheDocument();
        expect(screen.queryByText('Postage Tiers')).not.toBeInTheDocument();
      });
    });

    it('falls back to Postage for an unknown URL section', async () => {
      renderSettingsAt('?section=unknown');

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: 'Postage' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByText('Postage Tiers')).toBeInTheDocument();
      });
    });

    it('keeps Etsy Access Management outside the redesigned section panel', async () => {
      renderSettingsAt();

      await waitFor(() => {
        const accessHeading = screen.getByRole('heading', { name: 'Etsy Access Management' });
        const tablist = screen.getByRole('tablist');

        expect(accessHeading.closest('[role="tabpanel"]')).toBeNull();
        expect(tablist.compareDocumentPosition(accessHeading) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
      });
    });
  });

  describe('Etsy fees section', () => {
    it('displays Etsy Fees header', async () => {
      renderSettings('etsy-fees');
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Etsy Fees' })).toBeInTheDocument();
      });
    });

    it('displays configured fee name', async () => {
      renderSettings('etsy-fees');
      await waitFor(() => {
        expect(screen.getByText('UK Etsy Fees 2024')).toBeInTheDocument();
      });
    });

    it('displays fee percentages', async () => {
      renderSettings('etsy-fees');
      await waitFor(() => {
        expect(screen.getByText('6.5%')).toBeInTheDocument(); // Transaction fee
        expect(screen.getByText('0.32%')).toBeInTheDocument(); // Regulatory fee
      });
    });

    it('shows setup prompt when no fees configured', async () => {
      mockGetEtsyFees.mockResolvedValue([]);

      renderSettings('etsy-fees');

      await waitFor(() => {
        expect(screen.getByText(/no etsy fee configuration found/i)).toBeInTheDocument();
      });
    });

    it('has button to use default fees when none configured', async () => {
      mockGetEtsyFees.mockResolvedValue([]);

      renderSettings('etsy-fees');

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /use default uk etsy fees/i })).toBeInTheDocument();
      });
    });

    it('calls createEtsyFees when default fees button clicked', async () => {
      const user = userEvent.setup();
      mockGetEtsyFees.mockResolvedValue([]);
      mockCreateEtsyFees.mockResolvedValue(sampleEtsyFee as any);

      renderSettings('etsy-fees');

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /use default uk etsy fees/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /use default uk etsy fees/i }));

      await waitFor(() => {
        expect(mockCreateEtsyFees).toHaveBeenCalled();
      });
    });
  });

  describe('Packaging overhead section', () => {
    it('displays Packaging Overhead header', async () => {
      renderSettings('packaging');
      await waitFor(() => {
        expect(screen.getByText('Packaging Overhead')).toBeInTheDocument();
      });
    });

    it('displays existing overhead items', async () => {
      renderSettings('packaging');
      await waitFor(() => {
        expect(screen.getByText('Gift Box')).toBeInTheDocument();
      });
    });

    it('displays total per order', async () => {
      renderSettings('packaging');
      await waitFor(() => {
        expect(screen.getByText('Total per order')).toBeInTheDocument();
      });
    });

    it('has input for adding new overhead', async () => {
      renderSettings('packaging');
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Item name (e.g., Tape)')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Cost')).toBeInTheDocument();
      });
    });

    it('calls createPackagingOverhead when Add clicked', async () => {
      const user = userEvent.setup();
      mockCreatePackagingOverhead.mockResolvedValue(sampleOverhead as any);

      renderSettings('packaging');

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Item name (e.g., Tape)')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('Item name (e.g., Tape)'), 'Bubble Wrap');
      await user.type(screen.getByPlaceholderText('Cost'), '0.50');
      await user.click(screen.getAllByRole('button', { name: 'Add' })[0]!);

      await waitFor(() => {
        expect(mockCreatePackagingOverhead).toHaveBeenCalledWith({
          name: 'Bubble Wrap',
          costPerOrder: 0.5,
        });
      });
    });

    it('calls deletePackagingOverhead when Remove clicked', async () => {
      const user = userEvent.setup();
      mockDeletePackagingOverhead.mockResolvedValue(undefined);

      renderSettings('packaging');

      await waitFor(() => {
        expect(screen.getByText('Gift Box')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Remove' }));

      await waitFor(() => {
        expect(mockDeletePackagingOverhead).toHaveBeenCalledWith('pkg-1');
      });
    });
  });

  describe('postage tiers section', () => {
    const samplePostageTier = {
      id: 'pt1',
      etsyCharge: 5.00,
      actualCost: 5.05,
      label: 'Standard',
      isActive: true,
      createdAt: '2024-01-01T00:00:00Z',
    };

    it('renders postage tiers section', async () => {
      renderSettings('postage');
      await waitFor(() => {
        expect(screen.getByText('Postage Tiers')).toBeInTheDocument();
      });
    });

    it('loads active and archived postage tiers for the editor', async () => {
      renderSettings('postage');

      await waitFor(() => {
        expect(mockGetPostageTiers).toHaveBeenCalledWith({ includeArchived: true });
      });
    });

    it('displays existing tiers', async () => {
      mockGetPostageTiers.mockResolvedValue([samplePostageTier] as any);

      renderSettings('postage');

      await waitFor(() => {
        expect(screen.getByText(/£5\.00/)).toBeInTheDocument();
        expect(screen.getByText(/£5\.05/)).toBeInTheDocument();
      });
    });

    it('can add a new postage tier', async () => {
      const user = userEvent.setup();
      mockCreatePostageTier.mockResolvedValue({ item: samplePostageTier, outcome: 'created' } as any);

      renderSettings('postage');

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Etsy charge')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('Etsy charge'), '5.00');
      await user.type(screen.getByPlaceholderText('Actual cost'), '5.05');

      await user.click(screen.getByRole('button', { name: 'Add' }));

      await waitFor(() => {
        expect(mockCreatePostageTier).toHaveBeenCalledWith({
          etsyCharge: 5,
          actualCost: 5.05,
          label: undefined,
        });
      });
    });

    it('reloads after postage save without showing the page-wide loading state', async () => {
      const user = userEvent.setup();
      mockGetPostageTiers.mockResolvedValue([samplePostageTier] as any);
      mockUpdatePostageTier.mockResolvedValue(samplePostageTier as any);

      renderSettings('postage');

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Edit £5.00 tier' })).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: 'Edit £5.00 tier' }));
      await user.click(screen.getByRole('button', { name: 'Save £5.00 tier' }));

      await waitFor(() => {
        expect(mockUpdatePostageTier).toHaveBeenCalledWith('pt1', {
          etsyCharge: 5,
          actualCost: 5.05,
          label: 'Standard',
        });
        expect(mockGetPostageTiers).toHaveBeenCalledTimes(2);
      });
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });
  });

  describe('suppliers section', () => {
    const sampleSupplier = {
      id: 's1',
      name: 'Home Bargains',
      isActive: true,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    it('renders suppliers section', async () => {
      renderSettings('suppliers');
      await waitFor(() => {
        expect(screen.getByText('Suppliers / Shops')).toBeInTheDocument();
      });
    });

    it('displays existing suppliers', async () => {
      mockSuppliersList.mockResolvedValue([sampleSupplier] as any);

      renderSettings('suppliers');

      await waitFor(() => {
        expect(screen.getByText('Home Bargains')).toBeInTheDocument();
      });
    });

    it('can add a new supplier', async () => {
      const user = userEvent.setup();
      mockSuppliersCreate.mockResolvedValue(sampleSupplier as any);

      renderSettings('suppliers');

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Shop name (e.g., Home Bargains)')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('Shop name (e.g., Home Bargains)'), 'Home Bargains');

      await user.click(screen.getByRole('button', { name: 'Add' }));

      await waitFor(() => {
        expect(mockSuppliersCreate).toHaveBeenCalledWith({ name: 'Home Bargains' });
      });
    });
  });

  describe('error handling', () => {
    it('displays error when API fails', async () => {
      mockGetEtsyFees.mockRejectedValue(new Error('Network error'));

      render(<Settings />);

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });
  });
});
