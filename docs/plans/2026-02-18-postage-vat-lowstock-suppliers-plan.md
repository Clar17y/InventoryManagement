# Postage Tiers, Expense VAT, Low Stock Filter & Supplier Shopping Lists — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement 4 changes: configurable postage tier mapping in Settings, editable exc-VAT field on expenses, clickable low-stock filter on dashboard→inventory, and a supplier/shop mapping with per-shop shopping list page.

**Architecture:** Each change is independent and can be committed separately. Changes 1 and 4 add new Prisma models + API routes + Settings UI. Change 2 modifies existing expense form logic. Change 3 wires the dashboard to a filtered inventory view. All follow existing patterns: Prisma model → contract schemas → server router → API client → React component.

**Tech Stack:** Prisma (PostgreSQL), Express + Zod validation, React + TypeScript, TailwindCSS

---

## Task 1: Postage Tier — Prisma Model & Migration

**Files:**
- Modify: `prisma/schema.prisma` (add model after line 281)

**Step 1: Add PostageTier model to schema**

Add at the end of `prisma/schema.prisma` (after the `EtsyCredentials` model):

```prisma
model PostageTier {
  id         String   @id @default(cuid())
  etsyCharge Decimal  @db.Decimal(10, 2)
  actualCost Decimal  @db.Decimal(10, 2)
  label      String?
  isActive   Boolean  @default(true)
  createdAt  DateTime @default(now())

  @@unique([etsyCharge])
}
```

**Step 2: Run migration**

```bash
npm run db:migrate -- --name add_postage_tier
```

Expected: Migration created and applied successfully.

**Step 3: Generate Prisma client**

```bash
npm run db:generate
```

**Step 4: Commit**

```bash
git add prisma/
git commit -m "feat: add PostageTier model for configurable postage cost mapping"
```

---

## Task 2: Postage Tier — Contract Schemas

**Files:**
- Modify: `contracts/domain/settings.ts` (add postageTier schema after packagingOverhead)
- Modify: `contracts/routes/settings.ts` (add CRUD schemas)

**Step 1: Add domain schema**

In `contracts/domain/settings.ts`, add after the `packagingOverheadSchema` block (after line 31):

```typescript
export const postageTierSchema = z.object({
  id: cuidSchema,
  etsyCharge: decimalSchema,
  actualCost: decimalSchema,
  label: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: isoDateTimeSchema,
})

export type PostageTier = z.infer<typeof postageTierSchema>
```

**Step 2: Add route schemas**

In `contracts/routes/settings.ts`, add these after the packaging overhead schemas (before the type exports section starting at line 54):

```typescript
// Postage tiers
import { postageTierSchema } from '../domain/settings'

export const postageTiersResponseSchema = z.array(postageTierSchema)

export const postageTierCreateBodySchema = z.object({
  etsyCharge: z.number().nonnegative(),
  actualCost: z.number().nonnegative(),
  label: z.string().max(100).optional(),
})

export const postageTierUpdateBodySchema = postageTierCreateBodySchema.partial()

export const postageTierResponseSchema = postageTierSchema
```

Add corresponding type exports at the end of the file:

```typescript
export type PostageTiersResponse = z.infer<typeof postageTiersResponseSchema>
export type PostageTierCreateBody = z.input<typeof postageTierCreateBodySchema>
export type PostageTierUpdateBody = z.input<typeof postageTierUpdateBodySchema>
export type PostageTierResponse = z.infer<typeof postageTierResponseSchema>
```

Note: The `postageTierSchema` import needs to be added to the existing import from `'../domain/settings'` at line 3.

**Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add contracts/
git commit -m "feat: add postage tier contract schemas"
```

---

## Task 3: Postage Tier — Server API Routes

**Files:**
- Modify: `server/features/settings/router.ts` (add CRUD routes before the dashboard-stats route)

**Step 1: Add postage tier routes**

In `server/features/settings/router.ts`, add the import for the new schemas. Update the import at line 4-8 to also include:

```typescript
import {
  etsyFeeCreateBodySchema,
  packagingOverheadCreateBodySchema,
  packagingOverheadUpdateBodySchema,
  postageTierCreateBodySchema,
  postageTierUpdateBodySchema,
} from '#contracts/routes/settings'
```

Add these routes before the `// === Dashboard Stats ===` section (before line 139):

```typescript
// === Postage Tiers ===

router.get('/postage-tiers', async (_, res) => {
  try {
    const tiers = await prisma.postageTier.findMany({
      where: { isActive: true },
      orderBy: { etsyCharge: 'asc' },
    })
    res.json(tiers)
  } catch (error) {
    console.error('Error fetching postage tiers:', error)
    res.status(500).json({ error: 'Failed to fetch postage tiers' })
  }
})

router.post('/postage-tiers', async (req, res) => {
  try {
    const data = postageTierCreateBodySchema.parse(req.body)
    const tier = await prisma.postageTier.create({
      data: {
        etsyCharge: data.etsyCharge,
        actualCost: data.actualCost,
        label: data.label,
      },
    })
    res.status(201).json(tier)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors })
    }
    console.error('Error creating postage tier:', error)
    res.status(500).json({ error: 'Failed to create postage tier' })
  }
})

router.put('/postage-tiers/:id', async (req, res) => {
  try {
    const data = postageTierUpdateBodySchema.parse(req.body)
    const tier = await prisma.postageTier.update({
      where: { id: req.params.id },
      data: {
        ...(data.etsyCharge !== undefined && { etsyCharge: data.etsyCharge }),
        ...(data.actualCost !== undefined && { actualCost: data.actualCost }),
        ...(data.label !== undefined && { label: data.label }),
      },
    })
    res.json(tier)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors })
    }
    console.error('Error updating postage tier:', error)
    res.status(500).json({ error: 'Failed to update postage tier' })
  }
})

router.delete('/postage-tiers/:id', async (req, res) => {
  try {
    await prisma.postageTier.update({
      where: { id: req.params.id },
      data: { isActive: false },
    })
    res.status(204).send()
  } catch (error) {
    console.error('Error deleting postage tier:', error)
    res.status(500).json({ error: 'Failed to delete postage tier' })
  }
})
```

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add server/
git commit -m "feat: add postage tier CRUD API routes"
```

---

## Task 4: Postage Tier — Frontend API Client

**Files:**
- Modify: `src/lib/api/settings.ts` (add postage tier methods)

**Step 1: Add API client methods**

In `src/lib/api/settings.ts`, add the new imports from contracts (extend the existing import at lines 1-15):

```typescript
import {
  // ... existing imports ...
  postageTiersResponseSchema,
  postageTierResponseSchema,
  type PostageTiersResponse,
  type PostageTierCreateBody,
  type PostageTierUpdateBody,
  type PostageTierResponse,
} from '#contracts/routes/settings'
```

Add type exports:

```typescript
export type PostageTier = PostageTierResponse
```

Add methods to the `settings` object (before the closing `}`):

```typescript
  // Postage Tiers
  getPostageTiers: () =>
    requestWithSchema('/settings/postage-tiers', postageTiersResponseSchema),
  createPostageTier: (data: PostageTierCreateBody) =>
    requestWithSchema('/settings/postage-tiers', postageTierResponseSchema, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updatePostageTier: (id: string, data: PostageTierUpdateBody) =>
    requestWithSchema(`/settings/postage-tiers/${id}`, postageTierResponseSchema, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deletePostageTier: (id: string) =>
    request<void>(`/settings/postage-tiers/${id}`, { method: 'DELETE' }),
```

**Step 2: Verify TypeScript compiles**

```bash
npx tsc src/lib/api/settings.ts --noEmit
```

**Step 3: Commit**

```bash
git add src/lib/api/settings.ts
git commit -m "feat: add postage tier API client methods"
```

---

## Task 5: Postage Tier — Settings UI Section

**Files:**
- Create: `src/features/settings/components/PostageTiersSection.tsx`
- Modify: `src/features/settings/pages/SettingsPage.tsx` (add section + state)

**Step 1: Create PostageTiersSection component**

Create `src/features/settings/components/PostageTiersSection.tsx`. Follow the same pattern as `PackagingOverheadSection.tsx`:

```tsx
import type { PostageTier } from '../../../lib/api'
import { formatCurrency } from '../../../lib/formatting'

interface PostageTiersSectionProps {
  tiers: PostageTier[]
  newEtsyCharge: string
  newActualCost: string
  onNewEtsyChargeChange: (value: string) => void
  onNewActualCostChange: (value: string) => void
  saving: boolean
  onAddTier: () => void
  onDeleteTier: (id: string) => void
}

export default function PostageTiersSection({
  tiers,
  newEtsyCharge,
  newActualCost,
  onNewEtsyChargeChange,
  onNewActualCostChange,
  saving,
  onAddTier,
  onDeleteTier,
}: PostageTiersSectionProps) {
  return (
    <section className="card space-y-4">
      <h3 className="font-medium">Postage Tiers</h3>
      <p className="text-sm text-gray-500">
        Maps Etsy shipping charges to actual Royal Mail postage costs
      </p>

      {tiers.length > 0 && (
        <div className="space-y-2">
          {tiers.map((tier) => (
            <div key={tier.id} className="flex justify-between items-center bg-gray-50 p-2 rounded-lg">
              <span>
                Etsy charges {formatCurrency(Number(tier.etsyCharge))} → Actual cost {formatCurrency(Number(tier.actualCost))}
                {tier.label && <span className="text-gray-500 text-sm ml-2">({tier.label})</span>}
              </span>
              <button
                onClick={() => onDeleteTier(tier.id)}
                className="text-xs text-red-600 hover:text-red-700"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="number"
          step="0.01"
          value={newEtsyCharge}
          onChange={(e) => onNewEtsyChargeChange(e.target.value)}
          className="input w-28"
          placeholder="Etsy charge"
        />
        <span className="self-center text-gray-500">→</span>
        <input
          type="number"
          step="0.01"
          value={newActualCost}
          onChange={(e) => onNewActualCostChange(e.target.value)}
          className="input w-28"
          placeholder="Actual cost"
        />
        <button
          onClick={onAddTier}
          disabled={saving || !newEtsyCharge || !newActualCost}
          className="btn-primary"
        >
          Add
        </button>
      </div>
    </section>
  )
}
```

**Step 2: Wire into SettingsPage**

In `src/features/settings/pages/SettingsPage.tsx`:

Add import at top (after line 6):
```typescript
import PostageTiersSection from '../components/PostageTiersSection'
```

Add to the existing import from `'../../../lib/api'` at line 2: `PostageTier` type.

Add state variables after the packaging overhead state (after line 51):
```typescript
  // Postage tiers
  const [postageTiers, setPostageTiers] = useState<PostageTier[]>([])
  const [newEtsyCharge, setNewEtsyCharge] = useState('')
  const [newActualCost, setNewActualCost] = useState('')
```

In `loadSettings()`, add `settings.getPostageTiers()` to the existing `Promise.all` (line 61-64), and process its result:
```typescript
const [feesData, overheadData, tiersData] = await Promise.all([
  settings.getEtsyFees(),
  settings.getPackagingOverhead(),
  settings.getPostageTiers(),
])
// ... existing code ...
setPostageTiers(tiersData)
```

Add handlers after `handleDeleteOverhead` (after line 152):
```typescript
  const handleAddPostageTier = async () => {
    if (!newEtsyCharge || !newActualCost) return
    setSaving(true)
    setError(null)
    try {
      await settings.createPostageTier({
        etsyCharge: parseFloat(newEtsyCharge),
        actualCost: parseFloat(newActualCost),
      })
      setNewEtsyCharge('')
      setNewActualCost('')
      await loadSettings()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add postage tier')
    } finally {
      setSaving(false)
    }
  }

  const handleDeletePostageTier = async (id: string) => {
    if (!confirm('Delete this postage tier?')) return
    try {
      await settings.deletePostageTier(id)
      await loadSettings()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete postage tier')
    }
  }
```

Add the component in the JSX, after the `<PackagingOverheadSection>` and before the `<EtsyAccessManagementSection>`:
```tsx
      <PostageTiersSection
        tiers={postageTiers}
        newEtsyCharge={newEtsyCharge}
        newActualCost={newActualCost}
        onNewEtsyChargeChange={setNewEtsyCharge}
        onNewActualCostChange={setNewActualCost}
        saving={saving}
        onAddTier={handleAddPostageTier}
        onDeleteTier={handleDeletePostageTier}
      />
```

**Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add src/features/settings/
git commit -m "feat: add postage tiers settings UI section"
```

---

## Task 6: Postage Tier — Wire into Etsy Import

**Files:**
- Modify: `src/features/etsy/components/EtsyOrdersSyncPanel.tsx` (lines 62, 113-117)

**Step 1: Fetch postage tiers on mount**

In `EtsyOrdersSyncPanel.tsx`, add import:
```typescript
import { settings, type PostageTier } from '../../../lib/api'
```

Add state for tiers (after line 62):
```typescript
const [postageTiers, setPostageTiers] = useState<PostageTier[]>([])
```

In the `loadPendingOrders` function (lines 106-122), fetch tiers and use them for cost lookup. Replace the cost initialization block (lines 113-117):

```typescript
  const loadPendingOrders = async () => {
    try {
      setError(null)
      const [data, tiers] = await Promise.all([
        etsy.getPendingOrders(),
        settings.getPostageTiers(),
      ])
      setPendingOrders(data.orders)
      setSelectedOrders(new Set())
      setPostageTiers(tiers)

      const costs: Record<number, string> = {}
      data.orders.forEach((order) => {
        // Look up actual cost from postage tiers, fall back to Etsy's shipping charge
        const matchingTier = tiers.find(
          (t) => Number(t.etsyCharge) === order.shippingCost
        )
        costs[order.receiptId] = matchingTier
          ? Number(matchingTier.actualCost).toFixed(2)
          : order.shippingCost.toFixed(2)
      })
      setOrderPostageCosts(costs)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pending orders')
      setPendingOrders([])
    }
  }
```

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

**Step 3: Manually test**

Run `npm run dev`, go to Etsy sync, verify orders pre-fill with the correct actual postage cost from tiers.

**Step 4: Commit**

```bash
git add src/features/etsy/
git commit -m "feat: use postage tiers for Etsy import cost pre-fill"
```

---

## Task 7: Postage Tier — Wire into Manual Sale Defaults

**Files:**
- Modify: `src/features/sales/pages/SalesPage.tsx` (lines 56-57, 221-222)
- Modify: `src/features/sales/components/record/SaleChannelCard.tsx` (lines 35-36)

**Step 1: Fetch tiers and use for defaults in SalesPage**

In `SalesPage.tsx`, add import:
```typescript
import { settings, type PostageTier } from '../../../lib/api'
```

Add state (near line 56):
```typescript
const [postageTiers, setPostageTiers] = useState<PostageTier[]>([])
```

Add a `useEffect` to fetch tiers on mount:
```typescript
useEffect(() => {
  settings.getPostageTiers().then(setPostageTiers).catch(() => {})
}, [])
```

Change the initial `postageCost` state default from `'5.35'` to `''` (will be set after tiers load):
```typescript
const [postageCost, setPostageCost] = useState('')
```

Add another `useEffect` to set the default once tiers are loaded:
```typescript
useEffect(() => {
  if (postageTiers.length > 0 && !postageCost) {
    setPostageCost(Number(postageTiers[0].actualCost).toFixed(2))
  }
}, [postageTiers])
```

Update `handleCancel` (line 221-222) to use the tier:
```typescript
const defaultPostageCost = postageTiers.length > 0
  ? Number(postageTiers[0].actualCost).toFixed(2) : '5.05'
setPostageCost(defaultPostageCost)
```

**Step 2: Pass tiers to SaleChannelCard**

In `SaleChannelCard.tsx`, add `postageTiers` to the props interface and use it to set defaults when switching to Etsy:

```typescript
const defaultCost = postageTiers.length > 0
  ? Number(postageTiers[0].actualCost).toFixed(2) : '5.05'
setPostageCost(defaultCost)
```

Pass `postageTiers` from `SalesRecordView` to `SaleChannelCard`.

**Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add src/features/sales/
git commit -m "feat: use postage tiers for manual sale defaults"
```

---

## Task 8: Expense VAT — Make Both Fields Editable

**Files:**
- Modify: `src/features/expenses/pages/ExpensesPage.tsx` (lines 169-179)
- Modify: `src/features/expenses/components/ExpenseForm.tsx` (lines 5-13, 92-103)

**Step 1: Simplify handleIncVatChange in ExpensesPage**

In `ExpensesPage.tsx`, change `handleIncVatChange` (lines 169-179) to only update the inc VAT field:

```typescript
  const handleIncVatChange = (value: string) => {
    setFormData(prev => ({ ...prev, amountIncVat: value }))
  }

  const handleExcVatChange = (value: string) => {
    setFormData(prev => ({ ...prev, amountExcVat: value }))
  }
```

Pass `handleExcVatChange` to the form. Find where `<ExpenseForm>` is rendered (around line 200) and add:
```tsx
onExcVatChange={handleExcVatChange}
```

**Step 2: Update ExpenseForm to accept onExcVatChange**

In `ExpenseForm.tsx`, add to the props interface (line 12):
```typescript
  onExcVatChange: (value: string) => void
```

Add to destructured props (line 22):
```typescript
  onExcVatChange,
```

Change the exc VAT field (lines 92-103):
- Change `onChange` from `(e) => setFormData({ ...formData, amountExcVat: e.target.value })` to `(e) => onExcVatChange(e.target.value)`
- Change `placeholder` from `"Auto-calculated"` to `"0.00"`
- Remove the `<p>` hint text "Auto-fills at 20% VAT" (line 102)

```tsx
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Amount (exc VAT)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={formData.amountExcVat}
            onChange={(e) => onExcVatChange(e.target.value)}
            className="input"
            placeholder="0.00"
          />
        </div>
```

**Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add src/features/expenses/
git commit -m "feat: make both VAT fields independently editable on expenses form"
```

---

## Task 9: Low Stock — Make Dashboard Card Clickable

**Files:**
- Modify: `src/features/dashboard/pages/DashboardPage.tsx` (lines 135-144, 205-221)

**Step 1: Add Link import**

Add to the imports at the top of `DashboardPage.tsx`:
```typescript
import { Link } from 'react-router-dom'
```

**Step 2: Wrap Low Stock overview card in a Link**

Replace the Low Stock card (lines 135-144) with a clickable version:

```tsx
          <Link to="/inventory?filter=low-stock" className="card block hover:ring-2 hover:ring-amber-300 transition-shadow">
            <div className="text-sm text-gray-500">Low Stock</div>
            <div className={`text-2xl font-bold ${(stats?.lowStockProducts ?? 0) > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
              {isLoading ? (
                <span className="animate-pulse">--</span>
              ) : (
                stats?.lowStockProducts ?? 0
              )}
            </div>
          </Link>
```

Note: Changed from `<div className="card">` to `<Link to="/inventory?filter=low-stock" className="card block hover:ring-2 hover:ring-amber-300 transition-shadow">`.

**Step 3: Update AlertCard links**

In the low stock AlertCard section (lines 205-221), change the item `link` from `'/inventory'` to `'/inventory?filter=low-stock'`:

```typescript
  items={lowStockProducts.map(p => ({
    id: p.id,
    title: p.name,
    subtitle: p.category?.name,
    value: `${p.totalStock ?? 0} left`,
    link: '/inventory?filter=low-stock',
  }))}
```

**Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

**Step 5: Commit**

```bash
git add src/features/dashboard/
git commit -m "feat: make low stock dashboard card clickable, links to filtered inventory"
```

---

## Task 10: Low Stock — Add Filter to Inventory Page

**Files:**
- Modify: `src/features/inventory/pages/InventoryPage.tsx`

**Step 1: Read URL search params**

Add import at the top:
```typescript
import { useSearchParams } from 'react-router-dom'
```

Inside the component, add after line 39:
```typescript
  const [searchParams, setSearchParams] = useSearchParams()
  const lowStockFilter = searchParams.get('filter') === 'low-stock'
```

**Step 2: Add filter chip UI**

In the JSX, after the search bar and before the product list, add a filter indicator:

```tsx
{lowStockFilter && (
  <div className="flex items-center gap-2">
    <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-sm font-medium">
      Low Stock Only
      <button
        onClick={() => setSearchParams({})}
        className="ml-1 hover:text-amber-900"
      >
        <XMarkIcon className="h-4 w-4" />
      </button>
    </span>
  </div>
)}
```

`XMarkIcon` is already imported at line 2.

**Step 3: Filter the product list**

In the existing `useMemo` that filters/sorts products (find the block that processes `allProducts`), add a low-stock filter step. After the search filter and before sorting, add:

```typescript
// Apply low stock filter
if (lowStockFilter) {
  filtered = filtered.filter(p =>
    p.lowStockThreshold > 0 && (p.totalStock ?? 0) <= p.lowStockThreshold
  )
}
```

Add `lowStockFilter` to the useMemo dependency array.

**Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

**Step 5: Manually test**

Run `npm run dev`, click the "Low Stock" card on dashboard, verify it navigates to `/inventory?filter=low-stock` and only shows low-stock products. Click the × on the chip to clear the filter.

**Step 6: Commit**

```bash
git add src/features/inventory/
git commit -m "feat: add low stock filter to inventory page with URL param support"
```

---

## Task 11: Supplier — Prisma Models & Migration

**Files:**
- Modify: `prisma/schema.prisma` (add Supplier + ProductSupplier models, update Product)

**Step 1: Add Supplier and ProductSupplier models**

At the end of `prisma/schema.prisma`, add:

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
  @@index([productId])
  @@index([supplierId])
}
```

Add the relation to the Product model (after line 54, before the closing `}`):
```prisma
  suppliers       ProductSupplier[]
```

**Step 2: Run migration**

```bash
npm run db:migrate -- --name add_supplier_and_product_supplier
```

**Step 3: Generate Prisma client**

```bash
npm run db:generate
```

**Step 4: Commit**

```bash
git add prisma/
git commit -m "feat: add Supplier and ProductSupplier models for shop mapping"
```

---

## Task 12: Supplier — Contract Schemas

**Files:**
- Create: `contracts/domain/supplier.ts`
- Create: `contracts/routes/suppliers.ts`
- Modify: `contracts/domain/index.ts` (add export)
- Modify: `contracts/routes/index.ts` (add export)

**Step 1: Create domain schema**

Create `contracts/domain/supplier.ts`:

```typescript
import { z } from 'zod'
import { cuidSchema, isoDateTimeSchema } from '../http/primitives'

export const supplierSchema = z.object({
  id: cuidSchema,
  name: z.string().min(1).max(100),
  isActive: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})

export type Supplier = z.infer<typeof supplierSchema>
```

**Step 2: Create route schemas**

Create `contracts/routes/suppliers.ts`:

```typescript
import { z } from 'zod'
import { supplierSchema } from '../domain/supplier'
import { decimalSchema } from '../http/primitives'

export const suppliersResponseSchema = z.array(supplierSchema)

export const supplierCreateBodySchema = z.object({
  name: z.string().min(1).max(100),
})

export const supplierUpdateBodySchema = supplierCreateBodySchema.partial()

export const supplierResponseSchema = supplierSchema

// Low stock products for a supplier
export const supplierLowStockProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  categoryName: z.string().nullable(),
  unit: z.string(),
  totalStock: z.number(),
  lowStockThreshold: z.number(),
})

export const supplierLowStockResponseSchema = z.array(supplierLowStockProductSchema)

// Product supplier IDs (for product form)
export const productSupplierIdsResponseSchema = z.array(z.string())

export type SuppliersResponse = z.infer<typeof suppliersResponseSchema>
export type SupplierCreateBody = z.input<typeof supplierCreateBodySchema>
export type SupplierUpdateBody = z.input<typeof supplierUpdateBodySchema>
export type SupplierResponse = z.infer<typeof supplierResponseSchema>
export type SupplierLowStockProduct = z.infer<typeof supplierLowStockProductSchema>
export type SupplierLowStockResponse = z.infer<typeof supplierLowStockResponseSchema>
export type ProductSupplierIdsResponse = z.infer<typeof productSupplierIdsResponseSchema>
```

**Step 3: Add barrel exports**

In `contracts/domain/index.ts`, add:
```typescript
export * from './supplier'
```

In `contracts/routes/index.ts`, add:
```typescript
export * from './suppliers'
```

**Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

**Step 5: Commit**

```bash
git add contracts/
git commit -m "feat: add supplier contract schemas"
```

---

## Task 13: Supplier — Server API Routes

**Files:**
- Create: `server/features/suppliers/router.ts`
- Create: `server/routes/suppliers.ts`
- Modify: `server/app.ts` (mount route)

**Step 1: Create the router**

Create `server/features/suppliers/router.ts`:

```typescript
import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import {
  supplierCreateBodySchema,
  supplierUpdateBodySchema,
} from '#contracts/routes/suppliers'

const router = Router()

// GET all active suppliers
router.get('/', async (_, res) => {
  try {
    const suppliers = await prisma.supplier.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    })
    res.json(suppliers)
  } catch (error) {
    console.error('Error fetching suppliers:', error)
    res.status(500).json({ error: 'Failed to fetch suppliers' })
  }
})

// POST create supplier
router.post('/', async (req, res) => {
  try {
    const data = supplierCreateBodySchema.parse(req.body)
    const supplier = await prisma.supplier.create({
      data: { name: data.name },
    })
    res.status(201).json(supplier)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors })
    }
    console.error('Error creating supplier:', error)
    res.status(500).json({ error: 'Failed to create supplier' })
  }
})

// PUT update supplier
router.put('/:id', async (req, res) => {
  try {
    const data = supplierUpdateBodySchema.parse(req.body)
    const supplier = await prisma.supplier.update({
      where: { id: req.params.id },
      data: { ...(data.name && { name: data.name }) },
    })
    res.json(supplier)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors })
    }
    console.error('Error updating supplier:', error)
    res.status(500).json({ error: 'Failed to update supplier' })
  }
})

// DELETE (soft) supplier
router.delete('/:id', async (req, res) => {
  try {
    await prisma.supplier.update({
      where: { id: req.params.id },
      data: { isActive: false },
    })
    res.status(204).send()
  } catch (error) {
    console.error('Error deleting supplier:', error)
    res.status(500).json({ error: 'Failed to delete supplier' })
  }
})

// GET low-stock products for a supplier
router.get('/:id/low-stock', async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        lowStockThreshold: { gt: 0 },
        suppliers: {
          some: { supplierId: req.params.id },
        },
      },
      include: {
        category: { select: { name: true } },
        lots: {
          where: { remaining: { gt: 0 } },
          select: { remaining: true },
        },
      },
      orderBy: { name: 'asc' },
    })

    const lowStockProducts = products
      .map((product) => {
        const totalRemaining = product.lots.reduce(
          (sum, lot) => sum + Number(lot.remaining),
          0
        )
        const totalStock = product.unit === 'units' ? totalRemaining : product.lots.length
        return {
          id: product.id,
          name: product.name,
          categoryName: product.category?.name ?? null,
          unit: product.unit,
          totalStock,
          lowStockThreshold: product.lowStockThreshold,
        }
      })
      .filter((p) => p.totalStock <= p.lowStockThreshold)

    res.json(lowStockProducts)
  } catch (error) {
    console.error('Error fetching supplier low stock:', error)
    res.status(500).json({ error: 'Failed to fetch low stock for supplier' })
  }
})

// GET supplier IDs for a product
router.get('/by-product/:productId', async (req, res) => {
  try {
    const links = await prisma.productSupplier.findMany({
      where: { productId: req.params.productId },
      select: { supplierId: true },
    })
    res.json(links.map((l) => l.supplierId))
  } catch (error) {
    console.error('Error fetching product suppliers:', error)
    res.status(500).json({ error: 'Failed to fetch product suppliers' })
  }
})

// PUT set supplier IDs for a product (replace all)
router.put('/by-product/:productId', async (req, res) => {
  try {
    const { supplierIds } = z.object({ supplierIds: z.array(z.string()) }).parse(req.body)

    await prisma.$transaction([
      prisma.productSupplier.deleteMany({
        where: { productId: req.params.productId },
      }),
      ...supplierIds.map((supplierId) =>
        prisma.productSupplier.create({
          data: { productId: req.params.productId, supplierId },
        })
      ),
    ])

    res.json(supplierIds)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors })
    }
    console.error('Error updating product suppliers:', error)
    res.status(500).json({ error: 'Failed to update product suppliers' })
  }
})

export default router
```

**Step 2: Create route re-export stub**

Create `server/routes/suppliers.ts`:
```typescript
export { default } from '../features/suppliers/router'
```

**Step 3: Mount in server app**

In `server/app.ts`, add import (after line 14):
```typescript
import suppliersRouter from './routes/suppliers'
```

Add route mount (after line 50):
```typescript
  app.use('/api/suppliers', suppliersRouter)
```

**Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

**Step 5: Commit**

```bash
git add server/
git commit -m "feat: add supplier CRUD and low-stock API routes"
```

---

## Task 14: Supplier — Frontend API Client

**Files:**
- Create: `src/lib/api/suppliers.ts`
- Modify: `src/lib/api.ts` (add barrel export)

**Step 1: Create API client module**

Create `src/lib/api/suppliers.ts`:

```typescript
import { request, requestWithSchema } from './request'
import {
  suppliersResponseSchema,
  supplierResponseSchema,
  supplierLowStockResponseSchema,
  productSupplierIdsResponseSchema,
  type SupplierCreateBody,
  type SupplierUpdateBody,
  type SupplierResponse,
  type SupplierLowStockProduct,
} from '#contracts/routes/suppliers'

export type Supplier = SupplierResponse
export type SupplierLowStockItem = SupplierLowStockProduct

export const suppliers = {
  list: () => requestWithSchema('/suppliers', suppliersResponseSchema),
  create: (data: SupplierCreateBody) =>
    requestWithSchema('/suppliers', supplierResponseSchema, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: SupplierUpdateBody) =>
    requestWithSchema(`/suppliers/${id}`, supplierResponseSchema, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) => request<void>(`/suppliers/${id}`, { method: 'DELETE' }),
  lowStock: (supplierId: string) =>
    requestWithSchema(`/suppliers/${supplierId}/low-stock`, supplierLowStockResponseSchema),
  getProductSuppliers: (productId: string) =>
    requestWithSchema(`/suppliers/by-product/${productId}`, productSupplierIdsResponseSchema),
  setProductSuppliers: (productId: string, supplierIds: string[]) =>
    requestWithSchema(`/suppliers/by-product/${productId}`, productSupplierIdsResponseSchema, {
      method: 'PUT',
      body: JSON.stringify({ supplierIds }),
    }),
}
```

**Step 2: Add barrel export**

In `src/lib/api.ts`, add after line 10:
```typescript
export * from './api/suppliers'
```

**Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add src/lib/api/suppliers.ts src/lib/api.ts
git commit -m "feat: add supplier API client"
```

---

## Task 15: Supplier — Settings UI Section

**Files:**
- Create: `src/features/settings/components/SupplierManagementSection.tsx`
- Modify: `src/features/settings/pages/SettingsPage.tsx`

**Step 1: Create SupplierManagementSection**

Create `src/features/settings/components/SupplierManagementSection.tsx`:

```tsx
import type { Supplier } from '../../../lib/api'

interface SupplierManagementSectionProps {
  suppliersList: Supplier[]
  newSupplierName: string
  onNewSupplierNameChange: (value: string) => void
  saving: boolean
  onAddSupplier: () => void
  onDeleteSupplier: (id: string) => void
}

export default function SupplierManagementSection({
  suppliersList,
  newSupplierName,
  onNewSupplierNameChange,
  saving,
  onAddSupplier,
  onDeleteSupplier,
}: SupplierManagementSectionProps) {
  return (
    <section className="card space-y-4">
      <h3 className="font-medium">Suppliers / Shops</h3>
      <p className="text-sm text-gray-500">
        Manage shops where products can be purchased. Assign suppliers to products to generate per-shop shopping lists.
      </p>

      {suppliersList.length > 0 && (
        <div className="space-y-2">
          {suppliersList.map((supplier) => (
            <div key={supplier.id} className="flex justify-between items-center bg-gray-50 p-2 rounded-lg">
              <span>{supplier.name}</span>
              <button
                onClick={() => onDeleteSupplier(supplier.id)}
                className="text-xs text-red-600 hover:text-red-700"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={newSupplierName}
          onChange={(e) => onNewSupplierNameChange(e.target.value)}
          className="input flex-1"
          placeholder="Shop name (e.g., Home Bargains)"
        />
        <button
          onClick={onAddSupplier}
          disabled={saving || !newSupplierName.trim()}
          className="btn-primary"
        >
          Add
        </button>
      </div>
    </section>
  )
}
```

**Step 2: Wire into SettingsPage**

In `SettingsPage.tsx`, add import:
```typescript
import SupplierManagementSection from '../components/SupplierManagementSection'
```

Add to the import from `'../../../lib/api'`: `suppliers` namespace and `Supplier` type.

Add state:
```typescript
  const [suppliersList, setSuppliersList] = useState<Supplier[]>([])
  const [newSupplierName, setNewSupplierName] = useState('')
```

Add `suppliers.list()` to the `loadSettings` `Promise.all` and process the result:
```typescript
setSuppliersList(suppliersData)
```

Add handlers:
```typescript
  const handleAddSupplier = async () => {
    if (!newSupplierName.trim()) return
    setSaving(true)
    setError(null)
    try {
      await suppliers.create({ name: newSupplierName.trim() })
      setNewSupplierName('')
      await loadSettings()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add supplier')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteSupplier = async (id: string) => {
    if (!confirm('Delete this supplier?')) return
    try {
      await suppliers.delete(id)
      await loadSettings()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete supplier')
    }
  }
```

Add component in JSX after `<PostageTiersSection>`:
```tsx
      <SupplierManagementSection
        suppliersList={suppliersList}
        newSupplierName={newSupplierName}
        onNewSupplierNameChange={setNewSupplierName}
        saving={saving}
        onAddSupplier={handleAddSupplier}
        onDeleteSupplier={handleDeleteSupplier}
      />
```

**Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add src/features/settings/
git commit -m "feat: add supplier management section in settings"
```

---

## Task 16: Supplier — Product Form Multi-Select

**Files:**
- Modify: `src/features/products/components/ProductForm.tsx`
- Modify: `src/features/products/pages/ProductsPage.tsx` (or wherever ProductForm is rendered)

**Step 1: Add supplier multi-select to ProductForm**

In `ProductForm.tsx`, add to props interface:
```typescript
  allSuppliers: Supplier[]
  selectedSupplierIds: string[]
  onSupplierToggle: (supplierId: string) => void
```

Add import:
```typescript
import type { Supplier } from '../../../lib/api'
```

Add the multi-select UI after the Low Stock Threshold field (after line 98), before the barcodes section:

```tsx
      {allSuppliers.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Available at</label>
          <div className="space-y-1">
            {allSuppliers.map((supplier) => (
              <label key={supplier.id} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedSupplierIds.includes(supplier.id)}
                  onChange={() => onSupplierToggle(supplier.id)}
                  className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700">{supplier.name}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Select shops where this product can be purchased
          </p>
        </div>
      )}
```

**Step 2: Wire up in the parent page**

In the Products page (find where `ProductForm` is rendered), add state and logic:

```typescript
const [allSuppliers, setAllSuppliers] = useState<Supplier[]>([])
const [selectedSupplierIds, setSelectedSupplierIds] = useState<string[]>([])
```

Fetch suppliers on mount:
```typescript
suppliers.list().then(setAllSuppliers).catch(() => {})
```

When editing a product, fetch its current suppliers:
```typescript
// In the edit handler, after setting form data:
suppliers.getProductSuppliers(product.id).then(setSelectedSupplierIds).catch(() => {})
```

Add toggle handler:
```typescript
const handleSupplierToggle = (supplierId: string) => {
  setSelectedSupplierIds(prev =>
    prev.includes(supplierId)
      ? prev.filter(id => id !== supplierId)
      : [...prev, supplierId]
  )
}
```

On save (after creating/updating product), save supplier associations:
```typescript
// After product save succeeds:
await suppliers.setProductSuppliers(productId, selectedSupplierIds)
```

Reset on cancel:
```typescript
setSelectedSupplierIds([])
```

Pass props to `ProductForm`:
```tsx
allSuppliers={allSuppliers}
selectedSupplierIds={selectedSupplierIds}
onSupplierToggle={handleSupplierToggle}
```

**Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add src/features/products/
git commit -m "feat: add supplier multi-select to product form"
```

---

## Task 17: Shopping List — Page & Route

**Files:**
- Create: `src/features/shopping-list/pages/ShoppingListPage.tsx`
- Create: `src/pages/ShoppingList.tsx` (re-export)
- Modify: `src/App.tsx` (add route)
- Modify: `src/features/settings/pages/SettingsPage.tsx` (add link)

**Step 1: Create ShoppingListPage**

Create `src/features/shopping-list/pages/ShoppingListPage.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { suppliers, type Supplier, type SupplierLowStockItem } from '../../../lib/api'

export default function ShoppingListPage() {
  const [allSuppliers, setAllSuppliers] = useState<Supplier[]>([])
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const [lowStockItems, setLowStockItems] = useState<SupplierLowStockItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingItems, setLoadingItems] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    suppliers.list()
      .then((data) => {
        setAllSuppliers(data)
        setLoading(false)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load suppliers')
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    if (!selectedSupplierId) {
      setLowStockItems([])
      return
    }
    setLoadingItems(true)
    suppliers.lowStock(selectedSupplierId)
      .then((data) => {
        setLowStockItems(data)
        setLoadingItems(false)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load shopping list')
        setLoadingItems(false)
      })
  }, [selectedSupplierId])

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Loading...</div>
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Shopping List</h2>
      <p className="text-sm text-gray-500">
        Select a shop to see which products are low on stock and need restocking.
      </p>

      {error && <div className="alert-danger">{error}</div>}

      <select
        value={selectedSupplierId}
        onChange={(e) => setSelectedSupplierId(e.target.value)}
        className="input"
      >
        <option value="">Select a shop...</option>
        {allSuppliers.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>

      {selectedSupplierId && (
        loadingItems ? (
          <div className="text-center py-4 text-gray-500">Loading...</div>
        ) : lowStockItems.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p className="mb-1">No low stock items</p>
            <p className="text-sm">All products from this shop are well stocked!</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-sm text-gray-500 font-medium">
              {lowStockItems.length} item{lowStockItems.length !== 1 ? 's' : ''} need restocking
            </div>
            {lowStockItems.map((item) => (
              <div key={item.id} className="card flex justify-between items-center">
                <div>
                  <div className="font-medium">{item.name}</div>
                  {item.categoryName && (
                    <div className="text-xs text-gray-500">{item.categoryName}</div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-red-600 font-semibold">
                    {item.totalStock} {item.unit}
                  </div>
                  <div className="text-xs text-gray-500">
                    threshold: {item.lowStockThreshold}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}
```

**Step 2: Create re-export page stub**

Create `src/pages/ShoppingList.tsx`:
```typescript
export { default } from '../features/shopping-list/pages/ShoppingListPage'
```

**Step 3: Add route to App.tsx**

In `src/App.tsx`, add lazy import (after line 15):
```typescript
const ShoppingList = lazy(() => import('./pages/ShoppingList'))
```

Add route (after line 54):
```tsx
          <Route path="shopping-list" element={<ShoppingList />} />
```

**Step 4: Add link in Settings**

In `src/features/settings/pages/SettingsPage.tsx`, add to the `settingsLinks` array (after line 23):
```typescript
  {
    to: '/shopping-list',
    title: 'Shopping List',
    description: 'View low-stock products by supplier for restocking trips',
  },
```

**Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

**Step 6: Manually test end-to-end**

1. Add suppliers in Settings (Home Bargains, Amazon, Temu)
2. Edit products and assign suppliers
3. Go to Shopping List, select a supplier, verify low-stock products appear

**Step 7: Commit**

```bash
git add src/features/shopping-list/ src/pages/ShoppingList.tsx src/App.tsx src/features/settings/
git commit -m "feat: add shopping list page with per-supplier low stock view"
```

---

## Task 18: Final Verification & Cleanup

**Step 1: Run full TypeScript check**

```bash
npx tsc --noEmit
```

**Step 2: Run lint**

```bash
npm run lint
```

**Step 3: Run tests**

```bash
npm test
```

Fix any issues that arise.

**Step 4: Manual smoke test**

1. Settings: verify postage tiers CRUD works
2. Settings: verify supplier CRUD works
3. Etsy import: verify postage cost pre-fills from tiers
4. Manual sale: verify postage cost defaults from tiers
5. Expenses: verify both VAT fields are editable independently
6. Dashboard: click Low Stock card → goes to filtered inventory
7. Inventory: filter chip shows, × clears it
8. Products: supplier checkboxes appear and save correctly
9. Shopping List: select a shop, see low stock items

**Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "chore: fix lint/type issues from new features"
```
