# Design: Postage Tiers, Expense VAT, Low Stock Filter, Supplier Shopping Lists

## Change 1: Configurable Postage Cost Mapping

### Problem
Etsy import pre-fills "Actual postage cost" from Etsy's shipping charge (e.g. £5.00), but the real Royal Mail cost differs (e.g. £5.05). Currently no way to configure the mapping.

### Design

**New Prisma model:**
```prisma
model PostageTier {
  id          String   @id @default(cuid())
  etsyCharge  Decimal  @db.Decimal(10, 2)
  actualCost  Decimal  @db.Decimal(10, 2)
  label       String?
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
}
```

**API:** CRUD on `POST/GET/PUT/DELETE /api/settings/postage-tiers`

**Settings UI:** New "Postage Tiers" section in Settings page. Simple list with add/edit/delete. Initial seed: £5.00→£5.05, £6.00→£8.55.

**Etsy import change** (`EtsyOrdersSyncPanel.tsx`): On load, fetch postage tiers. When initializing `orderPostageCosts`, look up `order.shippingCost` in tiers — if match found, use `actualCost`; otherwise fall back to Etsy's value.

**Manual sale defaults** (`SalesPage.tsx`, `SaleChannelCard.tsx`): Fetch the first postage tier on mount, use its `actualCost` as the default "Postage Cost" for Etsy sales.

### Files
- `prisma/schema.prisma` — add PostageTier model
- `server/features/settings/router.ts` — add postage tier CRUD routes
- `contracts/routes/settings.ts` — add Zod schemas
- `src/lib/api/settings.ts` or `src/lib/api.ts` — add API client methods
- `src/features/settings/` — new PostageTiersSection component
- `src/features/etsy/components/EtsyOrdersSyncPanel.tsx` — tier lookup on import
- `src/features/sales/pages/SalesPage.tsx` — use tier for defaults
- `src/features/sales/components/record/SaleChannelCard.tsx` — use tier for defaults

---

## Change 2: Editable Exc VAT on Expenses

### Problem
The expenses form auto-calculates "exc VAT" from "inc VAT". The exc VAT field can't be freely typed into.

### Design
Make both fields independently editable. Remove the auto-calculation that overwrites exc VAT when inc VAT changes. Both fields are plain number inputs — the user types whichever value they know.

The existing `handleIncVatChange` in `ExpensesPage.tsx` currently forces `amountExcVat = incVat / 1.2`. Change it to just update `amountIncVat` without touching `amountExcVat`. Pass a proper `onExcVatChange` callback to the form. Remove "Auto-calculated" placeholder and "Auto-fills at 20% VAT" hint text from the exc VAT field.

### Files
- `src/features/expenses/pages/ExpensesPage.tsx` — simplify handleIncVatChange, add onExcVatChange
- `src/features/expenses/components/ExpenseForm.tsx` — accept onExcVatChange prop, update exc VAT field labels/placeholders

---

## Change 3: Clickable Low Stock + Filtered Inventory View

### Problem
Dashboard "Low Stock" count isn't clickable. No way to filter inventory to just low-stock items.

### Design

**Dashboard** (`DashboardPage.tsx`):
- Wrap the "Low Stock" card in a `<Link to="/inventory?filter=low-stock">` so clicking it navigates to a filtered view.
- Update AlertCard items to also link to `/inventory?filter=low-stock`.

**Inventory page** (`InventoryPage.tsx`):
- Read `filter` from URL search params on mount.
- When `filter=low-stock`: query only products where stock ≤ lowStockThreshold AND lowStockThreshold > 0.
- Add a visible chip/toggle "Showing: Low Stock Only" with an × to clear the filter back to all products.
- Backend: add `?lowStock=true` query param to `/api/inventory` (or `/api/products`) that filters server-side.

### Files
- `src/features/dashboard/pages/DashboardPage.tsx` — make Low Stock card clickable
- `src/features/inventory/pages/InventoryPage.tsx` — read URL params, show filter chip
- `server/features/inventory/router.ts` (or products router) — add lowStock filter param

---

## Change 4: Supplier / Shop Mapping + Shopping List

### Problem
No way to track where products can be purchased. Need a per-shop low-stock shopping list.

### Design

**New Prisma models:**
```prisma
model Supplier {
  id        String   @id @default(cuid())
  name      String   @unique
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  products ProductSupplier[]
}

model ProductSupplier {
  id         String   @id @default(cuid())
  productId  String
  supplierId String
  product    Product  @relation(fields: [productId], references: [id])
  supplier   Supplier @relation(fields: [supplierId], references: [id])

  @@unique([productId, supplierId])
}
```

Product model gets: `suppliers ProductSupplier[]`

**API routes:**
- `GET/POST/PUT/DELETE /api/suppliers` — CRUD for supplier names
- `GET/PUT /api/products/:id/suppliers` — manage which suppliers carry a product
- `GET /api/suppliers/:id/low-stock` — get low-stock products for a specific supplier

**Settings UI:** New "Suppliers" section — manage supplier names (Home Bargains, Amazon, Temu, etc.).

**Product form:** Add a multi-select field "Available at" showing all active suppliers. Saves to ProductSupplier join table.

**Shopping List page** (`/shopping-list`):
- Dropdown to select a supplier
- Shows products linked to that supplier that are currently low stock (stock ≤ threshold, threshold > 0)
- Each row: product name, category, current stock, threshold
- Add route to `App.tsx` and nav link

### Files
- `prisma/schema.prisma` — add Supplier, ProductSupplier models + Product relation
- `server/features/suppliers/router.ts` — new route file
- `contracts/routes/suppliers.ts` — Zod schemas
- `contracts/domain/supplier.ts` — domain schema
- `src/lib/api/suppliers.ts` or extend `src/lib/api.ts` — API client
- `src/features/settings/` — SupplierManagementSection component
- `src/features/products/components/ProductForm.tsx` — add supplier multi-select
- `src/features/shopping-list/` — new ShoppingListPage + components
- `src/App.tsx` — add /shopping-list route
- `src/components/Layout.tsx` — add nav link
