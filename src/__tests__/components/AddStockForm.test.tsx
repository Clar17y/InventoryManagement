import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../utils/test-utils';

vi.mock('../../lib/api', () => ({
  products: {
    list: vi.fn(),
    listAll: vi.fn(),
    getByBarcode: vi.fn(),
    create: vi.fn(),
    addBarcode: vi.fn(),
  },
  categories: {
    list: vi.fn(),
    create: vi.fn(),
  },
  inventory: {
    addLot: vi.fn(),
  },
}));

vi.mock('../../components/scanner/BarcodeScanner', () => ({
  default: ({ onScan, onClose }: { onScan: (barcode: string) => void; onClose: () => void }) => (
    <div data-testid="mock-scanner">
      <button onClick={() => onScan('1234567890123')}>Simulate Scan</button>
      <button onClick={onClose}>Close Scanner</button>
    </div>
  ),
}));

import AddStockForm from '../../components/inventory/AddStockForm';
import { products, categories, inventory } from '../../lib/api';

const mockProductsList = vi.mocked(products.listAll);
const mockGetByBarcode = vi.mocked(products.getByBarcode);
const mockCategoriesList = vi.mocked(categories.list);
const mockAddLot = vi.mocked(inventory.addLot);

describe('AddStockForm', () => {
  const mockOnSuccess = vi.fn();
  const mockOnClose = vi.fn();

  const sampleProducts = [
    {
      id: 'prod-1',
      name: 'Dark Chocolate',
      unit: 'units',
      categoryId: 'cat-1',
      category: { id: 'cat-1', name: 'Chocolates' },
      totalStock: 25,
      currentCost: '2.50',
      barcode: '1234567890123',
    },
    {
      id: 'prod-2',
      name: 'Orange Juice',
      unit: 'bottles',
      categoryId: 'cat-2',
      category: { id: 'cat-2', name: 'Drinks' },
      totalStock: 10,
    },
  ];

  const sampleCategories = [
    { id: 'cat-1', name: 'Chocolates', pickRule: 'FIFO' },
    { id: 'cat-2', name: 'Drinks', pickRule: 'FEFO' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockProductsList.mockResolvedValue({
      items: sampleProducts,
      pagination: { page: 1, pageSize: 25, totalItems: sampleProducts.length, totalPages: 1 },
    } as any);
    mockCategoriesList.mockResolvedValue(sampleCategories as any);
  });

  describe('initial state', () => {
    it('renders modal with title', async () => {
      render(<AddStockForm onSuccess={mockOnSuccess} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('Add Stock')).toBeInTheDocument();
      });
    });

    it('shows barcode scanner section with handheld input and camera button', async () => {
      render(<AddStockForm onSuccess={mockOnSuccess} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('Barcode Scanner')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Scan with handheld or type barcode...')).toBeInTheDocument();
        expect(screen.getByText('Use Camera')).toBeInTheDocument();
      });
    });

    it('shows search input', async () => {
      render(<AddStockForm onSuccess={mockOnSuccess} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search products...')).toBeInTheDocument();
      });
    });

    it('calls onClose when close button clicked', async () => {
      const user = userEvent.setup();
      render(<AddStockForm onSuccess={mockOnSuccess} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('Add Stock')).toBeInTheDocument();
      });

      // Find the close button (X icon)
      const closeButton = screen.getByRole('button', { name: 'Close' });
      await user.click(closeButton);

      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('product search', () => {
    it('shows help text when no search', async () => {
      render(<AddStockForm onSuccess={mockOnSuccess} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('Start typing to search for a product')).toBeInTheDocument();
      });
    });

    it('filters products when searching', async () => {
      const user = userEvent.setup();
      render(<AddStockForm onSuccess={mockOnSuccess} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search products...')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('Search products...'), 'Dark');

      await waitFor(() => {
        expect(screen.getByText('Dark Chocolate')).toBeInTheDocument();
      });
    });

    it('shows no products found when search has no results', async () => {
      const user = userEvent.setup();
      render(<AddStockForm onSuccess={mockOnSuccess} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search products...')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('Search products...'), 'nonexistent');

      await waitFor(() => {
        expect(screen.getByText('No products found')).toBeInTheDocument();
      });
    });

    it('searches products beyond the first 100 compatibility results', async () => {
      const allProducts = Array.from({ length: 101 }, (_, index) => ({
        ...sampleProducts[0]!,
        id: `prod-${index + 1}`,
        name: `Chocolate ${index + 1}`,
      }));
      mockProductsList.mockResolvedValue({
        items: allProducts,
        pagination: { page: 1, pageSize: 100, totalItems: 101, totalPages: 2 },
      } as any);
      const user = userEvent.setup();

      render(<AddStockForm onSuccess={mockOnSuccess} onClose={mockOnClose} />);
      const searchInput = await screen.findByPlaceholderText('Search products...');
      await user.type(searchInput, 'Chocolate 101');

      expect(await screen.findByText('Chocolate 101')).toBeInTheDocument();
    });

    it('selects product when clicked', async () => {
      const user = userEvent.setup();
      render(<AddStockForm onSuccess={mockOnSuccess} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search products...')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('Search products...'), 'Dark');

      await waitFor(() => {
        expect(screen.getByText('Dark Chocolate')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Dark Chocolate'));

      await waitFor(() => {
        expect(screen.getByText('Enter Details')).toBeInTheDocument();
      });
    });
  });

  describe('scanner mode', () => {
    it('shows scanner when camera button clicked', async () => {
      const user = userEvent.setup();
      render(<AddStockForm onSuccess={mockOnSuccess} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('Use Camera')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Use Camera'));

      expect(screen.getByTestId('mock-scanner')).toBeInTheDocument();
    });

    it('returns to select mode when scanner closed', async () => {
      const user = userEvent.setup();
      render(<AddStockForm onSuccess={mockOnSuccess} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('Use Camera')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Use Camera'));
      await user.click(screen.getByText('Close Scanner'));

      await waitFor(() => {
        expect(screen.getByText('Add Stock')).toBeInTheDocument();
      });
    });

    it('moves to form mode when known barcode scanned via camera', async () => {
      const user = userEvent.setup();
      mockGetByBarcode.mockResolvedValue(sampleProducts[0] as any);

      render(<AddStockForm onSuccess={mockOnSuccess} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('Use Camera')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Use Camera'));
      await user.click(screen.getByText('Simulate Scan'));

      await waitFor(() => {
        expect(screen.getByText('Enter Details')).toBeInTheDocument();
        expect(screen.getByText('Dark Chocolate')).toBeInTheDocument();
      });
    });

    it('moves to new product mode when unknown barcode scanned via camera', async () => {
      const user = userEvent.setup();
      mockGetByBarcode.mockRejectedValue(new Error('Not found'));

      render(<AddStockForm onSuccess={mockOnSuccess} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('Use Camera')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Use Camera'));
      await user.click(screen.getByText('Simulate Scan'));

      await waitFor(() => {
        expect(screen.getByText('New Barcode Detected')).toBeInTheDocument();
      });
    });

    it('moves to form mode when known barcode entered via handheld input', async () => {
      const user = userEvent.setup();
      mockGetByBarcode.mockResolvedValue(sampleProducts[0] as any);

      render(<AddStockForm onSuccess={mockOnSuccess} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Scan with handheld or type barcode...')).toBeInTheDocument();
      });

      const handheldInput = screen.getByPlaceholderText('Scan with handheld or type barcode...');
      await user.type(handheldInput, '1234567890123{Enter}');

      await waitFor(() => {
        expect(screen.getByText('Enter Details')).toBeInTheDocument();
        expect(screen.getByText('Dark Chocolate')).toBeInTheDocument();
      });
    });

    it('moves to new product mode when unknown barcode entered via handheld input', async () => {
      const user = userEvent.setup();
      mockGetByBarcode.mockRejectedValue(new Error('Not found'));

      render(<AddStockForm onSuccess={mockOnSuccess} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Scan with handheld or type barcode...')).toBeInTheDocument();
      });

      const handheldInput = screen.getByPlaceholderText('Scan with handheld or type barcode...');
      await user.type(handheldInput, '9999999999999{Enter}');

      await waitFor(() => {
        expect(screen.getByText('New Barcode Detected')).toBeInTheDocument();
      });
    });
  });

  describe('form mode', () => {
    it('shows quantity input', async () => {
      const user = userEvent.setup();
      render(<AddStockForm onSuccess={mockOnSuccess} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search products...')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('Search products...'), 'Dark');
      await user.click(await screen.findByText('Dark Chocolate'));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('e.g., 10')).toBeInTheDocument();
      });
    });

    it('shows cost mode toggle', async () => {
      const user = userEvent.setup();
      render(<AddStockForm onSuccess={mockOnSuccess} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search products...')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('Search products...'), 'Dark');
      await user.click(await screen.findByText('Dark Chocolate'));

      await waitFor(() => {
        expect(screen.getByText('Total Cost')).toBeInTheDocument();
        expect(screen.getByText('Unit Cost')).toBeInTheDocument();
      });
    });

    it('shows VAT checkbox', async () => {
      const user = userEvent.setup();
      render(<AddStockForm onSuccess={mockOnSuccess} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search products...')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('Search products...'), 'Dark');
      await user.click(await screen.findByText('Dark Chocolate'));

      await waitFor(() => {
        expect(screen.getByText(/Price excludes VAT/)).toBeInTheDocument();
      });
    });

    it('shows expiry date input', async () => {
      const user = userEvent.setup();
      render(<AddStockForm onSuccess={mockOnSuccess} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search products...')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('Search products...'), 'Dark');
      await user.click(await screen.findByText('Dark Chocolate'));

      await waitFor(() => {
        expect(screen.getByText('Expiry Date (optional)')).toBeInTheDocument();
      });
    });

    it('shows Add Stock button', async () => {
      const user = userEvent.setup();
      render(<AddStockForm onSuccess={mockOnSuccess} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search products...')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('Search products...'), 'Dark');
      await user.click(await screen.findByText('Dark Chocolate'));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Add Stock' })).toBeInTheDocument();
      });
    });

    it('submits form and calls onSuccess', async () => {
      const user = userEvent.setup();
      mockAddLot.mockResolvedValue({} as any);

      render(<AddStockForm onSuccess={mockOnSuccess} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search products...')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('Search products...'), 'Dark');
      await user.click(await screen.findByText('Dark Chocolate'));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('e.g., 10')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('e.g., 10'), '5');
      await user.type(screen.getByPlaceholderText('e.g., 25.00'), '12.50');

      await user.click(screen.getByRole('button', { name: 'Add Stock' }));

      await waitFor(() => {
        expect(mockAddLot).toHaveBeenCalled();
        expect(mockOnSuccess).toHaveBeenCalled();
        expect(mockOnClose).toHaveBeenCalled();
      });
    });

    it('shows calculated unit cost', async () => {
      const user = userEvent.setup();
      render(<AddStockForm onSuccess={mockOnSuccess} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search products...')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('Search products...'), 'Dark');
      await user.click(await screen.findByText('Dark Chocolate'));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('e.g., 10')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('e.g., 10'), '10');
      await user.type(screen.getByPlaceholderText('e.g., 25.00'), '25');

      await waitFor(() => {
        // Check for the cost display section
        expect(screen.getByText(/Per unit/)).toBeInTheDocument();
      });
    });

    it('allows changing product', async () => {
      const user = userEvent.setup();
      render(<AddStockForm onSuccess={mockOnSuccess} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search products...')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('Search products...'), 'Dark');
      await user.click(await screen.findByText('Dark Chocolate'));

      await waitFor(() => {
        expect(screen.getByText('Change')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Change'));

      await waitFor(() => {
        expect(screen.getByText('Add Stock')).toBeInTheDocument();
      });
    });
  });

  describe('new product mode', () => {
    beforeEach(() => {
      mockGetByBarcode.mockRejectedValue(new Error('Not found'));
    });

    it('shows link to existing option', async () => {
      const user = userEvent.setup();
      render(<AddStockForm onSuccess={mockOnSuccess} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('Use Camera')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Use Camera'));
      await user.click(screen.getByText('Simulate Scan'));

      await waitFor(() => {
        expect(screen.getByText('Link to Existing Product')).toBeInTheDocument();
      });
    });

    it('shows create new product form', async () => {
      const user = userEvent.setup();
      render(<AddStockForm onSuccess={mockOnSuccess} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('Use Camera')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Use Camera'));
      await user.click(screen.getByText('Simulate Scan'));

      await waitFor(() => {
        expect(screen.getByText('Create a New Product')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('e.g., Organic Milk 1L')).toBeInTheDocument();
      });
    });

    it('shows category select', async () => {
      const user = userEvent.setup();
      render(<AddStockForm onSuccess={mockOnSuccess} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('Use Camera')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Use Camera'));
      await user.click(screen.getByText('Simulate Scan'));

      await waitFor(() => {
        expect(screen.getByText('Select a category...')).toBeInTheDocument();
      });
    });

    it('shows create product form when unknown barcode scanned', async () => {
      const user = userEvent.setup();

      render(<AddStockForm onSuccess={mockOnSuccess} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('Use Camera')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Use Camera'));
      await user.click(screen.getByText('Simulate Scan'));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('e.g., Organic Milk 1L')).toBeInTheDocument();
        expect(screen.getByText('Create a New Product')).toBeInTheDocument();
      });
    });
  });

  describe('error handling', () => {
    it('shows error when data load fails', async () => {
      mockProductsList.mockRejectedValue(new Error('Network error'));

      render(<AddStockForm onSuccess={mockOnSuccess} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('shows error when submit fails', async () => {
      const user = userEvent.setup();
      mockAddLot.mockRejectedValue(new Error('Failed to add stock'));

      render(<AddStockForm onSuccess={mockOnSuccess} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search products...')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('Search products...'), 'Dark');
      await user.click(await screen.findByText('Dark Chocolate'));

      await user.type(screen.getByPlaceholderText('e.g., 10'), '5');
      await user.type(screen.getByPlaceholderText('e.g., 25.00'), '12.50');

      await user.click(screen.getByRole('button', { name: 'Add Stock' }));

      await waitFor(() => {
        expect(screen.getByText('Failed to add stock')).toBeInTheDocument();
      });
    });
  });
});
