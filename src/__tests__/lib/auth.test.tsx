import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { ReactNode } from 'react';

// Mock supabase before importing auth
const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();
const mockSignInWithOtp = vi.fn();
const mockSignOut = vi.fn();

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      onAuthStateChange: (callback: Function) => mockOnAuthStateChange(callback),
      signInWithOtp: (options: any) => mockSignInWithOtp(options),
      signOut: () => mockSignOut(),
    },
  },
}));

import { AuthProvider, useAuth } from '../../lib/auth';

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    mockOnAuthStateChange.mockReturnValue({
      data: {
        subscription: {
          unsubscribe: vi.fn(),
        },
      },
    });
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <AuthProvider>{children}</AuthProvider>
  );

  describe('initial state', () => {
    it('starts with loading true', () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      // Initially loading is true
      expect(result.current.loading).toBe(true);
    });

    it('sets loading to false after session check', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });

    it('has null user when not authenticated', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.user).toBeNull();
      expect(result.current.session).toBeNull();
    });
  });

  describe('with existing session', () => {
    it('loads user from existing session', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com' };
      const mockSession = { user: mockUser, access_token: 'token' };

      mockGetSession.mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.user).toEqual(mockUser);
      expect(result.current.session).toEqual(mockSession);
    });
  });

  describe('signInWithMagicLink', () => {
    it('calls supabase signInWithOtp with email', async () => {
      mockSignInWithOtp.mockResolvedValue({ error: null });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.signInWithMagicLink('test@example.com');
      });

      expect(mockSignInWithOtp).toHaveBeenCalledWith({
        email: 'test@example.com',
        options: {
          emailRedirectTo: window.location.origin,
        },
      });
    });

    it('returns error from signInWithOtp', async () => {
      const mockError = new Error('Invalid email');
      mockSignInWithOtp.mockResolvedValue({ error: mockError });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let response: { error: Error | null } | undefined;
      await act(async () => {
        response = await result.current.signInWithMagicLink('invalid');
      });

      expect(response?.error).toEqual(mockError);
    });

    it('returns null error on success', async () => {
      mockSignInWithOtp.mockResolvedValue({ error: null });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let response: { error: Error | null } | undefined;
      await act(async () => {
        response = await result.current.signInWithMagicLink('test@example.com');
      });

      expect(response?.error).toBeNull();
    });
  });

  describe('signOut', () => {
    it('calls supabase signOut', async () => {
      mockSignOut.mockResolvedValue({ error: null });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.signOut();
      });

      expect(mockSignOut).toHaveBeenCalled();
    });
  });

  describe('auth state changes', () => {
    it('subscribes to auth state changes', () => {
      renderHook(() => useAuth(), { wrapper });

      expect(mockOnAuthStateChange).toHaveBeenCalled();
    });

    it('unsubscribes on unmount', () => {
      const unsubscribe = vi.fn();
      mockOnAuthStateChange.mockReturnValue({
        data: {
          subscription: {
            unsubscribe,
          },
        },
      });

      const { unmount } = renderHook(() => useAuth(), { wrapper });
      unmount();

      expect(unsubscribe).toHaveBeenCalled();
    });

    it('updates user when auth state changes', async () => {
      let authCallback: Function | null = null;
      mockOnAuthStateChange.mockImplementation((callback) => {
        authCallback = callback;
        return {
          data: {
            subscription: {
              unsubscribe: vi.fn(),
            },
          },
        };
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.user).toBeNull();

      // Simulate auth state change
      const newUser = { id: 'user-2', email: 'new@example.com' };
      const newSession = { user: newUser, access_token: 'new-token' };

      act(() => {
        authCallback?.('SIGNED_IN', newSession);
      });

      expect(result.current.user).toEqual(newUser);
      expect(result.current.session).toEqual(newSession);
    });
  });
});

describe('useAuth', () => {
  it('throws error when used outside AuthProvider', () => {
    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      renderHook(() => useAuth());
    }).toThrow('useAuth must be used within an AuthProvider');

    consoleSpy.mockRestore();
  });
});
