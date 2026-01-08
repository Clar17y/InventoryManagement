import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../utils/test-utils';

// Mock useAuth
const mockSignInWithMagicLink = vi.fn();
vi.mock('../../lib/auth', () => ({
  useAuth: () => ({
    signInWithMagicLink: mockSignInWithMagicLink,
  }),
}));

import Login from '../../pages/Login';

describe('Login', () => {
  beforeEach(() => {
    mockSignInWithMagicLink.mockClear();
    mockSignInWithMagicLink.mockResolvedValue({ error: null });
  });

  describe('rendering', () => {
    it('displays app name', () => {
      render(<Login />);

      expect(screen.getByText('Savvy Hampers')).toBeInTheDocument();
    });

    it('displays sign in header', () => {
      render(<Login />);

      expect(screen.getByText('Sign In')).toBeInTheDocument();
    });

    it('has email input', () => {
      render(<Login />);

      expect(screen.getByLabelText('Email address')).toBeInTheDocument();
    });

    it('has submit button', () => {
      render(<Login />);

      expect(screen.getByRole('button', { name: 'Send Magic Link' })).toBeInTheDocument();
    });

    it('displays helper text', () => {
      render(<Login />);

      expect(screen.getByText(/magic link to sign in/i)).toBeInTheDocument();
    });
  });

  describe('form submission', () => {
    it('calls signInWithMagicLink with email on submit', async () => {
      const user = userEvent.setup();
      render(<Login />);

      const emailInput = screen.getByLabelText('Email address');
      await user.type(emailInput, 'test@example.com');

      const submitButton = screen.getByRole('button', { name: 'Send Magic Link' });
      await user.click(submitButton);

      expect(mockSignInWithMagicLink).toHaveBeenCalledWith('test@example.com');
    });

    it('shows loading state during submission', async () => {
      const user = userEvent.setup();
      mockSignInWithMagicLink.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ error: null }), 100))
      );
      render(<Login />);

      const emailInput = screen.getByLabelText('Email address');
      await user.type(emailInput, 'test@example.com');

      const submitButton = screen.getByRole('button', { name: 'Send Magic Link' });
      await user.click(submitButton);

      expect(screen.getByRole('button', { name: 'Sending...' })).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Send Magic Link' })).toBeInTheDocument();
      });
    });

    it('disables input during loading', async () => {
      const user = userEvent.setup();
      mockSignInWithMagicLink.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ error: null }), 100))
      );
      render(<Login />);

      const emailInput = screen.getByLabelText('Email address');
      await user.type(emailInput, 'test@example.com');

      const submitButton = screen.getByRole('button', { name: 'Send Magic Link' });
      await user.click(submitButton);

      expect(emailInput).toBeDisabled();

      await waitFor(() => {
        expect(emailInput).not.toBeDisabled();
      });
    });
  });

  describe('success state', () => {
    it('shows success message after successful submission', async () => {
      const user = userEvent.setup();
      render(<Login />);

      const emailInput = screen.getByLabelText('Email address');
      await user.type(emailInput, 'test@example.com');

      const submitButton = screen.getByRole('button', { name: 'Send Magic Link' });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Check your email for the login link!')).toBeInTheDocument();
      });
    });

    it('clears email input after successful submission', async () => {
      const user = userEvent.setup();
      render(<Login />);

      const emailInput = screen.getByLabelText('Email address') as HTMLInputElement;
      await user.type(emailInput, 'test@example.com');

      const submitButton = screen.getByRole('button', { name: 'Send Magic Link' });
      await user.click(submitButton);

      await waitFor(() => {
        expect(emailInput.value).toBe('');
      });
    });
  });

  describe('error state', () => {
    it('shows error message when sign in fails', async () => {
      const user = userEvent.setup();
      mockSignInWithMagicLink.mockResolvedValue({
        error: new Error('Invalid email address'),
      });
      render(<Login />);

      // Use valid email format to pass HTML validation
      const emailInput = screen.getByLabelText('Email address');
      await user.type(emailInput, 'test@example.com');

      const submitButton = screen.getByRole('button', { name: 'Send Magic Link' });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Invalid email address')).toBeInTheDocument();
      });
    });

    it('does not clear email on error', async () => {
      const user = userEvent.setup();
      mockSignInWithMagicLink.mockResolvedValue({
        error: new Error('Invalid email'),
      });
      render(<Login />);

      const emailInput = screen.getByLabelText('Email address') as HTMLInputElement;
      await user.type(emailInput, 'test@example.com');

      const submitButton = screen.getByRole('button', { name: 'Send Magic Link' });
      await user.click(submitButton);

      await waitFor(() => {
        expect(emailInput.value).toBe('test@example.com');
      });
    });
  });
});
