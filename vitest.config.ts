import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'server',
          environment: 'node',
          include: ['server/__tests__/**/*.test.ts'],
          coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            include: ['server/lib/etsy/**/*.ts', 'server/lib/sales/**/*.ts'],
            exclude: ['server/lib/etsy/fixtures/**'],
          },
        },
      },
      {
        extends: true,
        test: {
          name: 'client',
          environment: 'jsdom',
          include: ['src/__tests__/**/*.test.{ts,tsx}'],
          setupFiles: ['src/__tests__/setup.ts'],
          coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            include: ['src/**/*.{ts,tsx}'],
            exclude: ['src/__tests__/**', 'src/main.tsx', 'src/vite-env.d.ts'],
          },
        },
      },
    ],
  },
});
