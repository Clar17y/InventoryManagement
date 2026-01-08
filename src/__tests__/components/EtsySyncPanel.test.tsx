import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../utils/test-utils';

vi.stubGlobal('confirm', vi.fn(() => true));

vi.mock('../../lib/api', () => ({
  etsy: {
    getStatus: vi.fn(),
    initiateAuth: vi.fn(),
    disconnect: vi.fn(),
    getComparison: vi.fn(),
    importListings: vi.fn(),
    pushUpdates: vi.fn(),
    getPendingOrders: vi.fn(),
    importOrder: vi.fn(),
  },
}));

import EtsySyncPanel from '../../components/EtsySyncPanel';
import { etsy } from '../../lib/api';

const mockGetStatus = vi.mocked(etsy.getStatus);
const mockInitiateAuth = vi.mocked(etsy.initiateAuth);
const mockDisconnect = vi.mocked(etsy.disconnect);
const mockGetComparison = vi.mocked(etsy.getComparison);
const mockImportListings = vi.mocked(etsy.importListings);
const mockGetPendingOrders = vi.mocked(etsy.getPendingOrders);

describe('EtsySyncPanel', () => {
  const mockOnClose = vi.fn();
  const mockOnImportComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetStatus.mockResolvedValue({ connected: false });
    mockGetComparison.mockResolvedValue({ comparisons: [] });
    mockGetPendingOrders.mockResolvedValue({ orders: [] });
  });

  describe('when closed', () => {
    it('renders nothing when isOpen is false', () => {
      const { container } = render(
        <EtsySyncPanel isOpen={false} onClose={mockOnClose} onImportComplete={mockOnImportComplete} />
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe('when open', () => {
    it('renders panel with title', async () => {
      render(
        <EtsySyncPanel isOpen={true} onClose={mockOnClose} onImportComplete={mockOnImportComplete} />
      );

      await waitFor(() => {
        expect(screen.getByText('Etsy Sync')).toBeInTheDocument();
      });
    });

    it('shows loading state initially', () => {
      render(
        <EtsySyncPanel isOpen={true} onClose={mockOnClose} onImportComplete={mockOnImportComplete} />
      );

      expect(screen.getByText('Loading Etsy status...')).toBeInTheDocument();
    });

    it('calls getStatus on open', async () => {
      render(
        <EtsySyncPanel isOpen={true} onClose={mockOnClose} onImportComplete={mockOnImportComplete} />
      );

      await waitFor(() => {
        expect(mockGetStatus).toHaveBeenCalled();
      });
    });

    it('calls onClose when close button clicked', async () => {
      const user = userEvent.setup();
      render(
        <EtsySyncPanel isOpen={true} onClose={mockOnClose} onImportComplete={mockOnImportComplete} />
      );

      await waitFor(() => {
        expect(screen.queryByText('Loading Etsy status...')).not.toBeInTheDocument();
      });

      const closeButton = screen.getByRole('button', { name: 'Close' });
      await user.click(closeButton);

      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('not connected state', () => {
    beforeEach(() => {
      mockGetStatus.mockResolvedValue({ connected: false });
    });

    it('shows connect prompt', async () => {
      render(
        <EtsySyncPanel isOpen={true} onClose={mockOnClose} onImportComplete={mockOnImportComplete} />
      );

      await waitFor(() => {
        expect(screen.getByText('Connect to Etsy')).toBeInTheDocument();
      });
    });

    it('shows connect button', async () => {
      render(
        <EtsySyncPanel isOpen={true} onClose={mockOnClose} onImportComplete={mockOnImportComplete} />
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Connect Etsy Shop' })).toBeInTheDocument();
      });
    });

    it('calls initiateAuth when connect clicked', async () => {
      const user = userEvent.setup();
      mockInitiateAuth.mockResolvedValue({ authUrl: 'https://etsy.com/oauth', state: 'abc' });

      // Mock window.location
      const originalLocation = window.location;
      delete (window as any).location;
      window.location = { ...originalLocation, href: '' } as any;

      render(
        <EtsySyncPanel isOpen={true} onClose={mockOnClose} onImportComplete={mockOnImportComplete} />
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Connect Etsy Shop' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Connect Etsy Shop' }));

      await waitFor(() => {
        expect(mockInitiateAuth).toHaveBeenCalled();
      });

      window.location = originalLocation;
    });
  });

  describe('connected state', () => {
    beforeEach(() => {
      mockGetStatus.mockResolvedValue({
        connected: true,
        shopId: '12345',
        shopName: 'Test Shop',
      });
    });

    it('shows connected badge', async () => {
      render(
        <EtsySyncPanel isOpen={true} onClose={mockOnClose} onImportComplete={mockOnImportComplete} />
      );

      await waitFor(() => {
        expect(screen.getByText('Connected')).toBeInTheDocument();
      });
    });

    it('shows shop name', async () => {
      render(
        <EtsySyncPanel isOpen={true} onClose={mockOnClose} onImportComplete={mockOnImportComplete} />
      );

      await waitFor(() => {
        expect(screen.getByText('Test Shop')).toBeInTheDocument();
      });
    });

    it('shows disconnect button', async () => {
      render(
        <EtsySyncPanel isOpen={true} onClose={mockOnClose} onImportComplete={mockOnImportComplete} />
      );

      await waitFor(() => {
        expect(screen.getByText('Disconnect')).toBeInTheDocument();
      });
    });

    it('shows import button', async () => {
      render(
        <EtsySyncPanel isOpen={true} onClose={mockOnClose} onImportComplete={mockOnImportComplete} />
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /import from etsy/i })).toBeInTheDocument();
      });
    });

    it('shows refresh button', async () => {
      render(
        <EtsySyncPanel isOpen={true} onClose={mockOnClose} onImportComplete={mockOnImportComplete} />
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
      });
    });

    it('calls disconnect when disconnect clicked', async () => {
      const user = userEvent.setup();
      mockDisconnect.mockResolvedValue({ success: true });

      render(
        <EtsySyncPanel isOpen={true} onClose={mockOnClose} onImportComplete={mockOnImportComplete} />
      );

      await waitFor(() => {
        expect(screen.getByText('Disconnect')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Disconnect'));

      await waitFor(() => {
        expect(mockDisconnect).toHaveBeenCalled();
      });
    });

    it('calls importListings when import clicked', async () => {
      const user = userEvent.setup();
      mockImportListings.mockResolvedValue({ created: 5, updated: 0, skipped: 0, errors: [] });

      render(
        <EtsySyncPanel isOpen={true} onClose={mockOnClose} onImportComplete={mockOnImportComplete} />
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /import from etsy/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /import from etsy/i }));

      await waitFor(() => {
        expect(mockImportListings).toHaveBeenCalled();
      });
    });

    it('shows import result after import', async () => {
      const user = userEvent.setup();
      mockImportListings.mockResolvedValue({ created: 5, updated: 2, skipped: 1, errors: [] });

      render(
        <EtsySyncPanel isOpen={true} onClose={mockOnClose} onImportComplete={mockOnImportComplete} />
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /import from etsy/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /import from etsy/i }));

      await waitFor(() => {
        expect(screen.getByText('Import Complete')).toBeInTheDocument();
        expect(screen.getByText(/Created: 5/)).toBeInTheDocument();
      });
    });

    it('calls onImportComplete when items created', async () => {
      const user = userEvent.setup();
      mockImportListings.mockResolvedValue({ created: 3, updated: 0, skipped: 0, errors: [] });

      render(
        <EtsySyncPanel isOpen={true} onClose={mockOnClose} onImportComplete={mockOnImportComplete} />
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /import from etsy/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /import from etsy/i }));

      await waitFor(() => {
        expect(mockOnImportComplete).toHaveBeenCalled();
      });
    });
  });

  describe('tabs', () => {
    beforeEach(() => {
      mockGetStatus.mockResolvedValue({ connected: true, shopId: '123', shopName: 'Shop' });
    });

    it('shows inventory sync tab by default', async () => {
      render(
        <EtsySyncPanel isOpen={true} onClose={mockOnClose} onImportComplete={mockOnImportComplete} />
      );

      await waitFor(() => {
        expect(screen.getByText('Inventory Sync')).toBeInTheDocument();
      });
    });

    it('shows pending orders tab', async () => {
      render(
        <EtsySyncPanel isOpen={true} onClose={mockOnClose} onImportComplete={mockOnImportComplete} />
      );

      await waitFor(() => {
        expect(screen.getByText(/Pending Orders/)).toBeInTheDocument();
      });
    });

    it('switches to orders tab when clicked', async () => {
      const user = userEvent.setup();
      render(
        <EtsySyncPanel isOpen={true} onClose={mockOnClose} onImportComplete={mockOnImportComplete} />
      );

      await waitFor(() => {
        expect(screen.getByText(/Pending Orders/)).toBeInTheDocument();
      });

      await user.click(screen.getByText(/Pending Orders/));

      await waitFor(() => {
        expect(mockGetPendingOrders).toHaveBeenCalled();
      });
    });
  });

  describe('error handling', () => {
    it('shows error when getStatus fails', async () => {
      mockGetStatus.mockRejectedValue(new Error('Network error'));

      render(
        <EtsySyncPanel isOpen={true} onClose={mockOnClose} onImportComplete={mockOnImportComplete} />
      );

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });
  });
});
