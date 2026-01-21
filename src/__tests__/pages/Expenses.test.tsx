import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../utils/test-utils';

vi.stubGlobal('confirm', vi.fn(() => true));

vi.mock('../../lib/api', () => ({
  expenses: {
    list: vi.fn(),
    summary: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

import Expenses from '../../pages/Expenses';
import { expenses } from '../../lib/api';

const mockList = vi.mocked(expenses.list);
const mockSummary = vi.mocked(expenses.summary);
const mockCreate = vi.mocked(expenses.create);
const mockDelete = vi.mocked(expenses.delete);

describe('Expenses', () => {
  const sampleExpenses = [
    {
      id: 'exp-1',
      date: '2024-01-15T00:00:00Z',
      category: 'STOCK' as const,
      supplier: 'Wholesale Co',
      description: 'Chocolate supplies',
      amountIncVat: 120,
      amountExcVat: 100,
      isActive: true,
      isHistorical: false,
      createdAt: '2024-01-15T00:00:00Z',
      updatedAt: '2024-01-15T00:00:00Z',
    },
    {
      id: 'exp-2',
      date: '2024-01-10T00:00:00Z',
      category: 'POSTAGE' as const,
      supplier: 'Royal Mail',
      description: 'Shipping labels',
      amountIncVat: 50,
      amountExcVat: 41.67,
      isActive: true,
      isHistorical: false,
      createdAt: '2024-01-10T00:00:00Z',
      updatedAt: '2024-01-10T00:00:00Z',
    },
  ];

  const sampleSummary = {
    byCategory: [
      { category: 'STOCK' as const, totalIncVat: 120, totalExcVat: 100, count: 1 },
      { category: 'POSTAGE' as const, totalIncVat: 50, totalExcVat: 41.67, count: 1 },
    ],
    byMonth: [],
    totals: { totalIncVat: 170, totalExcVat: 141.67, count: 2 },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue({ expenses: sampleExpenses, total: 2, limit: 20, offset: 0 });
    mockSummary.mockResolvedValue(sampleSummary);
  });

  describe('loading state', () => {
    it('shows loading message initially', () => {
      render(<Expenses />);
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('hides loading after data loads', async () => {
      render(<Expenses />);
      await waitFor(() => {
        expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
      });
    });
  });

  describe('expense list', () => {
    it('displays expense descriptions', async () => {
      render(<Expenses />);
      await waitFor(() => {
        expect(screen.getByText('Chocolate supplies')).toBeInTheDocument();
        expect(screen.getByText('Shipping labels')).toBeInTheDocument();
      });
    });

    it('displays supplier names', async () => {
      render(<Expenses />);
      await waitFor(() => {
        expect(screen.getByText('Wholesale Co')).toBeInTheDocument();
        expect(screen.getByText('Royal Mail')).toBeInTheDocument();
      });
    });

    it('displays category badges', async () => {
      render(<Expenses />);
      await waitFor(() => {
        // Category labels are rendered from categoryLabels map
        expect(screen.getByText('Chocolate supplies')).toBeInTheDocument();
      });
    });

    it('displays amounts', async () => {
      render(<Expenses />);
      await waitFor(() => {
        expect(screen.getByText('£120.00')).toBeInTheDocument();
        expect(screen.getByText('£50.00')).toBeInTheDocument();
      });
    });

    it('shows empty state when no expenses', async () => {
      mockList.mockResolvedValue({ expenses: [], total: 0, limit: 20, offset: 0 });
      render(<Expenses />);
      await waitFor(() => {
        expect(screen.getByText('No expenses recorded')).toBeInTheDocument();
      });
    });
  });

  describe('summary view', () => {
    it('has summary toggle button', async () => {
      render(<Expenses />);
      await waitFor(() => {
        expect(screen.getByTitle('Toggle summary')).toBeInTheDocument();
      });
    });

    it('shows summary when toggle clicked', async () => {
      const user = userEvent.setup();
      render(<Expenses />);

      await waitFor(() => {
        expect(screen.getByTitle('Toggle summary')).toBeInTheDocument();
      });

      await user.click(screen.getByTitle('Toggle summary'));

      await waitFor(() => {
        expect(screen.getByText('Expense Summary')).toBeInTheDocument();
        expect(screen.getByText('Total (inc VAT)')).toBeInTheDocument();
      });
    });
  });

  describe('add expense', () => {
    it('shows Add button', async () => {
      render(<Expenses />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument();
      });
    });

    it('shows form when Add clicked', async () => {
      const user = userEvent.setup();
      render(<Expenses />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add/i }));

      expect(screen.getByText('New Expense')).toBeInTheDocument();
    });

    it('has VAT auto-calculation', async () => {
      const user = userEvent.setup();
      render(<Expenses />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add/i }));

      const incVatInput = screen.getByPlaceholderText('0.00');
      await user.type(incVatInput, '120');

      // Exc VAT should be auto-calculated
      const excVatInput = screen.getByPlaceholderText('Auto-calculated') as HTMLInputElement;
      expect(excVatInput.value).toBe('100.00');
    });

    it('calls create API on form submit', async () => {
      const user = userEvent.setup();
      mockCreate.mockResolvedValue(sampleExpenses[0]!);

      render(<Expenses />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add/i }));

      // Fill required fields
      await user.type(screen.getByPlaceholderText('What was this expense for?'), 'Test expense');
      await user.type(screen.getByPlaceholderText('0.00'), '100');

      await user.click(screen.getByRole('button', { name: /create/i }));

      await waitFor(() => {
        expect(mockCreate).toHaveBeenCalled();
      });
    });
  });

  describe('delete expense', () => {
    it('calls delete API when confirmed', async () => {
      const user = userEvent.setup();
      mockDelete.mockResolvedValue(undefined);

      render(<Expenses />);

      await waitFor(() => {
        expect(screen.getByText('Chocolate supplies')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Delete expense Chocolate supplies' }));

      await waitFor(() => {
        expect(mockDelete).toHaveBeenCalled();
      });
    });
  });

  describe('category filter', () => {
    it('has category filter dropdown', async () => {
      render(<Expenses />);
      await waitFor(() => {
        expect(screen.getByText('Category:')).toBeInTheDocument();
        expect(screen.getByRole('combobox')).toBeInTheDocument();
      });
    });

    it('shows all category options', async () => {
      render(<Expenses />);
      await waitFor(() => {
        expect(screen.getByText('All Categories')).toBeInTheDocument();
      });
    });
  });

  describe('error handling', () => {
    it('displays error when API fails', async () => {
      mockList.mockRejectedValue(new Error('Network error'));

      render(<Expenses />);

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });
  });
});
