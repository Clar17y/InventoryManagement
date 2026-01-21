# Architecture Refactor v2 (Big-Bang Branch Plan)

Branch: `refactor/arch-v2`

## Goals

- Keep user-facing behaviour stable while restructuring for maintainability.
- Introduce shared API contracts used by both server and client.
- Eliminate UI palette drift by migrating `indigo-*` usage to `primary-*`.
- Reduce “mega files” by splitting into feature modules with clear boundaries.

## Deployment Baseline (Render)

- **Build command:** `npm install; npx prisma generate; npm run build`
- **Start command:** `npx tsx server/index.ts`

> Note: `npm run build` currently typechecks/builds the client (Vite) but does not compile the server to JS.

## Non-Goals (Unless Explicitly Added)

- No database schema changes.
- No route renames or response-shape changes.
- No UX redesign (beyond palette unification).

## Decisions

- **Palette:** migrate all `indigo-*` usage to `primary-*`.
- **Contracts:** shared Zod contracts in a root `contracts/` folder.
- **Client response validation:** Zod validate API responses in **dev/test and prod** by default, using `safeParse` with a user-friendly error; allow disabling via `VITE_VALIDATE_API=false`.

## Target Structure (End State)

Client:
```
src/
  app/                 # Router/providers/app shell
  pages/               # Thin route wrappers
  features/            # Feature modules (sales, inventory, etsy, ...)
  shared/              # Reusable UI + generic helpers + api plumbing
  index.css
  main.tsx
```

Server:
```
server/
  app.ts               # Express app composition (middleware + routers)
  index.ts             # Startup/listen only
  features/
  shared/
```

Contracts:
```
contracts/
  http/
  domain/
  routes/
  index.ts
```

## Milestones (Iterative)

### 0) Baseline + Guardrails
- Capture smoke checklist + baseline commands.
- Keep branch green after each milestone (`lint`, `test`, `build` as available).

### 1) Contracts Scaffolding
- Add `contracts/` folder with initial route/domain schemas.
- Add `#contracts/*` import alias wiring for:
  - Node runtime via `package.json#imports`
  - Client tooling via Vite/Vitest resolve aliases
  - TypeScript via `paths`

### 2) Server Adopts Contracts (No Behaviour Change)
- Replace inline Zod request parsing schemas with shared contracts.
- Keep Express routes thin; start moving logic into `server/features/*` services.

### 3) Client Adopts Contracts
- Use contract-derived types for client API modules.
- Add optional runtime response validation (controlled by `VITE_VALIDATE_API`).

### 4) Build/Typecheck Hardening
- Ensure server is typechecked in CI/build (even if not compiled to JS yet).
- Keep Render build/start commands working throughout.

### 5) Palette Unification
- Replace `indigo-*` Tailwind classes with `primary-*` equivalents (no visual change intended).

### 6) Frontend Feature Refactors (Largest First)
- Break up:
  - `src/pages/Sales.tsx`
  - `src/components/inventory/AddStockForm.tsx`
  - `src/components/EtsySyncPanel.tsx`
- Introduce `src/features/*` and leave `src/pages/*` as composition.

### 7) Backend Feature Refactors
- Split large route modules (especially Etsy) into `server/features/*`.
- Centralise shared server concerns in `server/shared/*`.

### 8) Cleanup + Merge Readiness
- Remove temporary shims.
- Update `README.md` project structure section.
- Final full verification + smoke test.

