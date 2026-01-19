# Shared Contracts

Shared request/response and domain schemas used by both:
- `server/` (Express route validation)
- `src/` (API client types + optional runtime response validation)

Conventions:
- Prefer Zod schemas as the source of truth and derive TypeScript types via `z.infer<>`.
- Keep schemas aligned with the **existing** API shapes (no behavioural changes during refactor).

Import path:
- Use `#contracts/*` (wired via `package.json#imports`, Vite/Vitest aliases, and TS `paths`).

