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
  },
}));

import Settings from '../../pages/Settings';
import { settings } from '../../lib/api';

const mockGetEtsyFees = vi.mocked(settings.getEtsyFees);
const mockCreateEtsyFees = vi.mocked(settings.createEtsyFees);
const mockGetPackagingOverhead = vi.mocked(settings.getPackagingOverhead);
const mockCreatePackagingOverhead = vi.mocked(settings.createPackagingOverhead);
const mockDeletePackagingOverhead = vi.mocked(settings.deletePackagingOverhead);

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
        const link = screen.getByRole('link', { name: /products/i });
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
      await user.click(screen.getByRole('button', { name: 'Add' }));

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
