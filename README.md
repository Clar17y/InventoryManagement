# Savvy Hampers Inventory Manager

Mobile-first inventory, costing, and margin tracking for a hamper / kit business (built for an Etsy seller).

## Features

- Lot-based inventory with expiry dates and FIFO allocation
- Barcode scanning (camera or handheld scanner input) for fast stock entry
- Hamper definitions with category-based requirements and real-time "can make" availability
- Sales recording with automatic stock consumption and margin calculation (including Etsy fees)
- Business expenses tracking (packaging, ads, postage, etc.)
- Analytics dashboards plus low-stock / expiring alerts
- Optional Etsy integration to sync listing inventory (real mode or mock mode for dev)
- Historical import from spreadsheets (sales + expenses)

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite + TypeScript + TailwindCSS |
| Backend | Express + TypeScript |
| Database | PostgreSQL |
| ORM | Prisma |
| Auth | Supabase (magic links) |
| Barcode | html5-qrcode |

## Quick Start (Development)

### Prerequisites

- Node.js 20+
- PostgreSQL database (Neon works well)
- Supabase project (Auth)

### Setup

```bash
npm install
cp .env.example .env

npm run db:generate
npm run db:migrate

npm run dev
```

### URLs

- UI: `https://localhost:3000`
- API: `http://localhost:3001` (proxied via `/api` from the UI)

Note: the dev UI uses a self-signed HTTPS cert (so barcode scanning works from mobile devices on your LAN). You may need to accept the certificate warning on the device/browser.

## Environment Variables

See `.env.example` for the full list. Minimum required for local dev:

- `DATABASE_URL` and `DIRECT_URL` (Postgres)
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (Supabase Auth)

Optional:

- `ETSY_MODE=mock` to run without Etsy credentials
- `ETSY_API_KEY` and `ETSY_REDIRECT_URI` for real Etsy integration

## Auth

All `/api/*` endpoints (except `/api/health` and the Etsy callback) require a Supabase access token (`Authorization: Bearer <token>`). The frontend sends this automatically after login.

For local development only, you can bypass auth by setting either:

- `DEV_BYPASS_AUTH=true` (server-only), or
- `VITE_DEV_BYPASS_AUTH=true` (client + server)

## Production (Single Server)

The Express server can serve the built frontend from `dist/`.

```bash
npm run build
npx tsx server/index.ts
```

Then open `http://localhost:3001` (or set `PORT` to choose a different port).

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start UI + API in development mode |
| `npm run build` | Typecheck + build the frontend |
| `npm run lint` | Lint |
| `npm test` | Run tests (watch) |
| `npm run test:run` | Run tests (CI mode) |
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:studio` | Open Prisma Studio |
| `npm run db:backup` | Run DB backup script |

## Documentation

- `docs/IMPLEMENTATION_PLAN.md` (design and technical spec)
- `docs/PROGRESS.md` (development notes / handoff)

## License

MIT
