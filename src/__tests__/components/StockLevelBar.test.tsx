import { describe, it, expect } from 'vitest';
import { render, screen } from '../utils/test-utils';
import StockLevelBar from '../../components/inventory/StockLevelBar';

describe('StockLevelBar', () => {
  describe('label display', () => {
    it('shows current stock value by default', () => {
      render(<StockLevelBar current={15} />);

      expect(screen.getByText('15')).toBeInTheDocument();
    });

    it('hides label when showLabel is false', () => {
      render(<StockLevelBar current={15} showLabel={false} />);

      expect(screen.queryByText('15')).not.toBeInTheDocument();
    });
  });

  describe('color thresholds', () => {
    it('shows gray when stock is 0', () => {
      const { container } = render(<StockLevelBar current={0} />);

      const progressBar = container.querySelector('.bg-gray-300');
      expect(progressBar).toBeInTheDocument();
    });

    it('shows red when stock is low (<=5)', () => {
      const { container } = render(<StockLevelBar current={3} />);

      const progressBar = container.querySelector('.bg-red-500');
      expect(progressBar).toBeInTheDocument();
    });

    it('shows amber when stock is medium (6-10)', () => {
      const { container } = render(<StockLevelBar current={8} />);

      const progressBar = container.querySelector('.bg-amber-500');
      expect(progressBar).toBeInTheDocument();
    });

    it('shows green when stock is healthy (>10)', () => {
      const { container } = render(<StockLevelBar current={15} />);

      const progressBar = container.querySelector('.bg-emerald-500');
      expect(progressBar).toBeInTheDocument();
    });
  });

  describe('text color matches bar color', () => {
    it('has gray text when stock is 0', () => {
      const { container } = render(<StockLevelBar current={0} />);

      const label = container.querySelector('.text-gray-500');
      expect(label).toBeInTheDocument();
    });

    it('has red text when stock is low', () => {
      const { container } = render(<StockLevelBar current={3} />);

      const label = container.querySelector('.text-red-600');
      expect(label).toBeInTheDocument();
    });

    it('has amber text when stock is medium', () => {
      const { container } = render(<StockLevelBar current={8} />);

      const label = container.querySelector('.text-amber-600');
      expect(label).toBeInTheDocument();
    });

    it('has green text when stock is healthy', () => {
      const { container } = render(<StockLevelBar current={15} />);

      const label = container.querySelector('.text-emerald-600');
      expect(label).toBeInTheDocument();
    });
  });

  describe('size variants', () => {
    it('uses medium height by default', () => {
      const { container } = render(<StockLevelBar current={10} />);

      const bar = container.querySelector('.h-2');
      expect(bar).toBeInTheDocument();
    });

    it('uses small height when size is sm', () => {
      const { container } = render(<StockLevelBar current={10} size="sm" />);

      const bar = container.querySelector('.h-1\\.5');
      expect(bar).toBeInTheDocument();
    });
  });

  describe('percentage calculation', () => {
    it('calculates percentage based on default max of 20', () => {
      const { container } = render(<StockLevelBar current={10} />);

      const progressBar = container.querySelector('[style*="width"]');
      expect(progressBar).toHaveStyle({ width: '50%' });
    });

    it('calculates percentage based on custom max', () => {
      const { container } = render(<StockLevelBar current={50} max={100} />);

      const progressBar = container.querySelector('[style*="width"]');
      expect(progressBar).toHaveStyle({ width: '50%' });
    });

    it('caps percentage at 100%', () => {
      const { container } = render(<StockLevelBar current={30} max={20} />);

      const progressBar = container.querySelector('[style*="width"]');
      expect(progressBar).toHaveStyle({ width: '100%' });
    });

    it('shows 0% for zero stock', () => {
      const { container } = render(<StockLevelBar current={0} />);

      const progressBar = container.querySelector('[style*="width"]');
      expect(progressBar).toHaveStyle({ width: '0%' });
    });
  });
});
