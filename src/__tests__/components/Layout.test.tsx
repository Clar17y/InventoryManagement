import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../utils/test-utils';

// Mock useAuth
const mockSignOut = vi.fn();
vi.mock('../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'test@example.com' },
    signOut: mockSignOut,
  }),
}));

import Layout from '../../components/Layout';

describe('Layout', () => {
  beforeEach(() => {
    mockSignOut.mockClear();
  });

  describe('header', () => {
    it('displays app name', () => {
      render(<Layout />);

      expect(screen.getByText('Savvy Hampers')).toBeInTheDocument();
    });

    it('has sign out button with user email tooltip', () => {
      render(<Layout />);

      const signOutButton = screen.getByRole('button');
      expect(signOutButton).toHaveAttribute('title', 'test@example.com');
    });

    it('calls signOut when button clicked', async () => {
      const user = userEvent.setup();
      render(<Layout />);

      const signOutButton = screen.getByRole('button');
      await user.click(signOutButton);

      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });
  });

  describe('navigation', () => {
    it('has Home link', () => {
      render(<Layout />);

      const homeLink = screen.getByRole('link', { name: /home/i });
      expect(homeLink).toHaveAttribute('href', '/');
    });

    it('has Stock link', () => {
      render(<Layout />);

      const stockLink = screen.getByRole('link', { name: /stock/i });
      expect(stockLink).toHaveAttribute('href', '/inventory');
    });

    it('has Hampers link', () => {
      render(<Layout />);

      const hampersLink = screen.getByRole('link', { name: /hampers/i });
      expect(hampersLink).toHaveAttribute('href', '/hampers');
    });

    it('has Sales link', () => {
      render(<Layout />);

      const salesLink = screen.getByRole('link', { name: /sales/i });
      expect(salesLink).toHaveAttribute('href', '/sales');
    });

    it('has Analytics link', () => {
      render(<Layout />);

      const analyticsLink = screen.getByRole('link', { name: /analytics/i });
      expect(analyticsLink).toHaveAttribute('href', '/analytics');
    });

    it('has Settings link', () => {
      render(<Layout />);

      const settingsLink = screen.getByRole('link', { name: /settings/i });
      expect(settingsLink).toHaveAttribute('href', '/settings');
    });

    it('renders all 6 navigation items', () => {
      render(<Layout />);

      const navLinks = screen.getAllByRole('link');
      expect(navLinks).toHaveLength(6);
    });
  });
});
