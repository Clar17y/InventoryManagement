import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '../utils/test-utils';

// Mock API
vi.mock('../../lib/api', () => ({
  settings: {
    dashboardStats: vi.fn(),
  },
  inventory: {
    lowStock: vi.fn(),
    expiring: vi.fn(),
  },
}));

import Dashboard from '../../pages/Dashboard';
import { settings, inventory } from '../../lib/api';

const mockDashboardStats = vi.mocked(settings.dashboardStats);
const mockLowStock = vi.mocked(inventory.lowStock);
const mockExpiring = vi.mocked(inventory.expiring);

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default successful responses
    mockDashboardStats.mockResolvedValue({
      products: 25,
      categories: 5,
      hampers: 10,
      lowStockProducts: 2,
      today: { salesCount: 3, revenue: 105, margin: 52 },
      thisWeek: { salesCount: 15, revenue: 525, margin: 260 },
    });

    mockLowStock.mockResolvedValue([
      {
        id: 'prod-1',
        name: 'Dark Chocolate',
        totalStock: 3,
        category: { id: 'cat-1', name: 'Chocolates' },
      } as any,
    ]);

    mockExpiring.mockResolvedValue([]);
  });

  describe('quick actions', () => {
    it('has link to inventory', async () => {
      render(<Dashboard />);

      await waitFor(() => {
        const addStockLink = screen.getByRole('link', { name: /add stock/i });
        expect(addStockLink).toHaveAttribute('href', '/inventory');
      });
    });

    it('has link to sales', async () => {
      render(<Dashboard />);

      await waitFor(() => {
        const salesLink = screen.getByRole('link', { name: /record sale/i });
        expect(salesLink).toHaveAttribute('href', '/sales');
      });
    });

    it('has link to hampers', async () => {
      render(<Dashboard />);

      await waitFor(() => {
        const hampersLink = screen.getByRole('link', { name: /view hampers/i });
        expect(hampersLink).toHaveAttribute('href', '/hampers');
      });
    });

    it('has link to products', async () => {
      render(<Dashboard />);

      await waitFor(() => {
        const productsLink = screen.getByRole('link', { name: /products/i });
        expect(productsLink).toHaveAttribute('href', '/products');
      });
    });
  });

  describe('overview stats', () => {
    it('displays product count', async () => {
      render(<Dashboard />);

      await waitFor(() => {
        expect(screen.getByText('25')).toBeInTheDocument();
      });
    });

    it('displays low stock count', async () => {
      render(<Dashboard />);

      await waitFor(() => {
        expect(screen.getByText('2')).toBeInTheDocument();
      });
    });

    it('displays today sales revenue', async () => {
      render(<Dashboard />);

      await waitFor(() => {
        expect(screen.getByText('£105.00')).toBeInTheDocument();
      });
    });

    it('displays weekly revenue', async () => {
      render(<Dashboard />);

      await waitFor(() => {
        expect(screen.getByText('£525.00')).toBeInTheDocument();
      });
    });

    it('shows sales count for today', async () => {
      render(<Dashboard />);

      await waitFor(() => {
        expect(screen.getByText('3 sales')).toBeInTheDocument();
      });
    });
  });

  describe('loading state', () => {
    it('shows loading placeholders initially', () => {
      render(<Dashboard />);

      // Should show -- while loading
      expect(screen.getAllByText('--').length).toBeGreaterThan(0);
    });
  });

  describe('alerts section', () => {
    it('displays Low Stock alert card', async () => {
      render(<Dashboard />);

      await waitFor(() => {
        // There are two "Low Stock" texts - one in overview, one in alerts
        // Check the alert card title specifically (h3 element)
        const lowStockElements = screen.getAllByText('Low Stock');
        expect(lowStockElements.length).toBeGreaterThanOrEqual(2);
      });
    });

    it('displays Expiring Soon alert card', async () => {
      render(<Dashboard />);

      await waitFor(() => {
        expect(screen.getByText('Expiring Soon')).toBeInTheDocument();
      });
    });

    it('shows low stock products', async () => {
      render(<Dashboard />);

      await waitFor(() => {
        expect(screen.getByText('Dark Chocolate')).toBeInTheDocument();
        expect(screen.getByText('3 left')).toBeInTheDocument();
      });
    });

    it('shows empty message when no low stock', async () => {
      mockLowStock.mockResolvedValue([]);

      render(<Dashboard />);

      await waitFor(() => {
        expect(screen.getByText('All products well stocked!')).toBeInTheDocument();
      });
    });

    it('shows empty message when no expiring lots', async () => {
      render(<Dashboard />);

      await waitFor(() => {
        expect(screen.getByText('No lots expiring within 30 days')).toBeInTheDocument();
      });
    });

    it('shows expiring lots when present', async () => {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 10);

      mockExpiring.mockResolvedValue([
        {
          id: 'lot-1',
          product: { id: 'prod-1', name: 'Orange Juice' },
          expiresAt: expiryDate.toISOString(),
          remaining: 5,
        } as any,
      ]);

      render(<Dashboard />);

      await waitFor(() => {
        expect(screen.getByText('Orange Juice')).toBeInTheDocument();
      });
    });
  });

  describe('error handling', () => {
    it('handles API errors gracefully', async () => {
      mockDashboardStats.mockRejectedValue(new Error('API Error'));
      mockLowStock.mockRejectedValue(new Error('API Error'));
      mockExpiring.mockRejectedValue(new Error('API Error'));

      // Should not throw
      render(<Dashboard />);

      await waitFor(() => {
        // After loading, should show empty state or zeros
        expect(screen.queryByText('--')).not.toBeInTheDocument();
      });
    });
  });

  describe('API calls', () => {
    it('fetches dashboard stats on mount', async () => {
      render(<Dashboard />);

      await waitFor(() => {
        expect(mockDashboardStats).toHaveBeenCalledTimes(1);
      });
    });

    it('fetches low stock products on mount', async () => {
      render(<Dashboard />);

      await waitFor(() => {
        expect(mockLowStock).toHaveBeenCalledTimes(1);
      });
    });

    it('fetches expiring lots with 30 day window', async () => {
      render(<Dashboard />);

      await waitFor(() => {
        expect(mockExpiring).toHaveBeenCalledWith(30);
      });
    });
  });
});
