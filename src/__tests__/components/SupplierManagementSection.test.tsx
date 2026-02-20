import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../utils/test-utils';
import SupplierManagementSection from '../../features/settings/components/SupplierManagementSection';

const sampleSuppliers = [
  { id: 's1', name: 'Home Bargains', isActive: true, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
  { id: 's2', name: 'Amazon', isActive: true, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
];

const defaultProps = {
  suppliersList: sampleSuppliers as any,
  newSupplierName: '',
  onNewSupplierNameChange: vi.fn(),
  saving: false,
  onAddSupplier: vi.fn(),
  onDeleteSupplier: vi.fn(),
};

describe('SupplierManagementSection', () => {
  it('renders section title', () => {
    render(<SupplierManagementSection {...defaultProps} />);

    expect(screen.getByText('Suppliers / Shops')).toBeInTheDocument();
  });

  it('renders description text', () => {
    render(<SupplierManagementSection {...defaultProps} />);

    expect(screen.getByText(/Manage shops where products can be purchased/)).toBeInTheDocument();
  });

  it('renders existing supplier names in the list', () => {
    render(<SupplierManagementSection {...defaultProps} />);

    expect(screen.getByText('Home Bargains')).toBeInTheDocument();
    expect(screen.getByText('Amazon')).toBeInTheDocument();
  });

  it('shows Remove button for each supplier', () => {
    render(<SupplierManagementSection {...defaultProps} />);

    const removeButtons = screen.getAllByText('Remove');
    expect(removeButtons).toHaveLength(2);
  });

  it('has input with correct placeholder and Add button', () => {
    render(<SupplierManagementSection {...defaultProps} />);

    expect(screen.getByPlaceholderText('Shop name (e.g., Home Bargains)')).toBeInTheDocument();
    expect(screen.getByText('Add')).toBeInTheDocument();
  });

  it('Add button is disabled when input is empty', () => {
    render(<SupplierManagementSection {...defaultProps} />);

    expect(screen.getByText('Add')).toBeDisabled();
  });

  it('Add button is enabled when input has value', () => {
    render(<SupplierManagementSection {...defaultProps} newSupplierName="Tesco" />);

    expect(screen.getByText('Add')).toBeEnabled();
  });

  it('calls onAddSupplier when Add is clicked', async () => {
    const user = userEvent.setup();
    const onAddSupplier = vi.fn();

    render(<SupplierManagementSection {...defaultProps} newSupplierName="Tesco" onAddSupplier={onAddSupplier} />);

    await user.click(screen.getByText('Add'));

    expect(onAddSupplier).toHaveBeenCalledTimes(1);
  });

  it('calls onDeleteSupplier with correct ID when Remove is clicked', async () => {
    const user = userEvent.setup();
    const onDeleteSupplier = vi.fn();

    render(<SupplierManagementSection {...defaultProps} onDeleteSupplier={onDeleteSupplier} />);

    const removeButtons = screen.getAllByText('Remove');
    await user.click(removeButtons[0]!);

    expect(onDeleteSupplier).toHaveBeenCalledWith('s1');
  });

  it('shows nothing in list when suppliers array is empty', () => {
    render(<SupplierManagementSection {...defaultProps} suppliersList={[]} />);

    expect(screen.queryByText('Remove')).not.toBeInTheDocument();
    expect(screen.queryByText('Home Bargains')).not.toBeInTheDocument();
    expect(screen.queryByText('Amazon')).not.toBeInTheDocument();
  });

  it('shows Products button for each supplier', () => {
    render(<SupplierManagementSection {...defaultProps} />);

    const productsButtons = screen.getAllByText('Products');
    expect(productsButtons).toHaveLength(2);
  });
});
