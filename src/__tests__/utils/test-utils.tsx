import { ReactElement, ReactNode } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { User, Session } from '@supabase/supabase-js';
import { vi } from 'vitest';

// Mock auth context type
interface MockAuthContext {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signInWithMagicLink: (email: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

// Default mock auth context
export const createMockAuthContext = (overrides: Partial<MockAuthContext> = {}): MockAuthContext => ({
  user: null,
  session: null,
  loading: false,
  signInWithMagicLink: vi.fn().mockResolvedValue({ error: null }),
  signOut: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

// Create authenticated mock context
export const createAuthenticatedContext = (): MockAuthContext =>
  createMockAuthContext({
    user: { id: 'test-user-id', email: 'test@example.com' } as User,
    session: { access_token: 'test-token' } as Session,
  });

// Wrapper with router
interface WrapperProps {
  children: ReactNode;
}

const AllProviders = ({ children }: WrapperProps) => {
  return <BrowserRouter>{children}</BrowserRouter>;
};

// Custom render with all providers
const customRender = (ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) =>
  render(ui, { wrapper: AllProviders, ...options });

// Re-export everything
export * from '@testing-library/react';
export { customRender as render };
