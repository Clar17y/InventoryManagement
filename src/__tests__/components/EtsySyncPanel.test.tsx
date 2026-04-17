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
    getPendingSkus: vi.fn(),
    generateSkus: vi.fn(),
    pushSkus: vi.fn(),
    getPendingPriceUpdates: vi.fn(),
    pushPrices: vi.fn(),
    pullPrices: vi.fn(),
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
const mockGetPendingSkus = vi.mocked(etsy.getPendingSkus);
const mockGetPendingPriceUpdates = vi.mocked(etsy.getPendingPriceUpdates);
const mockPushPrices = vi.mocked(etsy.pushPrices);
const mockPullPrices = vi.mocked(etsy.pullPrices);

describe('EtsySyncPanel', () => {
  const mockOnClose = vi.fn();
  const mockOnImportComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetStatus.mockResolvedValue({ connected: false });
    mockGetComparison.mockResolvedValue({ comparisons: [] });
    mockGetPendingOrders.mockResolvedValue({ orders: [] });
    mockGetPendingSkus.mockResolvedValue({ skus: [], needsSyncCount: 0, totalVariants: 0 });
    mockGetPendingPriceUpdates.mockResolvedValue({ updates: [], count: 0, needsSyncCount: 0 });
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

    it('shows loading state initially', async () => {
      render(
        <EtsySyncPanel isOpen={true} onClose={mockOnClose} onImportComplete={mockOnImportComplete} />
      );

      expect(screen.getByText('Loading Etsy status...')).toBeInTheDocument();

      await waitFor(() => {
        expect(mockGetStatus).toHaveBeenCalled();
      });
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

    const priceDiffRow = {
      hamperId: 'hamper-1',
      hamperName: 'Luxury Hamper',
      etsyListingId: '123',
      variantId: 'default:hamper-1',
      variantName: 'Default',
      etsySku: null,
      etsyProductId: '9001',
      localPrice: 35,
      etsyPrice: 42,
      needsSync: true,
    };

    it('shows inventory sync tab by default', async () => {
      render(
        <EtsySyncPanel isOpen={true} onClose={mockOnClose} onImportComplete={mockOnImportComplete} />
      );

      await waitFor(() => {
        expect(screen.getByText('Inventory Sync')).toBeInTheDocument();
      });
    });

    it('shows SKU and Price tabs', async () => {
      render(
        <EtsySyncPanel isOpen={true} onClose={mockOnClose} onImportComplete={mockOnImportComplete} />
      );

      await waitFor(() => {
        expect(screen.getByText(/SKU Sync/)).toBeInTheDocument();
        expect(screen.getByText(/Price Sync/)).toBeInTheDocument();
      });
    });

    it('switches to SKU sync tab when clicked', async () => {
      const user = userEvent.setup();
      render(
        <EtsySyncPanel isOpen={true} onClose={mockOnClose} onImportComplete={mockOnImportComplete} />
      );

      await waitFor(() => {
        expect(screen.getByText(/SKU Sync/)).toBeInTheDocument();
      });

      await user.click(screen.getByText(/SKU Sync/));

      await waitFor(() => {
        expect(mockGetPendingSkus).toHaveBeenCalled();
      });
    });

    it('switches to price sync tab when clicked', async () => {
      const user = userEvent.setup();
      render(
        <EtsySyncPanel isOpen={true} onClose={mockOnClose} onImportComplete={mockOnImportComplete} />
      );

      await waitFor(() => {
        expect(screen.getByText(/Price Sync/)).toBeInTheDocument();
      });

      await user.click(screen.getByText(/Price Sync/));

      await waitFor(() => {
        expect(mockGetPendingPriceUpdates).toHaveBeenCalled();
      });
    });

    it('shows explicit push and pull buttons on the Price Sync tab', async () => {
      mockGetPendingPriceUpdates.mockResolvedValue({
        updates: [priceDiffRow],
        count: 1,
        needsSyncCount: 1,
      });

      const user = userEvent.setup();
      render(
        <EtsySyncPanel isOpen={true} onClose={mockOnClose} onImportComplete={mockOnImportComplete} />
      );

      await user.click(await screen.findByText(/Price Sync/));

      expect(await screen.findByRole('button', { name: /Push to Etsy/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Pull from Etsy/i })).toBeInTheDocument();
    });

    it('pulls selected Etsy prices into local records', async () => {
      mockGetPendingPriceUpdates.mockResolvedValue({
        updates: [priceDiffRow],
        count: 1,
        needsSyncCount: 1,
      });
      mockPullPrices.mockResolvedValue({ success: true, updated: 1, errors: 0, results: [] });

      const user = userEvent.setup();
      render(
        <EtsySyncPanel isOpen={true} onClose={mockOnClose} onImportComplete={mockOnImportComplete} />
      );

      await user.click(await screen.findByText(/Price Sync/));
      const checkboxes = await screen.findAllByRole('checkbox');
      await user.click(checkboxes[1]!);
      await user.click(screen.getByRole('button', { name: /Pull from Etsy/i }));

      await waitFor(() => {
        expect(mockPullPrices).toHaveBeenCalledWith([
          { hamperId: 'hamper-1', variantId: 'default:hamper-1' },
        ]);
      });
    });

    it('pushes selected local prices to Etsy through the explicit push action', async () => {
      mockGetPendingPriceUpdates.mockResolvedValue({
        updates: [priceDiffRow],
        count: 1,
        needsSyncCount: 1,
      });
      mockPushPrices.mockResolvedValue({ success: true, updated: 1, errors: 0, results: [] });

      const user = userEvent.setup();
      render(
        <EtsySyncPanel isOpen={true} onClose={mockOnClose} onImportComplete={mockOnImportComplete} />
      );

      await user.click(await screen.findByText(/Price Sync/));
      const checkboxes = await screen.findAllByRole('checkbox');
      await user.click(checkboxes[1]!);
      await user.click(screen.getByRole('button', { name: /Push to Etsy/i }));

      await waitFor(() => {
        expect(mockPushPrices).toHaveBeenCalledWith([
          { etsyListingId: '123', etsySku: null, etsyProductId: '9001', price: 35 },
        ]);
      });
    });

    it('refreshes affected price rows and keeps failed selections after a partial-success push', async () => {
      const failedPriceRow = {
        ...priceDiffRow,
        hamperId: 'hamper-2',
        hamperName: 'Starter Hamper',
        etsyListingId: '456',
        variantId: 'default:hamper-2',
        etsyProductId: '9002',
        localPrice: 18,
        etsyPrice: 24,
      };

      mockGetPendingPriceUpdates
        .mockResolvedValueOnce({
          updates: [priceDiffRow, failedPriceRow],
          count: 2,
          needsSyncCount: 2,
        })
        .mockResolvedValueOnce({
          updates: [failedPriceRow],
          count: 1,
          needsSyncCount: 1,
        });
      mockPushPrices.mockResolvedValue({
        success: false,
        updated: 1,
        errors: 1,
        results: [
          { listingId: '123', success: true },
          { listingId: '456', success: false, error: 'Out of stock' },
        ],
      });

      const user = userEvent.setup();
      render(
        <EtsySyncPanel isOpen={true} onClose={mockOnClose} onImportComplete={mockOnImportComplete} />
      );

      await user.click(await screen.findByText(/Price Sync/));
      const checkboxes = await screen.findAllByRole('checkbox');
      await user.click(checkboxes[1]!);
      await user.click(checkboxes[2]!);
      await user.click(screen.getByRole('button', { name: /Push to Etsy/i }));

      await waitFor(() => {
        expect(mockGetPendingPriceUpdates).toHaveBeenLastCalledWith(['123', '456']);
      });

      expect(await screen.findByText(/Updated 1 price\(s\) on Etsy \(1 error\(s\)\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Some prices failed to sync: 1 error\(s\)/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Push to Etsy \(1\)/i })).toBeInTheDocument();
    });

    it('refreshes affected price rows after a partial-success pull', async () => {
      mockGetPendingPriceUpdates
        .mockResolvedValueOnce({
          updates: [priceDiffRow],
          count: 1,
          needsSyncCount: 1,
        })
        .mockResolvedValueOnce({
          updates: [],
          count: 0,
          needsSyncCount: 0,
        });
      mockPullPrices.mockResolvedValue({
        success: false,
        updated: 1,
        errors: 1,
        results: [{ hamperId: 'hamper-1', variantId: 'default:hamper-1', success: true }],
      });

      const user = userEvent.setup();
      render(
        <EtsySyncPanel isOpen={true} onClose={mockOnClose} onImportComplete={mockOnImportComplete} />
      );

      await user.click(await screen.findByText(/Price Sync/));
      const checkboxes = await screen.findAllByRole('checkbox');
      await user.click(checkboxes[1]!);
      await user.click(screen.getByRole('button', { name: /Pull from Etsy/i }));

      await waitFor(() => {
        expect(mockGetPendingPriceUpdates).toHaveBeenLastCalledWith(['123']);
      });

      expect(await screen.findByText(/Pulled 1 price\(s\) into local records/i)).toBeInTheDocument();
      expect(screen.getByText(/Some prices failed to pull: 1 error\(s\)/i)).toBeInTheDocument();
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
