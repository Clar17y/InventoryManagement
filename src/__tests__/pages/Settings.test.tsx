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
    deletePostageTier: vi.fn(),
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
const mockGetAccounts = vi.mocked(etsy.getAccounts);
const mockSuppliersList = vi.mocked(suppliers.list);
const mockSuppliersCreate = vi.mocked(suppliers.create);

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
    mockGetEtsyFees.mockResolvedValue([sampleEtsyFee] as any);
    mockGetPackagingOverhead.mockResolvedValue({
      overheads: [sampleOverhead],
      totalPerOrder: 1.5,
    } as any);
    mockGetAccounts.mockResolvedValue({ accounts: [] } as any);
    mockGetPostageTiers.mockResolvedValue([]);
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

  describe('Etsy fees section', () => {
    it('displays Etsy Fees header', async () => {
      render(<Settings />);
      await waitFor(() => {
        expect(screen.getByText('Etsy Fees')).toBeInTheDocument();
      });
    });

    it('displays configured fee name', async () => {
      render(<Settings />);
      await waitFor(() => {
        expect(screen.getByText('UK Etsy Fees 2024')).toBeInTheDocument();
      });
    });

    it('displays fee percentages', async () => {
      render(<Settings />);
      await waitFor(() => {
        expect(screen.getByText('6.5%')).toBeInTheDocument(); // Transaction fee
        expect(screen.getByText('0.32%')).toBeInTheDocument(); // Regulatory fee
      });
    });

    it('shows setup prompt when no fees configured', async () => {
      mockGetEtsyFees.mockResolvedValue([]);

      render(<Settings />);

      await waitFor(() => {
        expect(screen.getByText(/no etsy fee configuration found/i)).toBeInTheDocument();
      });
    });

    it('has button to use default fees when none configured', async () => {
      mockGetEtsyFees.mockResolvedValue([]);

      render(<Settings />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /use default uk etsy fees/i })).toBeInTheDocument();
      });
    });

    it('calls createEtsyFees when default fees button clicked', async () => {
      const user = userEvent.setup();
      mockGetEtsyFees.mockResolvedValue([]);
      mockCreateEtsyFees.mockResolvedValue(sampleEtsyFee as any);

      render(<Settings />);

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
      render(<Settings />);
      await waitFor(() => {
        expect(screen.getByText('Packaging Overhead')).toBeInTheDocument();
      });
    });

    it('displays existing overhead items', async () => {
      render(<Settings />);
      await waitFor(() => {
        expect(screen.getByText('Gift Box')).toBeInTheDocument();
      });
    });

    it('displays total per order', async () => {
      render(<Settings />);
      await waitFor(() => {
        expect(screen.getByText('Total per order')).toBeInTheDocument();
      });
    });

    it('has input for adding new overhead', async () => {
      render(<Settings />);
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Item name (e.g., Tape)')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Cost')).toBeInTheDocument();
      });
    });

    it('calls createPackagingOverhead when Add clicked', async () => {
      const user = userEvent.setup();
      mockCreatePackagingOverhead.mockResolvedValue(sampleOverhead as any);

      render(<Settings />);

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

      render(<Settings />);

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
      render(<Settings />);
      await waitFor(() => {
        expect(screen.getByText('Postage Tiers')).toBeInTheDocument();
      });
    });

    it('displays existing tiers', async () => {
      mockGetPostageTiers.mockResolvedValue([samplePostageTier] as any);

      render(<Settings />);

      await waitFor(() => {
        expect(screen.getByText(/£5\.00/)).toBeInTheDocument();
        expect(screen.getByText(/£5\.05/)).toBeInTheDocument();
      });
    });

    it('can add a new postage tier', async () => {
      const user = userEvent.setup();
      mockCreatePostageTier.mockResolvedValue(samplePostageTier as any);

      render(<Settings />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Etsy charge')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('Etsy charge'), '5.00');
      await user.type(screen.getByPlaceholderText('Actual cost'), '5.05');

      // Find the Add button within the postage tiers section
      const addButtons = screen.getAllByRole('button', { name: 'Add' });
      // Postage tiers Add button is after packaging overhead Add button
      await user.click(addButtons[1]!);

      await waitFor(() => {
        expect(mockCreatePostageTier).toHaveBeenCalledWith({
          etsyCharge: 5,
          actualCost: 5.05,
        });
      });
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
      render(<Settings />);
      await waitFor(() => {
        expect(screen.getByText('Suppliers / Shops')).toBeInTheDocument();
      });
    });

    it('displays existing suppliers', async () => {
      mockSuppliersList.mockResolvedValue([sampleSupplier] as any);

      render(<Settings />);

      await waitFor(() => {
        expect(screen.getByText('Home Bargains')).toBeInTheDocument();
      });
    });

    it('can add a new supplier', async () => {
      const user = userEvent.setup();
      mockSuppliersCreate.mockResolvedValue(sampleSupplier as any);

      render(<Settings />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Shop name (e.g., Home Bargains)')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('Shop name (e.g., Home Bargains)'), 'Home Bargains');

      // Find the Add button in the suppliers section
      const addButtons = screen.getAllByRole('button', { name: 'Add' });
      // Suppliers Add button is after packaging overhead and postage tiers Add buttons
      await user.click(addButtons[2]!);

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
