import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, renderHook, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../utils/test-utils';
import { useEffect, useState } from 'react';
import { useDebounce } from '../../hooks/useDebounce';
import DateSearchFilter, { useDateSearchFilter } from '../../components/filters/DateSearchFilter';

describe('DateSearchFilter', () => {
  const mockOnStartDateChange = vi.fn();
  const mockOnEndDateChange = vi.fn();
  const mockOnSearchChange = vi.fn();

  const defaultProps = {
    startDate: '',
    endDate: '',
    searchQuery: '',
    onStartDateChange: mockOnStartDateChange,
    onEndDateChange: mockOnEndDateChange,
    onSearchChange: mockOnSearchChange,
  };

  beforeEach(() => {
    mockOnStartDateChange.mockClear();
    mockOnEndDateChange.mockClear();
    mockOnSearchChange.mockClear();
  });

  describe('search input', () => {
    it('renders search input with default placeholder', () => {
      render(<DateSearchFilter {...defaultProps} />);

      expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
    });

    it('renders search input with custom placeholder', () => {
      render(<DateSearchFilter {...defaultProps} searchPlaceholder="Search orders..." />);

      expect(screen.getByPlaceholderText('Search orders...')).toBeInTheDocument();
    });

    it('calls onSearchChange when typing', async () => {
      const user = userEvent.setup();
      render(<DateSearchFilter {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Search...');
      await user.type(searchInput, 'test');

      expect(mockOnSearchChange).toHaveBeenCalled();
    });

    it('shows clear button when search has value', () => {
      render(<DateSearchFilter {...defaultProps} searchQuery="test" />);

      expect(screen.getByText('Clear')).toBeInTheDocument();
    });

    it('hides clear button when search is empty', () => {
      render(<DateSearchFilter {...defaultProps} searchQuery="" />);

      const clearButtons = screen.queryAllByText('Clear');
      // Should only have date clear button potentially, not search clear
      expect(clearButtons.length).toBeLessThanOrEqual(1);
    });

    it('clears search when clear button clicked', async () => {
      const user = userEvent.setup();
      render(<DateSearchFilter {...defaultProps} searchQuery="test" />);

      const clearButton = screen.getByText('Clear');
      await user.click(clearButton);

      expect(mockOnSearchChange).toHaveBeenCalledWith('');
    });
  });

  describe('date inputs', () => {
    it('renders start and end date inputs', () => {
      render(<DateSearchFilter {...defaultProps} />);

      expect(screen.getByPlaceholderText('Start date')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('End date')).toBeInTheDocument();
    });

    it('calls onStartDateChange when start date changes', async () => {
      render(<DateSearchFilter {...defaultProps} />);

      const startDateInput = screen.getByPlaceholderText('Start date');
      fireEvent.change(startDateInput, { target: { value: '2024-01-01' } });
      expect(mockOnStartDateChange).toHaveBeenCalledWith('2024-01-01');
    });

    it('shows clear button when dates have values', () => {
      render(<DateSearchFilter {...defaultProps} startDate="2024-01-01" endDate="2024-01-31" />);

      // There should be a Clear button for dates
      const clearButtons = screen.getAllByText('Clear');
      expect(clearButtons.length).toBeGreaterThan(0);
    });
  });

  describe('quick selectors', () => {
    it('shows quick selectors by default', () => {
      render(<DateSearchFilter {...defaultProps} />);

      expect(screen.getByText('Quick:')).toBeInTheDocument();
    });

    it('hides quick selectors when showQuickSelectors is false', () => {
      render(<DateSearchFilter {...defaultProps} showQuickSelectors={false} />);

      expect(screen.queryByText('Quick:')).not.toBeInTheDocument();
    });

    it('shows quarter buttons', () => {
      render(<DateSearchFilter {...defaultProps} />);

      const currentYear = new Date().getFullYear();
      expect(screen.getByText(`Q1 ${currentYear}`)).toBeInTheDocument();
      expect(screen.getByText(`Q2 ${currentYear}`)).toBeInTheDocument();
      expect(screen.getByText(`Q3 ${currentYear}`)).toBeInTheDocument();
      expect(screen.getByText(`Q4 ${currentYear}`)).toBeInTheDocument();
    });

    it('shows year button', () => {
      render(<DateSearchFilter {...defaultProps} />);

      const currentYear = new Date().getFullYear();
      expect(screen.getByText(String(currentYear))).toBeInTheDocument();
    });

    it('shows financial year button', () => {
      render(<DateSearchFilter {...defaultProps} />);

      const currentYear = new Date().getFullYear();
      expect(screen.getByText(`FY ${currentYear - 1}/${currentYear}`)).toBeInTheDocument();
    });

    it('shows All Time button', () => {
      render(<DateSearchFilter {...defaultProps} />);

      expect(screen.getByText('All Time')).toBeInTheDocument();
    });

    it('sets correct dates when Q1 clicked', async () => {
      const user = userEvent.setup();
      render(<DateSearchFilter {...defaultProps} />);

      const currentYear = new Date().getFullYear();
      const q1Button = screen.getByText(`Q1 ${currentYear}`);
      await user.click(q1Button);

      expect(mockOnStartDateChange).toHaveBeenCalledWith(`${currentYear}-01-01`);
      expect(mockOnEndDateChange).toHaveBeenCalledWith(`${currentYear}-03-31`);
    });

    it('clears dates when All Time clicked', async () => {
      const user = userEvent.setup();
      render(<DateSearchFilter {...defaultProps} startDate="2024-01-01" />);

      const allTimeButton = screen.getByText('All Time');
      await user.click(allTimeButton);

      expect(mockOnStartDateChange).toHaveBeenCalledWith('');
      expect(mockOnEndDateChange).toHaveBeenCalledWith('');
    });

    it('produces one debounced query transition per preset with both dates from prepopulated state', async () => {
      vi.useFakeTimers();
      const initialStartDate = '2025-12-01';
      const initialEndDate = '2025-12-31';

      function QueryKeyHarness() {
        const [startDate, setStartDate] = useState(initialStartDate);
        const [endDate, setEndDate] = useState(initialEndDate);
        const debouncedStartDate = useDebounce(startDate, 400);
        const debouncedEndDate = useDebounce(endDate, 400);
        const [queryKeys, setQueryKeys] = useState<string[]>([]);

        useEffect(() => {
          setQueryKeys((keys) => [...keys, `${debouncedStartDate}|${debouncedEndDate}`]);
        }, [debouncedStartDate, debouncedEndDate]);

        return (
          <>
            <DateSearchFilter
              {...defaultProps}
              startDate={startDate}
              endDate={endDate}
              onStartDateChange={setStartDate}
              onEndDateChange={setEndDate}
            />
            <output data-testid="query-keys">{queryKeys.join(',')}</output>
          </>
        );
      }

      try {
        render(<QueryKeyHarness />);
        const currentYear = new Date().getFullYear();
        const presetTransitions = [
          [`Q1 ${currentYear}`, `${currentYear}-01-01|${currentYear}-03-31`],
          [`Q2 ${currentYear}`, `${currentYear}-04-01|${currentYear}-06-30`],
          [`Q3 ${currentYear}`, `${currentYear}-07-01|${currentYear}-09-30`],
          [`Q4 ${currentYear}`, `${currentYear}-10-01|${currentYear}-12-31`],
          [String(currentYear), `${currentYear}-01-01|${currentYear}-12-31`],
          [`FY ${currentYear - 1}/${currentYear}`, `${currentYear - 1}-04-01|${currentYear}-03-31`],
          ['All Time', '|'],
        ] as const;
        const expectedQueryKeys = [`${initialStartDate}|${initialEndDate}`];

        for (const [label, queryKey] of presetTransitions) {
          act(() => {
            fireEvent.click(screen.getByText(label));
          });
          act(() => {
            vi.advanceTimersByTime(400);
          });

          expectedQueryKeys.push(queryKey);
          expect(screen.getByTestId('query-keys')).toHaveTextContent(expectedQueryKeys.join(','));
        }
      } finally {
        vi.useRealTimers();
      }
    });
  });
});

describe('useDateSearchFilter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns initial empty values', () => {
    const { result } = renderHook(() => useDateSearchFilter());

    expect(result.current.startDate).toBe('');
    expect(result.current.endDate).toBe('');
    expect(result.current.searchQuery).toBe('');
    expect(result.current.debouncedSearchQuery).toBe('');
  });

  it('updates startDate', () => {
    const { result } = renderHook(() => useDateSearchFilter());

    act(() => {
      result.current.setStartDate('2024-01-01');
    });

    expect(result.current.startDate).toBe('2024-01-01');
  });

  it('updates endDate', () => {
    const { result } = renderHook(() => useDateSearchFilter());

    act(() => {
      result.current.setEndDate('2024-12-31');
    });

    expect(result.current.endDate).toBe('2024-12-31');
  });

  it('updates searchQuery immediately', () => {
    const { result } = renderHook(() => useDateSearchFilter());

    act(() => {
      result.current.setSearchQuery('test');
    });

    expect(result.current.searchQuery).toBe('test');
  });

  it('debounces search query with 400ms delay', () => {
    const { result } = renderHook(() => useDateSearchFilter());

    act(() => {
      result.current.setSearchQuery('test');
    });

    // Immediately after, debounced value should still be empty
    expect(result.current.debouncedSearchQuery).toBe('');

    // After 400ms, debounced value should update
    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(result.current.debouncedSearchQuery).toBe('test');
  });
});
