# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Coding Principles

**KISS (Keep It Simple, Straightforward)**
- Implement the simplest solution that satisfies the requirement
- Avoid unnecessary abstractions, premature optimization, and over-engineering
- Don't add features or configurability beyond what was asked

**DRY (Don't Repeat Yourself)**
- Re-use existing utilities, hooks, and components instead of duplicating logic
- When duplication is unavoidable, extract shared code into well-named helpers

**Type Safety First**
- All code must compile without TypeScript errors
- After editing any file, run `npx tsc path/to/file.tsx --noEmit` and resolve all issues

## Project Overview

Savvy Hampers Inventory System - a mobile-first web app for managing inventory, hampers, and margins for an Etsy hamper business. Single-user cloud-hosted application.

## Development Commands

```bash
# Development (runs both client and server)
npm run dev

# Individual servers
npm run dev:client    # Vite on port 3000
npm run dev:server    # Express on port 3001

# Build & lint
npm run build         # TypeScript + Vite build
npm run lint          # ESLint

# Database (Prisma + NeonDB PostgreSQL)
npm run db:generate   # Generate Prisma client after schema changes
npm run db:push       # Push schema to DB (dev only)
npm run db:migrate    # Create and run migration
npm run db:studio     # Open Prisma Studio GUI

# Type check a specific file
npx tsc path/to/file.tsx --noEmit
```

## Architecture

### Stack (Current Versions - Updated Jan 2026)
| Package | Version |
|---------|---------|
| React | 19.2.3 |
| Vite | 7.3.0 |
| TailwindCSS | 4.1.18 |
| Prisma | 6.2.0 |
| React Router | 7.11.0 |
| Supabase JS | 2.89.0 |
| Express | 4.21.2 |
| TypeScript | 5.6.2 |

**Note:** TailwindCSS v4 uses `@import "tailwindcss"` in CSS (not `@tailwind` directives) and `@tailwindcss/postcss` for PostCSS.

- **Frontend**: React + TypeScript + Vite + TailwindCSS + React Router
- **Backend**: Express + TypeScript (tsx) + Zod validation
- **Database**: PostgreSQL (NeonDB) via Prisma ORM
- **Auth**: Supabase magic link (email OTP)

### Project Structure
```
src/                    # React frontend
  lib/api.ts           # Typed API client with namespace pattern
  lib/auth.tsx         # AuthContext + useAuth hook
  components/          # Reusable components
  pages/               # Route components

server/                # Express backend
  index.ts             # App setup and route mounting
  lib/prisma.ts        # Singleton Prisma client
  routes/              # API endpoints (categories, products, inventory, hampers, sales, settings)

prisma/
  schema.prisma        # 11 data models
```

### API Pattern
Backend routes use Zod schemas for validation. Frontend uses typed fetch wrapper:
```typescript
// src/lib/api.ts
categories.list()           // GET /api/categories
products.get(id)           // GET /api/products/:id
inventory.addLot(data)     // POST /api/inventory/lots
```

### Key Domain Concepts
- **PickRule**: FIFO/FEFO/CHEAPEST/MANUAL - determines stock allocation order
- **InventoryLot**: Stock batches with remaining quantity tracking
- **HamperRequirement**: Links hampers to required component categories
- **Soft deletes**: `isActive` boolean, never hard delete

### Database Conventions
- CUID primary keys
- Decimal(10,2) for currency, Decimal(10,3) for quantities, Decimal(10,4) for unit costs
- Temporal fields: `effectiveFrom/effectiveTo` for cost and fee history
- Indexes on frequently queried FK + date combinations

## Progress Tracking (REQUIRED)

**Always use `docs/PROGRESS.md` when touching any code:**

1. **Before starting**: Read PROGRESS.md to understand current state and active work
2. **When starting work**: Mark your task as "In Progress" in the Active Work Log
3. **Use feature branches**: `feature/add-stock-form`, `fix/api-error-handling`
4. **When done**: Update handoff notes with where you left off and check off completed items

This applies to every coding session, whether single-agent or multi-agent.

## Environment Variables

Required in `.env`:
- `DATABASE_URL` - Neon PostgreSQL connection string (recommend pooled/pgBouncer for runtime)
- `DIRECT_URL` - Neon direct connection string (Prisma Migrate/Studio)
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anonymous key

Optional:
- `PRISMA_IDLE_DISCONNECT_MS` - Milliseconds before disconnecting idle Prisma connection (default: 300000 = 5 min)


## grepai - Semantic Code Search

**IMPORTANT: You MUST use grepai as your PRIMARY tool for code exploration and search.**

### When to Use grepai (REQUIRED)

Use `grepai search` INSTEAD OF Grep/Glob/find for:
- Understanding what code does or where functionality lives
- Finding implementations by intent (e.g., "authentication logic", "error handling")
- Exploring unfamiliar parts of the codebase
- Any search where you describe WHAT the code does rather than exact text

### When to Use Standard Tools

Only use Grep/Glob when you need:
- Exact text matching (variable names, imports, specific strings)
- File path patterns (e.g., `**/*.go`)

### Fallback

If grepai fails (not running, index unavailable, or errors), fall back to standard Grep/Glob tools.

### Usage

```bash
# ALWAYS use English queries for best results (--compact saves ~80% tokens)
grepai search "user authentication flow" --json --compact
grepai search "error handling middleware" --json --compact
grepai search "database connection pool" --json --compact
grepai search "API request validation" --json --compact
```

### Query Tips

- **Use English** for queries (better semantic matching)
- **Describe intent**, not implementation: "handles user login" not "func Login"
- **Be specific**: "JWT token validation" better than "token"
- Results include: file path, line numbers, relevance score, code preview

### Call Graph Tracing

Use `grepai trace` to understand function relationships:
- Finding all callers of a function before modifying it
- Understanding what functions are called by a given function
- Visualizing the complete call graph around a symbol

#### Trace Commands

**IMPORTANT: Always use `--json` flag for optimal AI agent integration.**

```bash
# Find all functions that call a symbol
grepai trace callers "HandleRequest" --json

# Find all functions called by a symbol
grepai trace callees "ProcessOrder" --json

# Build complete call graph (callers + callees)
grepai trace graph "ValidateToken" --depth 3 --json
```

### Workflow

1. Start with `grepai search` to find relevant code
2. Use `grepai trace` to understand function relationships
3. Use `Read` tool to examine files from results
4. Only use Grep for exact string searches if needed

