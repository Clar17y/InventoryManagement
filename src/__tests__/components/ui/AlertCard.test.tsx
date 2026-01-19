import { describe, it, expect } from 'vitest';
import { render, screen } from '../../utils/test-utils';
import AlertCard from '../../../components/ui/AlertCard';

describe('AlertCard', () => {
  const defaultItems = [
    { id: '1', title: 'Item 1', subtitle: 'Subtitle 1', value: '10' },
    { id: '2', title: 'Item 2', subtitle: 'Subtitle 2', value: '20' },
  ];

  describe('rendering types', () => {
    it('renders danger type with correct styles', () => {
      render(<AlertCard type="danger" title="Danger Alert" items={defaultItems} />);

      expect(screen.getByText('Danger Alert')).toBeInTheDocument();
      const header = screen.getByText('Danger Alert').closest('div');
      expect(header).toHaveClass('bg-red-50');
    });

    it('renders warning type with correct styles', () => {
      render(<AlertCard type="warning" title="Warning Alert" items={defaultItems} />);

      expect(screen.getByText('Warning Alert')).toBeInTheDocument();
      const header = screen.getByText('Warning Alert').closest('div');
      expect(header).toHaveClass('bg-amber-50');
    });

    it('renders info type with correct styles', () => {
      render(<AlertCard type="info" title="Info Alert" items={defaultItems} />);

      expect(screen.getByText('Info Alert')).toBeInTheDocument();
      const header = screen.getByText('Info Alert').closest('div');
      expect(header).toHaveClass('bg-info-50');
    });
  });

  describe('items display', () => {
    it('displays item count in header', () => {
      render(<AlertCard type="info" title="Test" items={defaultItems} />);

      expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('displays all items with titles', () => {
      render(<AlertCard type="info" title="Test" items={defaultItems} />);

      expect(screen.getByText('Item 1')).toBeInTheDocument();
      expect(screen.getByText('Item 2')).toBeInTheDocument();
    });

    it('displays subtitles when provided', () => {
      render(<AlertCard type="info" title="Test" items={defaultItems} />);

      expect(screen.getByText('Subtitle 1')).toBeInTheDocument();
      expect(screen.getByText('Subtitle 2')).toBeInTheDocument();
    });

    it('displays values when provided', () => {
      render(<AlertCard type="info" title="Test" items={defaultItems} />);

      expect(screen.getByText('10')).toBeInTheDocument();
      expect(screen.getByText('20')).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('shows default empty message when no items', () => {
      render(<AlertCard type="info" title="Test" items={[]} />);

      expect(screen.getByText('No alerts')).toBeInTheDocument();
    });

    it('shows custom empty message when provided', () => {
      render(<AlertCard type="info" title="Test" items={[]} emptyMessage="Nothing to show" />);

      expect(screen.getByText('Nothing to show')).toBeInTheDocument();
    });

    it('shows count as 0 when empty', () => {
      render(<AlertCard type="info" title="Test" items={[]} />);

      expect(screen.getByText('0')).toBeInTheDocument();
    });
  });

  describe('overflow handling', () => {
    it('only shows first 5 items', () => {
      const manyItems = Array.from({ length: 7 }, (_, i) => ({
        id: String(i + 1),
        title: `Item ${i + 1}`,
      }));

      render(<AlertCard type="info" title="Test" items={manyItems} />);

      expect(screen.getByText('Item 1')).toBeInTheDocument();
      expect(screen.getByText('Item 5')).toBeInTheDocument();
      expect(screen.queryByText('Item 6')).not.toBeInTheDocument();
    });

    it('shows overflow message with remaining count', () => {
      const manyItems = Array.from({ length: 8 }, (_, i) => ({
        id: String(i + 1),
        title: `Item ${i + 1}`,
      }));

      render(<AlertCard type="info" title="Test" items={manyItems} />);

      expect(screen.getByText('+3 more')).toBeInTheDocument();
    });

    it('does not show overflow message when 5 or fewer items', () => {
      const fiveItems = Array.from({ length: 5 }, (_, i) => ({
        id: String(i + 1),
        title: `Item ${i + 1}`,
      }));

      render(<AlertCard type="info" title="Test" items={fiveItems} />);

      expect(screen.queryByText(/\+\d+ more/)).not.toBeInTheDocument();
    });
  });

  describe('links', () => {
    it('renders items with links as clickable', () => {
      const itemsWithLinks = [
        { id: '1', title: 'Link Item', link: '/products/1' },
      ];

      render(<AlertCard type="info" title="Test" items={itemsWithLinks} />);

      const link = screen.getByRole('link', { name: 'Link Item' });
      expect(link).toHaveAttribute('href', '/products/1');
    });

    it('renders items without links as plain text', () => {
      const itemsWithoutLinks = [
        { id: '1', title: 'Plain Item' },
      ];

      render(<AlertCard type="info" title="Test" items={itemsWithoutLinks} />);

      expect(screen.getByText('Plain Item')).toBeInTheDocument();
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });
  });

  describe('icon', () => {
    it('renders icon when provided', () => {
      render(
        <AlertCard
          type="danger"
          title="Test"
          items={[]}
          icon={<span data-testid="test-icon">!</span>}
        />
      );

      expect(screen.getByTestId('test-icon')).toBeInTheDocument();
    });
  });
});
