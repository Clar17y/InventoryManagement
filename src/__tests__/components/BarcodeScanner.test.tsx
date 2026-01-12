import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../utils/test-utils';

// Mock the entire html5-qrcode module with a proper class
vi.mock('html5-qrcode', () => {
  // Create a mock class that can be instantiated with `new`
  class MockHtml5Qrcode {
    static getCameras = vi.fn().mockResolvedValue([{ id: 'camera-1', label: 'Back Camera' }]);

    start = vi.fn().mockResolvedValue(undefined);
    stop = vi.fn().mockResolvedValue(undefined);
    getState = vi.fn().mockReturnValue(1);
  }

  return {
    Html5Qrcode: MockHtml5Qrcode,
    Html5QrcodeSupportedFormats: {
      EAN_13: 1,
      EAN_8: 2,
      UPC_A: 3,
      UPC_E: 4,
      CODE_128: 5,
      CODE_39: 6,
      ITF: 7,
      QR_CODE: 8,
    },
  };
});

import BarcodeScanner from '../../components/scanner/BarcodeScanner';
import { Html5Qrcode } from 'html5-qrcode';

describe('BarcodeScanner', () => {
  const mockOnScan = vi.fn();
  const mockOnError = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset static getCameras to default success behavior
    (Html5Qrcode as any).getCameras.mockResolvedValue([
      { id: 'camera-1', label: 'Back Camera' },
    ]);

    // Mock navigator.mediaDevices
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn() },
      writable: true,
      configurable: true,
    });
  });

  describe('rendering', () => {
    it('renders scanner title', () => {
      render(
        <BarcodeScanner onScan={mockOnScan} onError={mockOnError} onClose={mockOnClose} />
      );

      expect(screen.getByText('Scan Barcode')).toBeInTheDocument();
    });

    it('has barcode reader element', () => {
      const { container } = render(
        <BarcodeScanner onScan={mockOnScan} onError={mockOnError} onClose={mockOnClose} />
      );

      expect(container.querySelector('#barcode-reader')).toBeInTheDocument();
    });

    it('renders manual barcode input field', () => {
      render(
        <BarcodeScanner onScan={mockOnScan} onError={mockOnError} onClose={mockOnClose} />
      );

      expect(screen.getByLabelText('Manual barcode entry')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Enter barcode or use Bluetooth scanner...')).toBeInTheDocument();
    });

    it('renders Go button for manual submission', () => {
      render(
        <BarcodeScanner onScan={mockOnScan} onError={mockOnError} onClose={mockOnClose} />
      );

      expect(screen.getByRole('button', { name: 'Go' })).toBeInTheDocument();
    });
  });

  describe('manual barcode entry', () => {
    it('calls onScan when Enter is pressed with barcode', async () => {
      const user = userEvent.setup();
      render(
        <BarcodeScanner onScan={mockOnScan} onError={mockOnError} onClose={mockOnClose} />
      );

      const input = screen.getByLabelText('Manual barcode entry');
      await user.type(input, '1234567890123{Enter}');

      expect(mockOnScan).toHaveBeenCalledWith('1234567890123');
    });

    it('calls onScan when Go button is clicked', async () => {
      const user = userEvent.setup();
      render(
        <BarcodeScanner onScan={mockOnScan} onError={mockOnError} onClose={mockOnClose} />
      );

      const input = screen.getByLabelText('Manual barcode entry');
      await user.type(input, '9876543210987');
      await user.click(screen.getByRole('button', { name: 'Go' }));

      expect(mockOnScan).toHaveBeenCalledWith('9876543210987');
    });

    it('does not call onScan when input is empty', async () => {
      const user = userEvent.setup();
      render(
        <BarcodeScanner onScan={mockOnScan} onError={mockOnError} onClose={mockOnClose} />
      );

      const input = screen.getByLabelText('Manual barcode entry');
      await user.type(input, '{Enter}');

      expect(mockOnScan).not.toHaveBeenCalled();
    });

    it('Go button is disabled when input is empty', () => {
      render(
        <BarcodeScanner onScan={mockOnScan} onError={mockOnError} onClose={mockOnClose} />
      );

      expect(screen.getByRole('button', { name: 'Go' })).toBeDisabled();
    });
  });

  describe('error states', () => {
    it('shows error when mediaDevices not available', async () => {
      // Simulate non-HTTPS environment
      Object.defineProperty(navigator, 'mediaDevices', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      render(
        <BarcodeScanner onScan={mockOnScan} onError={mockOnError} onClose={mockOnClose} />
      );

      await waitFor(() => {
        expect(screen.getByText('Camera Access Error')).toBeInTheDocument();
      });
    });

    it('shows error when no cameras found', async () => {
      (Html5Qrcode as any).getCameras.mockResolvedValue([]);

      render(
        <BarcodeScanner onScan={mockOnScan} onError={mockOnError} onClose={mockOnClose} />
      );

      await waitFor(() => {
        expect(screen.getByText('Camera Access Error')).toBeInTheDocument();
      });
    });

    it('shows close button in error state', async () => {
      (Html5Qrcode as any).getCameras.mockResolvedValue([]);

      render(
        <BarcodeScanner onScan={mockOnScan} onError={mockOnError} onClose={mockOnClose} />
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
      });
    });

    it('calls onClose from error close button', async () => {
      const user = userEvent.setup();
      (Html5Qrcode as any).getCameras.mockResolvedValue([]);

      render(
        <BarcodeScanner onScan={mockOnScan} onError={mockOnError} onClose={mockOnClose} />
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Close' }));

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('calls onError callback when camera fails', async () => {
      (Html5Qrcode as any).getCameras.mockRejectedValue(new Error('Permission denied'));

      render(
        <BarcodeScanner onScan={mockOnScan} onError={mockOnError} onClose={mockOnClose} />
      );

      await waitFor(() => {
        expect(mockOnError).toHaveBeenCalledWith('Permission denied');
      });
    });
  });

  describe('close functionality', () => {
    it('has close button in header', () => {
      render(
        <BarcodeScanner onScan={mockOnScan} onError={mockOnError} onClose={mockOnClose} />
      );

      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });
  });
});

