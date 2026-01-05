# Savvy Hampers Inventory System - Implementation Plan

## Overview
Inventory, costing, and margin system for Etsy hamper business. Cloud-hosted, mobile-first, single-user.

## Tech Stack
- **Frontend**: React 18 + Vite + TypeScript + TailwindCSS
- **Backend**: Node.js + Express + TypeScript (or tRPC for type safety)
- **Database**: PostgreSQL (Neon or Supabase)
- **ORM**: Prisma
- **Auth**: Supabase Auth (simple, built-in) or NextAuth
- **Hosting**: Vercel (frontend) + Railway/Render (API) or full-stack on Vercel
- **Barcode**: QuaggaJS or html5-qrcode (browser-based camera scanning)

## Project Structure
```
/
├── prisma/
│   └── schema.prisma
├── src/
│   ├── api/              # API routes (Express or Vercel API routes)
│   ├── components/       # React components
│   │   ├── ui/           # Reusable UI (buttons, inputs, cards)
│   │   ├── inventory/    # Inventory-specific components
│   │   ├── hampers/      # Hamper-specific components
│   │   ├── sales/        # Sales-specific components
│   │   └── scanner/      # Barcode scanner component
│   ├── hooks/            # Custom React hooks
│   ├── lib/              # Utilities, Prisma client, API client
│   ├── pages/            # Page components / routes
│   └── types/            # TypeScript types
├── package.json
├── vite.config.ts
└── tailwind.config.js
```

## Database Schema (Prisma)

```prisma
// Core entities
model ComponentCategory {
  id          String    @id @default(cuid())
  name        String    @unique
  description String?
  pickRule    PickRule  @default(FIFO)  // FIFO, FEFO, CHEAPEST, MANUAL
  isActive    Boolean   @default(true)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  products            Product[]
  hamperRequirements  HamperRequirement[]
}

model Product {
  id          String    @id @default(cuid())
  name        String
  barcode     String?   @unique  // EAN/UPC for scanning
  categoryId  String
  category    ComponentCategory @relation(fields: [categoryId], references: [id])
  isActive    Boolean   @default(true)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  costs       ProductCost[]
  lots        InventoryLot[]
}

model ProductCost {
  id          String    @id @default(cuid())
  productId   String
  product     Product   @relation(fields: [productId], references: [id])
  unitCost    Decimal   @db.Decimal(10, 2)
  effectiveFrom DateTime
  effectiveTo   DateTime?
  createdAt   DateTime  @default(now())

  @@index([productId, effectiveFrom])
}

model InventoryLot {
  id          String    @id @default(cuid())
  productId   String
  product     Product   @relation(fields: [productId], references: [id])
  quantity    Decimal   @db.Decimal(10, 3)  // Supports grams, metres, etc.
  remaining   Decimal   @db.Decimal(10, 3)
  unitCost    Decimal   @db.Decimal(10, 2)  // Snapshot at receipt time
  receivedAt  DateTime  @default(now())
  expiresAt   DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  consumptions SaleConsumption[]

  @@index([productId, receivedAt])
}

model Hamper {
  id          String    @id @default(cuid())
  name        String
  etsyListingId String? @unique  // For future Etsy sync
  sellingPrice Decimal  @db.Decimal(10, 2)
  isActive    Boolean   @default(true)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  requirements HamperRequirement[]
  saleLines    SaleLine[]
}

model HamperRequirement {
  id          String    @id @default(cuid())
  hamperId    String
  hamper      Hamper    @relation(fields: [hamperId], references: [id], onDelete: Cascade)
  categoryId  String
  category    ComponentCategory @relation(fields: [categoryId], references: [id])
  quantity    Decimal   @db.Decimal(10, 3)
  isOptional  Boolean   @default(false)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@unique([hamperId, categoryId])
}

model Sale {
  id              String    @id @default(cuid())
  saleDate        DateTime  @default(now())
  etsyOrderId     String?   @unique  // For future Etsy sync
  grossRevenue    Decimal   @db.Decimal(10, 2)
  etsyFees        Decimal   @db.Decimal(10, 2) @default(0)
  packagingOverhead Decimal @db.Decimal(10, 2) @default(0)
  netRevenue      Decimal   @db.Decimal(10, 2)  // Computed: gross - fees - overhead
  totalCost       Decimal   @db.Decimal(10, 2)  // Sum of all consumed costs
  margin          Decimal   @db.Decimal(10, 2)  // netRevenue - totalCost
  notes           String?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  lines           SaleLine[]
}

model SaleLine {
  id          String    @id @default(cuid())
  saleId      String
  sale        Sale      @relation(fields: [saleId], references: [id], onDelete: Cascade)
  hamperId    String
  hamper      Hamper    @relation(fields: [hamperId], references: [id])
  quantity    Int       @default(1)
  unitPrice   Decimal   @db.Decimal(10, 2)  // Snapshot
  lineCost    Decimal   @db.Decimal(10, 2)  // Sum of consumptions
  createdAt   DateTime  @default(now())

  consumptions SaleConsumption[]
}

model SaleConsumption {
  id          String    @id @default(cuid())
  saleLineId  String
  saleLine    SaleLine  @relation(fields: [saleLineId], references: [id], onDelete: Cascade)
  lotId       String
  lot         InventoryLot @relation(fields: [lotId], references: [id])
  quantity    Decimal   @db.Decimal(10, 3)
  unitCost    Decimal   @db.Decimal(10, 2)  // Snapshot from lot
  createdAt   DateTime  @default(now())
}

// Configuration
model EtsyFeeConfig {
  id              String    @id @default(cuid())
  name            String
  percentageFee   Decimal   @db.Decimal(5, 4)  // e.g., 0.0650 = 6.5%
  fixedFee        Decimal   @db.Decimal(10, 2) // e.g., 0.20
  paymentFee      Decimal   @db.Decimal(5, 4)  // Payment processing %
  effectiveFrom   DateTime
  effectiveTo     DateTime?
  createdAt       DateTime  @default(now())
}

model PackagingOverhead {
  id              String    @id @default(cuid())
  name            String    // e.g., "Tape", "Bubble wrap"
  costPerOrder    Decimal   @db.Decimal(10, 2)
  effectiveFrom   DateTime
  effectiveTo     DateTime?
  createdAt       DateTime  @default(now())
}

enum PickRule {
  FIFO
  FEFO
  CHEAPEST
  MANUAL
}
```

## Key API Endpoints

### Products & Inventory
- `GET /api/products` - List products with current stock levels
- `GET /api/products/barcode/:barcode` - Lookup product by barcode (for scanning)
- `POST /api/products` - Create product
- `POST /api/inventory/lots` - Add inventory lot (stock receipt)
- `GET /api/inventory/low-stock` - Products/categories below threshold

### Hampers
- `GET /api/hampers` - List hampers with availability counts
- `GET /api/hampers/:id/availability` - Detailed availability for one hamper
- `POST /api/hampers` - Create hamper with requirements
- `PUT /api/hampers/:id` - Update hamper

### Sales
- `GET /api/sales` - List sales with margins
- `POST /api/sales/preview` - Preview stock allocation before confirming
- `POST /api/sales` - Record sale and consume stock
- `GET /api/sales/margins` - Margin analytics

## UI Pages (Mobile-First)

### 1. Dashboard (`/`)
- Quick stats: Total products, low stock alerts, today's sales
- Quick actions: Add Stock, Record Sale, View Hampers
- Recent activity feed

### 2. Inventory (`/inventory`)
- List view: Products grouped by category
- Each row shows: Name, current stock, unit, last cost
- Tap to expand: See lot breakdown
- FAB button: "Add Stock" (opens scanner)

### 3. Add Stock (`/inventory/add`)
- Camera viewfinder for barcode scanning
- On scan: Show product name, confirm or search manually
- Form: Quantity, cost, expiry (optional)
- "Quick add more" option for batch entry

### 4. Hampers (`/hampers`)
- Card per hamper showing: Name, price, "Can make: X"
- Color coding: Green (5+), Yellow (1-4), Red (0)
- Tap to see requirement breakdown

### 5. Record Sale (`/sales/new`)
- Select hamper(s) and quantities
- Show proposed stock allocation per requirement
- Allow tap-to-override on any line
- Show: Gross, Etsy fees, packaging, net, cost, margin
- Confirm button

### 6. Sales History (`/sales`)
- List of past sales with date, hamper, margin
- Tap for full breakdown

### 7. Settings (`/settings`)
- Etsy fee configuration
- Packaging overhead rates
- Categories management

## Barcode Scanning Approach

Use `html5-qrcode` library:
- Works on mobile browsers (iOS Safari, Android Chrome)
- No app install required
- Requests camera permission
- Decodes EAN-13, UPC-A, Code128, etc.

Flow:
1. User taps "Scan" button
2. Camera opens in modal/page
3. On successful scan → API lookup `/api/products/barcode/:code`
4. If found → Pre-fill product, go to quantity/cost form
5. If not found → "Product not recognized" → Option to create new product with this barcode

## Authentication Approach

**Recommendation: Supabase Auth**
- Simple email/password or magic link
- Free tier sufficient for single user
- Built-in session management
- Row-level security possible in Supabase

Alternative: Simple JWT with environment-based secret
- Single hardcoded user in env vars
- Simpler but less flexible

## Deployment Strategy

**Option A (Recommended): Vercel + Neon**
- Vercel: Frontend + API routes (serverless)
- Neon: Serverless PostgreSQL (free tier generous)
- Supabase Auth: User authentication
- Total cost: $0 for low usage

**Option B: Railway**
- Full-stack deployment
- PostgreSQL included
- $5/month minimum after free tier

## Implementation Phases

### Phase 1A: Foundation ✅ COMPLETE
1. Initialize Vite + React + TypeScript project
2. Set up TailwindCSS
3. Set up Prisma with schema
4. Connect to Neon PostgreSQL
5. Run initial migration
6. Basic Express API or Vercel API routes
7. Simple auth (Supabase or JWT)

### Phase 1B: Core Data Management
1. Categories CRUD UI
2. Products CRUD UI (with barcode field)
3. Inventory lots - add stock form
4. Barcode scanner component integration
5. Stock levels display

### Phase 1C: Hampers
1. Hamper CRUD UI
2. Requirement management (add categories to hamper)
3. Availability calculation logic
4. Display "can make X" on hamper list

### Phase 1D: Sales & Margins
1. Stock allocation algorithm (FIFO/FEFO/Cheapest)
2. Sale preview endpoint
3. Record sale UI with allocation preview
4. Override capability per line
5. Confirm and consume stock
6. Etsy fee and overhead application
7. Margin calculation and display

### Phase 1E: Polish & Alerts
1. Dashboard with quick actions
2. Low stock alerts
3. Expiring lots warnings
4. Sales history and margin reports
5. Mobile UX polish

### Phase 2 (Future): Etsy Integration
- OAuth with Etsy API
- Pull orders automatically
- Push stock levels back
- Sync pricing

## Decisions Made

- **Deployment**: Vercel + Neon (free tier, serverless) - generous free tiers, no AWS complexity
- **Auth**: Magic link via Supabase Auth - no password to remember
- **Data Import**: User will share Google Sheets for import assessment
