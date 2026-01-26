# Savvy Hampers

Inventory, costing, and margin management system for an Etsy hamper business. Cloud-hosted, mobile-first, single-user.

## Features

- **Inventory Management** – Track products with barcode scanning, lot-based stock (FIFO/FEFO), expiry dates
- **Hamper Builder** – Define hamper requirements by category, view real-time availability ("can make X")
- **Sales & Margins** – Record sales with automatic stock allocation, Etsy fee calculation, margin tracking
- **Business Expenses** – Track advertising, packaging, postage, and other business costs
- **Historical Import** – Import sales and expenses from Excel spreadsheets
- **Low Stock Alerts** – Per-product threshold alerts and dashboard warnings

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19 + Vite + TypeScript + TailwindCSS 4 |
| Backend | Express + TypeScript |
| Database | PostgreSQL (Neon) |
| ORM | Prisma |
| Auth | Supabase (magic links) |
| Barcode | html5-qrcode |

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL database (recommend [Neon](https://neon.tech) for serverless)
- Supabase project for auth

### Installation

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your DATABASE_URL (runtime, recommend pooled) + DIRECT_URL (migrations) and Supabase credentials

# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate

# Start development server
npm run dev
```

The app runs at `http://localhost:3000` with the API at `http://localhost:3001` (proxied via `/api`).

All `/api/*` endpoints (except `/api/health`) require a Supabase access token (`Authorization: Bearer <token>`); the frontend sends this automatically after login. For development only, you can set `VITE_DEV_BYPASS_AUTH=true` to bypass auth in both the UI and API.

## Project Structure

```
├── src/              # React frontend
│   ├── components/   # Reusable UI components
│   ├── pages/        # Page components (Dashboard, Products, Sales, etc.)
│   └── lib/          # API client and utilities
├── server/           # Express API backend
│   └── routes/       # API route handlers
├── prisma/           # Database schema and migrations
├── scripts/          # Utility scripts (historical import)
└── docs/             # Project documentation
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start frontend + backend in development mode |
| `npm run build` | Build for production |
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:studio` | Open Prisma Studio GUI |

## Documentation

See the [`docs/`](./docs) folder for:

- [Implementation Plan](./docs/IMPLEMENTATION_PLAN.md) – Full technical specification
- [Progress Tracker](./docs/PROGRESS.md) – Development status and handoff notes

## Development Status

| Phase | Status |
|-------|--------|
| Foundation | ✅ Complete |
| Core Data (Products, Categories, Stock) | ✅ Complete |
| Hampers | ✅ Complete |
| Sales & Margins | ✅ Complete |
| Finance Tracking | ✅ Complete |
| Historical Import | ✅ Complete |
| Polish & Alerts | ✅ Complete |

## Effort Estimates (Tokens)

When planning work, estimate effort as an approximate **LLM token budget** (prompt + completion) for an AI coding agent, not wall-clock time.

- **Tiny change**: ~5k–15k tokens
- **Small feature**: ~15k–50k tokens
- **Medium feature**: ~50k–150k tokens
- **Large feature/refactor**: ~150k–400k+ tokens

## License

MIT
