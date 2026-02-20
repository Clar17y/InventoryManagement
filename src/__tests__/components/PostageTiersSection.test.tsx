import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../utils/test-utils';
import PostageTiersSection from '../../features/settings/components/PostageTiersSection';

const sampleTiers = [
  { id: 'tier1', etsyCharge: 5.00, actualCost: 5.05, label: 'Standard', isActive: true, createdAt: '2024-01-01T00:00:00Z' },
  { id: 'tier2', etsyCharge: 6.00, actualCost: 8.55, label: null, isActive: true, createdAt: '2024-01-01T00:00:00Z' },
];

const defaultProps = {
  tiers: sampleTiers as any,
  newEtsyCharge: '',
  newActualCost: '',
  onNewEtsyChargeChange: vi.fn(),
  onNewActualCostChange: vi.fn(),
  saving: false,
  onAddTier: vi.fn(),
  onDeleteTier: vi.fn(),
};

describe('PostageTiersSection', () => {
  it('renders section title', () => {
    render(<PostageTiersSection {...defaultProps} />);

    expect(screen.getByText('Postage Tiers')).toBeInTheDocument();
  });

  it('renders description text about mapping Etsy charges', () => {
    render(<PostageTiersSection {...defaultProps} />);

    expect(screen.getByText(/Map Etsy shipping charges to actual postage costs/)).toBeInTheDocument();
  });

  it('renders existing tiers with Etsy charges and actual cost format', () => {
    render(<PostageTiersSection {...defaultProps} />);

    expect(screen.getByText(/Etsy charges £5\.00/)).toBeInTheDocument();
    expect(screen.getByText(/Actual cost £5\.05/)).toBeInTheDocument();
    expect(screen.getByText(/Etsy charges £6\.00/)).toBeInTheDocument();
    expect(screen.getByText(/Actual cost £8\.55/)).toBeInTheDocument();
  });

  it('shows tier label in parentheses when present', () => {
    render(<PostageTiersSection {...defaultProps} />);

    expect(screen.getByText('(Standard)')).toBeInTheDocument();
  });

  it('renders Remove button for each tier', () => {
    render(<PostageTiersSection {...defaultProps} />);

    const removeButtons = screen.getAllByText('Remove');
    expect(removeButtons).toHaveLength(2);
  });

  it('has two input fields and an Add button', () => {
    render(<PostageTiersSection {...defaultProps} />);

    expect(screen.getByPlaceholderText('Etsy charge')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Actual cost')).toBeInTheDocument();
    expect(screen.getByText('Add')).toBeInTheDocument();
  });

  it('Add button is disabled when inputs are empty', () => {
    render(<PostageTiersSection {...defaultProps} />);

    expect(screen.getByText('Add')).toBeDisabled();
  });

  it('Add button is enabled when both inputs have values', () => {
    render(<PostageTiersSection {...defaultProps} newEtsyCharge="3.99" newActualCost="4.50" />);

    expect(screen.getByText('Add')).toBeEnabled();
  });

  it('calls onAddTier when Add is clicked', async () => {
    const user = userEvent.setup();
    const onAddTier = vi.fn();

    render(<PostageTiersSection {...defaultProps} newEtsyCharge="3.99" newActualCost="4.50" onAddTier={onAddTier} />);

    await user.click(screen.getByText('Add'));

    expect(onAddTier).toHaveBeenCalledTimes(1);
  });

  it('calls onDeleteTier with correct ID when Remove is clicked', async () => {
    const user = userEvent.setup();
    const onDeleteTier = vi.fn();

    render(<PostageTiersSection {...defaultProps} onDeleteTier={onDeleteTier} />);

    const removeButtons = screen.getAllByText('Remove');
    await user.click(removeButtons[0]!);

    expect(onDeleteTier).toHaveBeenCalledWith('tier1');
  });

  it('shows nothing in list when tiers array is empty', () => {
    render(<PostageTiersSection {...defaultProps} tiers={[]} />);

    expect(screen.queryByText('Remove')).not.toBeInTheDocument();
    expect(screen.queryByText(/Etsy charges/)).not.toBeInTheDocument();
  });
});
