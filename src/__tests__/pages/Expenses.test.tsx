import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
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

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

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

  const listResponse = (
    items = sampleExpenses,
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
    window.history.pushState({}, '', '/');
    mockList.mockResolvedValue(listResponse());
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
      mockList.mockResolvedValue(listResponse([], 0));
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

    it('allows independent VAT field editing', async () => {
      const user = userEvent.setup();
      render(<Expenses />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add/i }));

      const [incVatInput, excVatInput] = screen.getAllByPlaceholderText('0.00') as HTMLInputElement[];

      // Typing inc VAT does NOT auto-fill exc VAT
      await user.type(incVatInput!, '120');
      expect(incVatInput!.value).toBe('120');
      expect(excVatInput!.value).toBe('');

      // Exc VAT can be typed independently
      await user.type(excVatInput!, '100');
      expect(excVatInput!.value).toBe('100');
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
      await user.type(screen.getAllByPlaceholderText('0.00')[0]!, '100');

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
        expect(screen.getByRole('combobox', { name: 'Expense category' })).toBeInTheDocument();
      });
    });

    it('shows all category options', async () => {
      render(<Expenses />);
      await waitFor(() => {
        expect(screen.getByText('All Categories')).toBeInTheDocument();
      });
    });
  });

  describe('pagination request lifecycle', () => {
    it('retains and dims the previous row while a new page is pending', async () => {
      const pageTwo = createDeferred<ReturnType<typeof listResponse>>();
      const pageTwoExpense = { ...sampleExpenses[0]!, id: 'exp-page-two', description: 'Page two expense' };
      mockList.mockImplementation((params) => {
        if (params?.page === 2) return pageTwo.promise;
        return Promise.resolve(listResponse(sampleExpenses, 51));
      });
      const user = userEvent.setup();
      render(<Expenses />);

      await waitFor(() => expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: '2' }));

      expect(screen.getByText('Chocolate supplies')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('Updating results…');
      expect(screen.getByText('Chocolate supplies').closest('.relative')).toHaveClass('opacity-60');

      pageTwo.resolve(listResponse([pageTwoExpense], 51, 2));
      await waitFor(() => expect(screen.getByText('Page two expense')).toBeInTheDocument());
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('keeps the old row and retries a rejected page request', async () => {
      let pageTwoAttempts = 0;
      const pageTwoExpense = { ...sampleExpenses[0]!, id: 'exp-page-two', description: 'Page two expense' };
      mockList.mockImplementation((params) => {
        if (params?.page === 2) {
          pageTwoAttempts += 1;
          return pageTwoAttempts === 1
            ? Promise.reject(new Error('Page failed'))
            : Promise.resolve(listResponse([pageTwoExpense], 51, 2));
        }
        return Promise.resolve(listResponse(sampleExpenses, 51));
      });
      const user = userEvent.setup();
      render(<Expenses />);

      await waitFor(() => expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: '2' }));

      await waitFor(() => expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument());
      expect(screen.getByText('Chocolate supplies')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent('Page failed');

      await user.click(screen.getByRole('button', { name: 'Retry' }));
      await waitFor(() => expect(screen.getByText('Page two expense')).toBeInTheDocument());
      expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    });

    it('does not let a stale filter response replace the latest response', async () => {
      const staleA = { ...sampleExpenses[0]!, id: 'exp-stale-a', description: 'Stale A' };
      const staleB = { ...sampleExpenses[0]!, id: 'exp-stale-b', description: 'Stale B' };
      const requestA = createDeferred<ReturnType<typeof listResponse>>();
      const requestB = createDeferred<ReturnType<typeof listResponse>>();
      mockList.mockImplementation((params) => {
        if (params?.startDate?.startsWith('2026-08-01')) return requestA.promise;
        if (params?.startDate?.startsWith('2026-08-02')) return requestB.promise;
        return Promise.resolve(listResponse(sampleExpenses));
      });
      render(<Expenses />);

      await waitFor(() => expect(screen.getByText('Chocolate supplies')).toBeInTheDocument());
      const startDateInput = document.querySelector('input[type="date"]');
      expect(startDateInput).not.toBeNull();
      fireEvent.change(startDateInput!, { target: { value: '2026-08-01' } });
      fireEvent.change(startDateInput!, { target: { value: '2026-08-02' } });

      await waitFor(() => expect(mockList).toHaveBeenCalledTimes(3));
      requestB.resolve(listResponse([staleB]));
      await waitFor(() => expect(screen.getByText('Stale B')).toBeInTheDocument());
      requestA.resolve(listResponse([staleA]));

      await waitFor(() => expect(screen.queryByText('Stale A')).not.toBeInTheDocument());
      expect(screen.getByText('Stale B')).toBeInTheDocument();
    });

    it('resets to page one when the category changes', async () => {
      window.history.pushState({}, '', '/?page=3&pageSize=50');
      mockList.mockResolvedValue(listResponse(sampleExpenses, 101, 3, 50));
      const user = userEvent.setup();
      render(<Expenses />);

      await waitFor(() => expect(mockList).toHaveBeenCalled());
      await user.selectOptions(screen.getByRole('combobox', { name: 'Expense category' }), 'STOCK');

      await waitFor(() => expect(mockList.mock.calls.some(([params]) => (
        params?.page === 1 && params?.pageSize === 50 && params?.category === 'STOCK'
      ))).toBe(true));
    });

    it('resets to page one when the date changes', async () => {
      window.history.pushState({}, '', '/?page=3&pageSize=50');
      mockList.mockResolvedValue(listResponse(sampleExpenses, 101, 3, 50));
      render(<Expenses />);

      await waitFor(() => expect(mockList).toHaveBeenCalled());
      const startDateInput = document.querySelector('input[type="date"]');
      expect(startDateInput).not.toBeNull();
      fireEvent.change(startDateInput!, { target: { value: '2026-08-01' } });

      await waitFor(() => expect(mockList.mock.calls.some(([params]) => (
        params?.page === 1 && params?.pageSize === 50 && params?.startDate
      ))).toBe(true));
    });

    it('resets to page one when the search changes', async () => {
      window.history.pushState({}, '', '/?page=3&pageSize=50');
      mockList.mockResolvedValue(listResponse(sampleExpenses, 101, 3, 50));
      render(<Expenses />);

      await waitFor(() => expect(mockList).toHaveBeenCalled());
      fireEvent.change(screen.getByPlaceholderText('Search expenses...'), { target: { value: 'chocolate' } });

      await waitFor(() => expect(mockList.mock.calls.some(([params]) => (
        params?.page === 1 && params?.pageSize === 50 && params?.search === 'chocolate'
      ))).toBe(true));
    });

    it('resets to page one when the page size changes', async () => {
      window.history.pushState({}, '', '/?page=3&pageSize=50');
      mockList.mockResolvedValue(listResponse(sampleExpenses, 101, 3, 50));
      const user = userEvent.setup();
      render(<Expenses />);

      await waitFor(() => expect(mockList).toHaveBeenCalled());
      await user.selectOptions(screen.getByRole('combobox', { name: 'Rows per page' }), '100');

      await waitFor(() => expect(mockList.mock.calls.some(([params]) => (
        params?.page === 1 && params?.pageSize === 100
      ))).toBe(true));
    });

    it('falls back to the previous page after deleting its only row', async () => {
      const pageTwoExpense = { ...sampleExpenses[0]!, id: 'exp-page-two', description: 'Only page two expense' };
      let pageTwoLoads = 0;
      mockList.mockImplementation((params) => {
        if (params?.page === 2) {
          pageTwoLoads += 1;
          return pageTwoLoads === 1
            ? Promise.resolve(listResponse([pageTwoExpense], 26, 2))
            : Promise.resolve(listResponse([], 25, 2));
        }
        return Promise.resolve(listResponse(sampleExpenses, 25, 1));
      });
      mockDelete.mockResolvedValue(undefined);
      window.history.pushState({}, '', '/?page=2&pageSize=25');
      const user = userEvent.setup();
      render(<Expenses />);

      await waitFor(() => expect(screen.getByText('Only page two expense')).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: 'Delete expense Only page two expense' }));

      await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('exp-page-two'));
      await waitFor(() => expect(pageTwoLoads).toBe(2));
      await waitFor(() => expect(new URLSearchParams(window.location.search).get('page')).toBe('1'));
      await waitFor(() => expect(screen.getByText('Chocolate supplies')).toBeInTheDocument());
      expect(mockList.mock.calls.some(([params]) => params?.page === 1)).toBe(true);
    });

    it('does not reload the summary when only page or page size changes', async () => {
      window.history.pushState({}, '', '/?page=1&pageSize=50');
      mockList.mockResolvedValue(listResponse(sampleExpenses, 51, 1, 50));
      const user = userEvent.setup();
      render(<Expenses />);

      await waitFor(() => expect(mockSummary).toHaveBeenCalledTimes(1));
      await user.click(screen.getByRole('button', { name: '2' }));

      await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
      expect(mockSummary).toHaveBeenCalledTimes(1);
      expect(mockSummary.mock.calls[0]?.[0]).not.toHaveProperty('page');
      expect(mockSummary.mock.calls[0]?.[0]).not.toHaveProperty('pageSize');
    });
  });

  describe('summary and mutation errors', () => {
    it('shows a summary-specific Retry without hiding a successful list', async () => {
      mockSummary
        .mockRejectedValueOnce(new Error('Summary unavailable'))
        .mockResolvedValue(sampleSummary);
      const user = userEvent.setup();
      render(<Expenses />);

      await waitFor(() => expect(screen.getByText('Chocolate supplies')).toBeInTheDocument());
      await user.click(screen.getByTitle('Toggle summary'));

      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Summary unavailable'));
      expect(screen.getByText('Chocolate supplies')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Retry summary' }));

      await waitFor(() => expect(screen.getByText('Expense Summary')).toBeInTheDocument());
      expect(mockSummary).toHaveBeenCalledTimes(2);
    });

    it('keeps mutation failures out of list Retry and names the failed action', async () => {
      mockCreate.mockRejectedValue(new Error('Save failed'));
      const user = userEvent.setup();
      render(<Expenses />);

      await waitFor(() => expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: /add/i }));
      await user.type(screen.getByPlaceholderText('What was this expense for?'), 'Failed expense');
      await user.type(screen.getAllByPlaceholderText('0.00')[0]!, '100');
      await user.click(screen.getByRole('button', { name: /create/i }));

      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Failed to save expense: Save failed'));
      expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
      expect(mockList).toHaveBeenCalledTimes(1);
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
