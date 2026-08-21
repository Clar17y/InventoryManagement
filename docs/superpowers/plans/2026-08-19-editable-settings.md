# Editable Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make postage tiers, packaging overheads, supplier names, and Etsy fee configuration safely editable inside the existing Settings & More page, with archive/restore behavior and transactional audit history.

**Architecture:** Keep the existing Settings and Suppliers feature routers and shared Zod contract pattern. Add one generic audit table and audit writer, make unique-key creates recover archived records, and expose active-plus-archived data only when the Settings editor explicitly requests it. On the client, preserve the More links and untouched Etsy Access Management panel while adding a URL-backed section shell and focused inline editors.

**Tech Stack:** React 19, TypeScript 5.6, React Router 7, Express 4, Zod, Prisma 6, PostgreSQL, Vitest, Testing Library, Tailwind CSS 4.

## Global Constraints

- Keep the existing **Settings & More** heading and the Sales, Analytics, Shopping List, Categories, Products, and Expenses links unchanged.
- Etsy Access Management is outside this redesign; do not modify `EtsyAccessManagementSection.tsx` or its handlers.
- Supplier product assignment remains unchanged and must retain existing relationships through archive/restore.
- Existing no-argument list calls remain active-only; archived records are returned only for explicit `includeArchived=true` requests.
- Postage `etsyCharge` and supplier `name` stay globally unique across active and archived rows.
- Add never exposes a raw uniqueness conflict: it creates, updates the matching active postage tier, or restores the matching archived record.
- Edit never merges two identities; a unique key owned by another record returns HTTP 409.
- Every create, update, archive, restore, and new Etsy fee version writes its audit entry in the same Prisma transaction.
- Audit snapshots never include Etsy credentials or tokens.
- Follow strict TDD: write one behavior test, observe the expected failure, implement the minimum change, and keep the focused suite green.
- Preserve the unrelated untracked `docs/superpowers/plans/2026-04-16-etsy-price-pull.md` file and do not stage `.superpowers/brainstorm/`.

## File Map

### Persistence and shared contracts

- Modify `prisma/schema.prisma` — define settings audit enums and `SettingsAuditLog`.
- Create `prisma/migrations/20260819103000_add_settings_audit_log/migration.sql` — add the audit enums, table, and indexes without rewriting existing setting rows.
- Modify `contracts/domain/settings.ts` — add audit-domain schemas and types.
- Modify `contracts/routes/settings.ts` — add archived-list queries, mutation outcomes, restore params, and audit responses.
- Modify `contracts/routes/suppliers.ts` — add archived-list queries, supplier creation outcomes, ID params, and restore responses.
- Create `server/lib/settingsAudit.ts` — insert a normalized audit snapshot through a supplied transaction client.

### Server behavior

- Modify `server/features/settings/router.ts` — add transactional fee, packaging, postage, restore, audit-list, and conflict behavior.
- Modify `server/features/suppliers/router.ts` — add create-or-restore, transactional update/archive/restore, and correct 404/409 mapping while leaving product routes unchanged.
- Create `server/__tests__/settings/contracts.test.ts` — prove shared parsing and response contracts.
- Create `server/__tests__/settings/router.test.ts` — exercise the real Settings router over HTTP with a controlled Prisma boundary.
- Create `server/__tests__/suppliers/router.test.ts` — exercise supplier management over HTTP and preserve product relationships.

### Client API and UI

- Modify `src/lib/api/settings.ts` — expose archived lists, outcome-aware create, restore, and audit methods.
- Modify `src/lib/api/suppliers.ts` — expose archived lists, outcome-aware create, and restore.
- Modify `src/__tests__/lib/api/settings.test.ts` — verify exact Settings request/response contracts.
- Modify `src/__tests__/lib/api/suppliers.test.ts` — verify exact Supplier request/response contracts.
- Modify `src/__tests__/utils/api-mocks.ts` — provide complete Settings and Supplier mocks used by page tests.
- Create `src/features/settings/components/SettingsSectionNav.tsx` — render accessible responsive section navigation.
- Create `src/features/settings/components/AuditHistorySection.tsx` — render and expand the latest audit entries.
- Modify `src/features/settings/pages/SettingsPage.tsx` — retain More links and Etsy Access Management, own URL section state and server data, and compose the redesigned editors.
- Modify `src/features/settings/components/PostageTiersSection.tsx` — inline add/edit/archive/restore with label support and per-row pending state.
- Modify `src/features/settings/components/PackagingOverheadSection.tsx` — inline edit/archive/restore with per-row pending state.
- Modify `src/features/settings/components/SupplierManagementSection.tsx` — inline rename/archive/restore while preserving Products management.
- Create `src/__tests__/components/SettingsSectionNav.test.tsx`.
- Create `src/__tests__/components/AuditHistorySection.test.tsx`.
- Modify `src/__tests__/components/PostageTiersSection.test.tsx`.
- Create `src/__tests__/components/PackagingOverheadSection.test.tsx`.
- Modify `src/__tests__/components/SupplierManagementSection.test.tsx`.
- Modify `src/__tests__/pages/Settings.test.tsx`.
- Modify `docs/PROGRESS.md` — record start, completion, verification, and handoff state.

---

### Task 1: Add Audit Persistence and Shared Contracts

**Files:**
- Modify: `docs/PROGRESS.md`
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260819103000_add_settings_audit_log/migration.sql`
- Modify: `contracts/domain/settings.ts`
- Modify: `contracts/routes/settings.ts`
- Modify: `contracts/routes/suppliers.ts`
- Create: `server/lib/settingsAudit.ts`
- Create: `server/__tests__/settings/contracts.test.ts`

**Interfaces:**
- Produces: `SettingsAuditType`, `SettingsAuditAction`, `SettingsAuditEntry`, `IncludeArchivedQuery`, `PostageTierMutationResponse`, `SupplierMutationResponse`, and `writeSettingsAudit(tx, entry)`.
- Consumes: existing `postageTierSchema`, `packagingOverheadSchema`, `etsyFeeConfigSchema`, `supplierSchema`, `cuidSchema`, and `isoDateTimeSchema`.

- [ ] **Step 1: Record the implementation start**

Add this Active Work Log row before changing application code:

```markdown
| 2026-08-19 | Codex + subagents | Editable settings, archive/restore, and audit history | In Progress | codex/editable-settings |
```

- [ ] **Step 2: Write failing contract tests**

Create `server/__tests__/settings/contracts.test.ts` with literal expectations for the new behavior:

```ts
import { describe, expect, it } from 'vitest'
import {
  includeArchivedQuerySchema,
  postageTierCreateBodySchema,
  postageTierUpdateBodySchema,
  postageTierMutationResponseSchema,
  settingsAuditEntriesResponseSchema,
} from '#contracts/routes/settings'
import {
  supplierCreateBodySchema,
  supplierMutationResponseSchema,
} from '#contracts/routes/suppliers'

describe('editable settings contracts', () => {
  it('accepts only an explicit true archived-list query', () => {
    expect(includeArchivedQuerySchema.parse({ includeArchived: 'true' })).toEqual({ includeArchived: true })
    expect(includeArchivedQuerySchema.parse({})).toEqual({ includeArchived: false })
  })

  it('trims names and labels and rejects negative money', () => {
    expect(postageTierCreateBodySchema.parse({ etsyCharge: 5, actualCost: 3.65, label: '  Tracked  ' })).toEqual({
      etsyCharge: 5,
      actualCost: 3.65,
      label: 'Tracked',
    })
    expect(postageTierCreateBodySchema.safeParse({ etsyCharge: -1, actualCost: 3.65 }).success).toBe(false)
    expect(postageTierUpdateBodySchema.parse({ label: null })).toEqual({ label: null })
    expect(supplierCreateBodySchema.parse({ name: '  Home Bargains  ' })).toEqual({ name: 'Home Bargains' })
  })

  it('parses mutation outcomes and nullable audit snapshots', () => {
    expect(postageTierMutationResponseSchema.parse({
      item: {
        id: 'clx0q2p1w0000s1l1n4m9n9n9', etsyCharge: '5.00', actualCost: '3.65',
        label: null, isActive: true, createdAt: '2026-08-19T09:00:00.000Z',
      },
      outcome: 'restored',
    }).outcome).toBe('restored')
    expect(supplierMutationResponseSchema.parse({
      item: {
        id: 'clx0q2p1w0000s1l1n4m9n9n9', name: 'Home Bargains', isActive: true,
        createdAt: '2026-08-19T09:00:00.000Z', updatedAt: '2026-08-19T09:00:00.000Z',
      },
      outcome: 'existing',
    }).outcome).toBe('existing')
    expect(settingsAuditEntriesResponseSchema.parse([{
      id: 'clx0q2p1w0000s1l1n4m9n9n9', settingType: 'POSTAGE_TIER', settingId: 'tier-1',
      action: 'RESTORE', before: { isActive: false }, after: { isActive: true },
      createdAt: '2026-08-19T09:00:00.000Z',
    }])).toHaveLength(1)
  })
})
```

- [ ] **Step 3: Run the contract test and confirm RED**

Run:

```powershell
npm run test:server:run -- server/__tests__/settings/contracts.test.ts
```

Expected: FAIL because the archived query, mutation response, audit response, and supplier mutation exports do not exist.

- [ ] **Step 4: Add the audit model and migration**

Add these Prisma definitions:

```prisma
enum SettingsAuditType {
  POSTAGE_TIER
  PACKAGING_OVERHEAD
  SUPPLIER
  ETSY_FEE_CONFIG
}

enum SettingsAuditAction {
  CREATE
  UPDATE
  ARCHIVE
  RESTORE
}

model SettingsAuditLog {
  id          String              @id @default(cuid())
  settingType SettingsAuditType
  settingId   String
  action      SettingsAuditAction
  before      Json?
  after       Json?
  createdAt   DateTime            @default(now())

  @@index([createdAt])
  @@index([settingType, createdAt])
}
```

Create the matching PostgreSQL migration with both enums, a `SettingsAuditLog` table using `JSONB` snapshots, a primary key, and indexes on `createdAt` and `(settingType, createdAt)`. Do not update existing setting rows in the migration.

- [ ] **Step 5: Implement the shared schemas**

Use these exact public shapes:

```ts
export const settingsAuditTypeSchema = z.enum([
  'POSTAGE_TIER', 'PACKAGING_OVERHEAD', 'SUPPLIER', 'ETSY_FEE_CONFIG',
])
export const settingsAuditActionSchema = z.enum(['CREATE', 'UPDATE', 'ARCHIVE', 'RESTORE'])
export const settingsMutationOutcomeSchema = z.enum(['created', 'updated', 'restored'])
export const supplierMutationOutcomeSchema = z.enum(['created', 'existing', 'restored'])
export const includeArchivedQuerySchema = z.object({
  includeArchived: z.literal('true').optional().transform((value) => value === 'true'),
})
export const postageTierMutationResponseSchema = z.object({
  item: postageTierSchema,
  outcome: settingsMutationOutcomeSchema,
})
export const supplierMutationResponseSchema = z.object({
  item: supplierSchema,
  outcome: supplierMutationOutcomeSchema,
})
export const settingsAuditEntrySchema = z.object({
  id: cuidSchema,
  settingType: settingsAuditTypeSchema,
  settingId: z.string().min(1),
  action: settingsAuditActionSchema,
  before: z.record(z.unknown()).nullable(),
  after: z.record(z.unknown()).nullable(),
  createdAt: isoDateTimeSchema,
})
export const settingsAuditEntriesResponseSchema = z.array(settingsAuditEntrySchema)
```

Apply `.trim().min(1).max(100)` to setting and supplier names and retain non-negative finite number validation for currency fields. Use a create-label schema that transforms a trimmed empty string to `undefined`, and an update-label schema that accepts `null` so Edit can clear an existing label:

```ts
const postageTierCreateLabelSchema = z.string().trim().max(100).transform((value) => value || undefined).optional()
const postageTierUpdateLabelSchema = z.string().trim().max(100).nullable().optional()
```

Add CUID param schemas for every update/archive/restore route.

- [ ] **Step 6: Add the transactional audit writer**

Create `server/lib/settingsAudit.ts`:

```ts
import { Prisma, SettingsAuditAction, SettingsAuditType } from '@prisma/client'

type AuditTx = Pick<Prisma.TransactionClient, 'settingsAuditLog'>

interface SettingsAuditInput {
  settingType: SettingsAuditType
  settingId: string
  action: SettingsAuditAction
  before: Prisma.InputJsonObject | null
  after: Prisma.InputJsonObject | null
}

export function writeSettingsAudit(tx: AuditTx, entry: SettingsAuditInput) {
  return tx.settingsAuditLog.create({
    data: {
      ...entry,
      before: entry.before ?? Prisma.DbNull,
      after: entry.after ?? Prisma.DbNull,
    },
  })
}
```

Callers must build explicit plain snapshots with Decimal values converted to strings; do not pass complete Prisma records or credentials.

- [ ] **Step 7: Verify GREEN and validate Prisma**

Run:

```powershell
npm run db:generate
npx prisma validate
npm run test:server:run -- server/__tests__/settings/contracts.test.ts
npx tsc -p server/tsconfig.json --noEmit --rootDir .
npx tsc -p tsconfig.json --noEmit
```

Expected: all commands PASS.

- [ ] **Step 8: Commit Task 1**

```powershell
git add docs/PROGRESS.md prisma/schema.prisma prisma/migrations/20260819103000_add_settings_audit_log contracts/domain/settings.ts contracts/routes/settings.ts contracts/routes/suppliers.ts server/lib/settingsAudit.ts server/__tests__/settings/contracts.test.ts
git commit -m "feat: add settings audit contracts and persistence"
```

---

### Task 2: Make Settings Mutations Transactional and Conflict-Safe

**Files:**
- Modify: `server/features/settings/router.ts`
- Create: `server/__tests__/settings/router.test.ts`

**Interfaces:**
- Consumes: `includeArchivedQuerySchema`, postage/packaging ID and body schemas, `postageTierMutationResponseSchema`, `writeSettingsAudit`.
- Produces: active-only or archived-inclusive list responses; `POST /postage-tiers` outcome envelope; `POST /postage-tiers/:id/restore`; `POST /packaging-overhead/:id/restore`; `GET /audit`.

- [ ] **Step 1: Write the failing real-router tests**

Use the existing `server/__tests__/reporting/router.test.ts` pattern: mock `server/lib/prisma`, mount the actual Settings router in Express, listen on an ephemeral port, call it with `fetch`, and close it after each test.

Cover these literal behaviors in `server/__tests__/settings/router.test.ts`:

```ts
it('restores and updates an archived £5 tier instead of returning 409', async () => {
  const response = await request('/api/settings/postage-tiers', {
    method: 'POST',
    body: JSON.stringify({ etsyCharge: 5, actualCost: 3.65, label: 'Tracked' }),
  })
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({
    outcome: 'restored',
    item: { id: 'tier-5', etsyCharge: '5.00', actualCost: '3.65', label: 'Tracked', isActive: true },
  })
})

it('updates an active matching tier and reports updated', async () => {
  const response = await request('/api/settings/postage-tiers', {
    method: 'POST',
    body: JSON.stringify({ etsyCharge: 5, actualCost: 3.95 }),
  })
  expect(response.status).toBe(200)
  expect((await response.json()).outcome).toBe('updated')
})

it('recovers a create uniqueness race by updating the winning row', async () => {
  prismaMock.postageTier.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(activeTier)
  prismaMock.postageTier.create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('duplicate', {
    code: 'P2002', clientVersion: '6.2.0', meta: { target: ['etsyCharge'] },
  }))
  const response = await request('/api/settings/postage-tiers', {
    method: 'POST', body: JSON.stringify({ etsyCharge: 5, actualCost: 3.65 }),
  })
  expect(response.status).toBe(200)
  expect((await response.json()).outcome).toBe('updated')
})

it('rejects editing a tier to a charge owned by a different tier', async () => {
  const response = await request('/api/settings/postage-tiers/tier-3', {
    method: 'PUT', body: JSON.stringify({ etsyCharge: 5 }),
  })
  expect(response.status).toBe(409)
  expect(await response.json()).toEqual({ error: 'Etsy charge £5.00 is already used by another tier', field: 'etsyCharge' })
})
```

Also cover: `includeArchived=true` removes the active filter; omitted query keeps `{ isActive: true }`; an archived-inclusive packaging response still calculates `totalPerOrder` from active rows only; invalid bodies return 400; missing IDs return 404; editing a postage label to `null` clears it; packaging update/archive/restore maintains `effectiveTo`; Etsy fee versioning and every mutation call `settingsAuditLog.create` inside the same callback transaction; an audit failure yields 500 and the transaction rejects; `GET /audit` returns at most 100 rows ordered by `createdAt desc`.

- [ ] **Step 2: Run the Settings router tests and confirm RED**

```powershell
npm run test:server:run -- server/__tests__/settings/router.test.ts
```

Expected: FAIL because archived queries, restore routes, create outcomes, audit reads, transactional audit writes, and 404/409 mappings are absent.

- [ ] **Step 3: Implement active-plus-archived reads**

Parse `req.query` with `includeArchivedQuerySchema` and build list filters exactly as follows:

```ts
const { includeArchived } = includeArchivedQuerySchema.parse(req.query)
const where = includeArchived ? undefined : { isActive: true }
```

Apply this only to packaging and postage lists. Existing omitted-query behavior remains active-only. When packaging includes archived rows, compute `totalPerOrder` by filtering `isActive` before summing so archived costs never enter the live order overhead.

- [ ] **Step 4: Implement postage create-or-update with race recovery**

Use `findUnique({ where: { etsyCharge } })` to distinguish `updated` from `restored`. For an existing row, update `actualCost`, normalized `label`, and `isActive: true` in a callback transaction, then insert the matching `UPDATE` or `RESTORE` audit entry through the same transaction client.

For a missing row, create and audit it in one transaction and return HTTP 201 with `outcome: 'created'`. If that create throws `P2002`, start a new callback transaction, re-read the winning row, update it with the request, audit `UPDATE` or `RESTORE`, and return HTTP 200. Never audit the failed create attempt.

Use explicit postage snapshots:

```ts
const postageSnapshot = (tier: PostageTier): Prisma.InputJsonObject => ({
  etsyCharge: tier.etsyCharge.toString(),
  actualCost: tier.actualCost.toString(),
  label: tier.label,
  isActive: tier.isActive,
})
```

- [ ] **Step 5: Implement update, archive, and restore**

For Edit, load the target first. When `etsyCharge` changes, query that charge and return 409 if its ID differs. Perform update and audit atomically. Convert Prisma `P2025` into 404.

Archive uses `DELETE` and is idempotent: an already archived record returns 204 without writing a second audit row. Restore uses `POST /:id/restore`, returns the restored item, and writes `RESTORE` only when state changes.

Packaging archive sets `isActive: false` and `effectiveTo: now`; restore sets `isActive: true` and `effectiveTo: null`. Packaging Edit snapshots and audits both the name and string-form cost.

- [ ] **Step 6: Make Etsy fee versioning atomic and expose audit history**

Wrap deactivation, new config creation, and the new config's `CREATE` audit entry in one callback transaction. Preserve the current versioned behavior and response body.

Add `GET /audit`:

```ts
const entries = await prisma.settingsAuditLog.findMany({
  orderBy: { createdAt: 'desc' },
  take: 100,
})
res.json(entries)
```

- [ ] **Step 7: Verify the focused server behavior**

```powershell
npm run test:server:run -- server/__tests__/settings/contracts.test.ts server/__tests__/settings/router.test.ts
npx tsc server/features/settings/router.ts --noEmit
npx tsc -p server/tsconfig.json --noEmit --rootDir .
```

Expected: focused tests and the project server type-check PASS. If the standalone file check cannot resolve repository aliases, retain its output in the task report and use the passing project check as the binding type result.

- [ ] **Step 8: Commit Task 2**

```powershell
git add server/features/settings/router.ts server/__tests__/settings/router.test.ts
git commit -m "fix: make settings mutations conflict safe"
```

---

### Task 3: Make Supplier Management Editable and Restorable

**Files:**
- Modify: `server/features/suppliers/router.ts`
- Create: `server/__tests__/suppliers/router.test.ts`

**Interfaces:**
- Consumes: `includeArchivedQuerySchema`, supplier params/bodies/outcomes, `writeSettingsAudit`.
- Produces: `GET /api/suppliers?includeArchived=true`, outcome-aware `POST /api/suppliers`, conflict-safe `PUT`, idempotent `DELETE`, and `POST /api/suppliers/:id/restore`.

- [ ] **Step 1: Write failing supplier route tests**

Mount the real Suppliers router and cover:

```ts
it('restores an archived supplier and preserves its ID', async () => {
  const response = await request('/api/suppliers', {
    method: 'POST', body: JSON.stringify({ name: ' Home Bargains ' }),
  })
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({
    outcome: 'restored',
    item: { id: 'supplier-1', name: 'Home Bargains', isActive: true },
  })
})

it('returns the existing active supplier without duplicating it', async () => {
  const response = await request('/api/suppliers', {
    method: 'POST', body: JSON.stringify({ name: 'Home Bargains' }),
  })
  expect(response.status).toBe(200)
  expect((await response.json()).outcome).toBe('existing')
})

it('rejects a rename owned by another supplier', async () => {
  const response = await request('/api/suppliers/supplier-1', {
    method: 'PUT', body: JSON.stringify({ name: 'B&M' }),
  })
  expect(response.status).toBe(409)
  expect(await response.json()).toEqual({ error: 'Supplier name is already in use', field: 'name' })
})
```

Also prove active-only default listing, archived-inclusive listing, 400/404 mapping, create uniqueness-race recovery, archive/restore audit atomicity, idempotent state operations, and no deletion or recreation of `ProductSupplier` rows.

- [ ] **Step 2: Run the supplier tests and confirm RED**

```powershell
npm run test:server:run -- server/__tests__/suppliers/router.test.ts
```

Expected: FAIL because create returns a plain item/409, archived queries and restore are absent, mutations are not audited, and update uniqueness failures become 500.

- [ ] **Step 3: Implement supplier list and create-or-restore**

Parse the explicit archived query while preserving no-argument active-only behavior. Normalize names through the shared contract.

For Add:

- No matching name: transactionally create, audit `CREATE`, return 201/`created`.
- Active matching name: return 200/`existing` without a no-op audit row.
- Archived matching name: transactionally set `isActive: true`, audit `RESTORE`, return 200/`restored`.
- `P2002` after a missing pre-read: re-read the winning supplier and apply the active/archived branch.

The restore branch updates the existing Supplier row only; it never writes `ProductSupplier`.

- [ ] **Step 4: Implement rename, archive, and restore**

Rename pre-checks `findUnique({ where: { name } })`; a different ID returns the defined 409 body. Update and audit the name snapshot in one callback transaction.

Archive and Restore are idempotent, use the same supplier ID, and audit only actual state changes. Map `P2025` to 404. Leave `/:id/products`, `/by-product/:productId`, and low-stock routes byte-for-byte unchanged except imports required by the new management code.

- [ ] **Step 5: Verify and commit Task 3**

```powershell
npm run test:server:run -- server/__tests__/suppliers/router.test.ts server/__tests__/settings/router.test.ts
npx tsc server/features/suppliers/router.ts --noEmit
npx tsc -p server/tsconfig.json --noEmit --rootDir .
git add server/features/suppliers/router.ts server/__tests__/suppliers/router.test.ts
git commit -m "feat: restore and audit supplier settings"
```

Expected: all focused tests and the server project type-check PASS; standalone alias limitations, if emitted, are recorded without weakening the passing project check.

---

### Task 4: Extend the Typed Client APIs

**Files:**
- Modify: `src/lib/api/settings.ts`
- Modify: `src/lib/api/suppliers.ts`
- Modify: `src/__tests__/lib/api/settings.test.ts`
- Modify: `src/__tests__/lib/api/suppliers.test.ts`
- Modify: `src/__tests__/utils/api-mocks.ts`

**Interfaces:**
- Consumes: the outcome and audit contracts from Tasks 1–3.
- Produces: optional archived list queries, restore methods, and typed mutation outcomes for Settings UI components.

- [ ] **Step 1: Add failing client API tests**

Add exact request-shape tests:

```ts
it('loads active and archived postage tiers for Settings', async () => {
  fetchMock.mockResponseOnce(JSON.stringify([postageTier]))
  await settings.getPostageTiers({ includeArchived: true })
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/settings/postage-tiers?includeArchived=true',
    expect.objectContaining({ headers: expect.any(Headers) }),
  )
})

it('restores a postage tier', async () => {
  fetchMock.mockResponseOnce(JSON.stringify(postageTier))
  await settings.restorePostageTier('tier-1')
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/settings/postage-tiers/tier-1/restore',
    expect.objectContaining({ method: 'POST' }),
  )
})

it('loads audit history', async () => {
  fetchMock.mockResponseOnce(JSON.stringify([auditEntry]))
  await settings.getAuditHistory()
  expect(fetchMock).toHaveBeenCalledWith('/api/settings/audit', expect.any(Object))
})
```

Add matching packaging and supplier archived-list/restore tests and assert that `settings.createPostageTier` and `suppliers.create` parse the outcome envelopes. Retain existing no-argument tests and assert their URLs contain no query string.

- [ ] **Step 2: Run client API tests and confirm RED**

```powershell
npm run test:client:run -- src/__tests__/lib/api/settings.test.ts src/__tests__/lib/api/suppliers.test.ts
```

Expected: FAIL because the methods either lack options, parse the old response shape, or do not exist.

- [ ] **Step 3: Implement query serialization and methods**

Use one private helper in each API module:

```ts
function withArchived(path: string, options?: { includeArchived?: boolean }) {
  return options?.includeArchived ? `${path}?includeArchived=true` : path
}
```

Expose these signatures:

```ts
getPackagingOverhead(options?: { includeArchived?: boolean }): Promise<PackagingOverheadResponse>
restorePackagingOverhead(id: string): Promise<PackagingOverhead>
getPostageTiers(options?: { includeArchived?: boolean }): Promise<PostageTier[]>
createPostageTier(data: PostageTierCreateBody): Promise<PostageTierMutationResponse>
restorePostageTier(id: string): Promise<PostageTier>
getAuditHistory(): Promise<SettingsAuditEntry[]>

suppliers.list(options?: { includeArchived?: boolean }): Promise<Supplier[]>
suppliers.create(data: SupplierCreateBody): Promise<SupplierMutationResponse>
suppliers.restore(id: string): Promise<Supplier>
```

Keep `delete` methods as archive calls over existing DELETE endpoints. Extend `api-mocks.ts` with every new method and complete postage methods so page tests never pass through an undefined mock.

- [ ] **Step 4: Verify types, tests, and commit Task 4**

```powershell
npm run test:client:run -- src/__tests__/lib/api/settings.test.ts src/__tests__/lib/api/suppliers.test.ts
npx tsc src/lib/api/settings.ts --noEmit
npx tsc src/lib/api/suppliers.ts --noEmit
npx tsc -p tsconfig.json --noEmit
git add src/lib/api/settings.ts src/lib/api/suppliers.ts src/__tests__/lib/api/settings.test.ts src/__tests__/lib/api/suppliers.test.ts src/__tests__/utils/api-mocks.ts
git commit -m "feat: expose editable settings APIs"
```

Expected: API tests and project TypeScript PASS; any standalone alias-resolution output is recorded, with the project result remaining binding.

---

### Task 5: Add Section Navigation Without Changing Settings & More

**Files:**
- Create: `src/features/settings/components/SettingsSectionNav.tsx`
- Create: `src/__tests__/components/SettingsSectionNav.test.tsx`
- Modify: `src/features/settings/pages/SettingsPage.tsx`
- Modify: `src/__tests__/pages/Settings.test.tsx`

**Interfaces:**
- Produces: `SettingsSection = 'postage' | 'packaging' | 'suppliers' | 'etsy-fees' | 'audit'` and accessible section navigation.
- Consumes: React Router `useSearchParams`; existing More links, Etsy fee component, and untouched Etsy Access Management component.

- [ ] **Step 1: Write failing navigation and page-boundary tests**

Create a component test that renders all five tabs and verifies selection:

```tsx
render(<SettingsSectionNav active="postage" onChange={onChange} />)
expect(screen.getByRole('tab', { name: 'Postage' })).toHaveAttribute('aria-selected', 'true')
await user.click(screen.getByRole('tab', { name: 'Suppliers' }))
expect(onChange).toHaveBeenCalledWith('suppliers')
```

Extend `Settings.test.tsx` to prove:

- All six existing More links still point to their original destinations.
- `?section=suppliers` initially shows Suppliers.
- Clicking Packaging changes the URL to `?section=packaging` and shows only that redesigned panel.
- An unknown section value falls back to Postage.
- Etsy Access Management still renders outside the section shell and its component file is not modified.

- [ ] **Step 2: Run the focused UI tests and confirm RED**

```powershell
npm run test:client:run -- src/__tests__/components/SettingsSectionNav.test.tsx src/__tests__/pages/Settings.test.tsx
```

Expected: FAIL because the navigation component and URL-backed section state do not exist.

- [ ] **Step 3: Implement accessible responsive navigation**

Use this public API:

```ts
export const settingsSections = [
  { id: 'postage', label: 'Postage' },
  { id: 'packaging', label: 'Packaging' },
  { id: 'suppliers', label: 'Suppliers' },
  { id: 'etsy-fees', label: 'Etsy Fees' },
  { id: 'audit', label: 'Audit History' },
] as const

export type SettingsSection = typeof settingsSections[number]['id']
```

Render `role="tablist"` and `role="tab"` buttons. Use `overflow-x-auto` and `min-w-max` on small screens; at `md` width switch to a vertical list beside the active panel.

In `SettingsPage`, read and set the `section` search parameter. Preserve unrelated search parameters when changing sections. The shell appears below `SettingsLinksList`; `EtsyAccessManagementSection` remains after the shell with its current props and handlers.

- [ ] **Step 4: Verify navigation and commit Task 5**

```powershell
npm run test:client:run -- src/__tests__/components/SettingsSectionNav.test.tsx src/__tests__/pages/Settings.test.tsx
npx tsc src/features/settings/components/SettingsSectionNav.tsx --noEmit
npx tsc src/features/settings/pages/SettingsPage.tsx --noEmit
npx tsc -p tsconfig.json --noEmit
git add src/features/settings/components/SettingsSectionNav.tsx src/features/settings/pages/SettingsPage.tsx src/__tests__/components/SettingsSectionNav.test.tsx src/__tests__/pages/Settings.test.tsx
git commit -m "feat: add settings section navigation"
```

Expected: focused UI tests and project TypeScript PASS.

---

### Task 6: Build the Editable Postage Section

**Files:**
- Modify: `src/features/settings/components/PostageTiersSection.tsx`
- Modify: `src/features/settings/pages/SettingsPage.tsx`
- Modify: `src/__tests__/components/PostageTiersSection.test.tsx`
- Modify: `src/__tests__/pages/Settings.test.tsx`

**Interfaces:**
- Consumes: `PostageTier`, `PostageTierCreateBody`, `PostageTierUpdateBody`, `PostageTierMutationResponse` and the Task 4 API methods.
- Produces: inline add/edit/archive/restore with per-row pending state and field-level conflict display.

- [ ] **Step 1: Write failing postage interaction tests**

Cover these user-visible behaviors with real component markup:

```tsx
it('edits every postage field and saves the selected row', async () => {
  renderSection({ tiers: [tier], onUpdate })
  await user.click(screen.getByRole('button', { name: 'Edit £5.00 tier' }))
  await user.clear(screen.getByLabelText('Etsy charge'))
  await user.type(screen.getByLabelText('Etsy charge'), '5.50')
  await user.clear(screen.getByLabelText('Actual cost'))
  await user.type(screen.getByLabelText('Actual cost'), '3.85')
  await user.type(screen.getByLabelText('Label'), 'Tracked 48')
  await user.click(screen.getByRole('button', { name: 'Save £5.00 tier' }))
  expect(onUpdate).toHaveBeenCalledWith(tier.id, { etsyCharge: 5.5, actualCost: 3.85, label: 'Tracked 48' })
})

it('keeps the draft and shows a charge conflict beside the field', async () => {
  onUpdate.mockRejectedValue(new ApiError('Etsy charge £5.00 is already used by another tier', 409, {
    error: 'Etsy charge £5.00 is already used by another tier', field: 'etsyCharge',
  }))
  // enter the value and save
  expect(await screen.findByText('Etsy charge £5.00 is already used by another tier')).toBeInTheDocument()
  expect(screen.getByLabelText('Etsy charge')).toHaveValue(5)
})
```

Also cover Cancel restoring view mode, label editing, Add displaying `created`/`updated`/`restored` confirmation, Archive confirmation, collapsed Archived list, Restore, numeric validation, and a deferred Save disabling only the selected row.

- [ ] **Step 2: Run postage tests and confirm RED**

```powershell
npm run test:client:run -- src/__tests__/components/PostageTiersSection.test.tsx src/__tests__/pages/Settings.test.tsx
```

Expected: FAIL because Edit, label input, archived rows, Restore, outcome messages, and per-row state do not exist.

- [ ] **Step 3: Implement local row state and callbacks**

Use these props:

```ts
interface PostageTiersSectionProps {
  tiers: PostageTier[]
  onCreate: (data: PostageTierCreateBody) => Promise<PostageTierMutationResponse>
  onUpdate: (id: string, data: PostageTierUpdateBody) => Promise<PostageTier>
  onArchive: (id: string) => Promise<void>
  onRestore: (id: string) => Promise<PostageTier>
}
```

Split `tiers` by `isActive`. Store `editingId`, a string-valued draft, `pendingId`, `rowError`, `fieldError`, `showArchived`, and a section confirmation message. Normalize an empty label to `undefined` on Create and `null` on Edit. Disable only controls whose row key matches `pendingId`; use `'new'` as the Add form key.

Update `SettingsPage` callbacks to call the API and reload editable data without setting the page-wide initial `loading` flag. Load postage with `{ includeArchived: true }`.

- [ ] **Step 4: Verify and commit Task 6**

```powershell
npm run test:client:run -- src/__tests__/components/PostageTiersSection.test.tsx src/__tests__/pages/Settings.test.tsx
npx tsc src/features/settings/components/PostageTiersSection.tsx --noEmit
npx tsc src/features/settings/pages/SettingsPage.tsx --noEmit
npx tsc -p tsconfig.json --noEmit
git add src/features/settings/components/PostageTiersSection.tsx src/features/settings/pages/SettingsPage.tsx src/__tests__/components/PostageTiersSection.test.tsx src/__tests__/pages/Settings.test.tsx
git commit -m "feat: make postage tiers fully editable"
```

Expected: focused tests and project TypeScript PASS.

---

### Task 7: Build Editable Packaging and Supplier Sections

**Files:**
- Modify: `src/features/settings/components/PackagingOverheadSection.tsx`
- Modify: `src/features/settings/components/SupplierManagementSection.tsx`
- Modify: `src/features/settings/pages/SettingsPage.tsx`
- Create: `src/__tests__/components/PackagingOverheadSection.test.tsx`
- Modify: `src/__tests__/components/SupplierManagementSection.test.tsx`
- Modify: `src/__tests__/pages/Settings.test.tsx`

**Interfaces:**
- Consumes: typed Packaging and Supplier APIs from Task 4.
- Produces: consistent inline Edit/Save/Cancel/Archive/Restore behavior without changing `SupplierProductsModal`.

- [ ] **Step 1: Write failing packaging tests**

Prove name/cost editing, Cancel, Archive, collapsed archived rows, Restore, validation, recoverable request errors, and per-row pending state. The core save assertion is:

```tsx
expect(onUpdate).toHaveBeenCalledWith(overhead.id, {
  name: 'Bubble wrap',
  costPerOrder: 0.24,
})
```

Assert archived rows display `effectiveTo`, and Restore calls only `onRestore(overhead.id)`.

- [ ] **Step 2: Write failing supplier tests**

Prove inline rename, 409 field error with retained draft, Cancel, Archive, Restore, and create outcomes. Retain the existing Products test and assert it still opens `SupplierProductsModal` for the same supplier ID.

Use this public prop shape:

```ts
interface SupplierManagementSectionProps {
  suppliersList: Supplier[]
  onCreate: (data: SupplierCreateBody) => Promise<SupplierMutationResponse>
  onUpdate: (id: string, data: SupplierUpdateBody) => Promise<Supplier>
  onArchive: (id: string) => Promise<void>
  onRestore: (id: string) => Promise<Supplier>
}
```

- [ ] **Step 3: Run both component suites and confirm RED**

```powershell
npm run test:client:run -- src/__tests__/components/PackagingOverheadSection.test.tsx src/__tests__/components/SupplierManagementSection.test.tsx
```

Expected: FAIL because both components expose add/remove-only behavior.

- [ ] **Step 4: Implement packaging and supplier row editors**

Follow the Postage state pattern without introducing a generic form abstraction. Packaging maps empty/invalid money to a local field error and sends finite non-negative values only. Supplier names are trimmed before submit.

Load packaging and suppliers with `{ includeArchived: true }`. Parent callbacks reload editable data without blocking other panels. Keep `SupplierProductsModal.tsx` untouched and preserve the existing Products action for active supplier rows.

- [ ] **Step 5: Verify and commit Task 7**

```powershell
npm run test:client:run -- src/__tests__/components/PackagingOverheadSection.test.tsx src/__tests__/components/SupplierManagementSection.test.tsx src/__tests__/components/SupplierProductsModal.test.tsx src/__tests__/pages/Settings.test.tsx
npx tsc src/features/settings/components/PackagingOverheadSection.tsx --noEmit
npx tsc src/features/settings/components/SupplierManagementSection.tsx --noEmit
npx tsc src/features/settings/pages/SettingsPage.tsx --noEmit
npx tsc -p tsconfig.json --noEmit
git add src/features/settings/components/PackagingOverheadSection.tsx src/features/settings/components/SupplierManagementSection.tsx src/features/settings/pages/SettingsPage.tsx src/__tests__/components/PackagingOverheadSection.test.tsx src/__tests__/components/SupplierManagementSection.test.tsx src/__tests__/pages/Settings.test.tsx
git commit -m "feat: edit packaging and supplier settings"
```

Expected: focused component, modal regression, page tests, and project TypeScript PASS.

---

### Task 8: Add Audit History and Complete Verification

**Files:**
- Create: `src/features/settings/components/AuditHistorySection.tsx`
- Create: `src/__tests__/components/AuditHistorySection.test.tsx`
- Modify: `src/features/settings/pages/SettingsPage.tsx`
- Modify: `src/__tests__/pages/Settings.test.tsx`
- Modify: `docs/PROGRESS.md`

**Interfaces:**
- Consumes: `SettingsAuditEntry[]` from `settings.getAuditHistory()`.
- Produces: latest-first audit rendering with expandable before/after snapshots; final verified handoff.

- [ ] **Step 1: Write failing audit-history tests**

Use literal entries for each audited setting type. Prove newest-first rendering, readable setting/action labels, collapsed snapshots, expansion, null before/after handling, empty state, and absence of credential/token keys.

```tsx
render(<AuditHistorySection entries={[restoreEntry]} />)
expect(screen.getByText('Postage tier restored')).toBeInTheDocument()
expect(screen.queryByText('"actualCost": "3.65"')).not.toBeInTheDocument()
await user.click(screen.getByRole('button', { name: 'Show change details' }))
expect(screen.getByText(/"actualCost": "3.65"/)).toBeInTheDocument()
```

Extend the page test so choosing Audit History shows the entries loaded by `settings.getAuditHistory()` and all other redesigned panels are hidden.

- [ ] **Step 2: Run audit and page tests and confirm RED**

```powershell
npm run test:client:run -- src/__tests__/components/AuditHistorySection.test.tsx src/__tests__/pages/Settings.test.tsx
```

Expected: FAIL because the audit component and page data flow do not exist.

- [ ] **Step 3: Implement audit rendering and page integration**

Load audit entries with the other editable settings data. Render the server order unchanged; the server guarantees latest-first and a 100-row limit. Derive a display label from `after` first, then `before`: use `name`, then `label`, then `etsyCharge`, and finally `settingId`.

Keep expansion state local to `AuditHistorySection`. Render snapshots with `JSON.stringify(snapshot, null, 2)` inside accessible `<pre>` blocks. Never add Etsy Access mutations or data to this view.

- [ ] **Step 4: Run focused and full verification**

Run in this order and save concise results in the PROGRESS handoff notes:

```powershell
npm run db:generate
npx prisma validate
npm run test:server:run -- server/__tests__/settings/contracts.test.ts server/__tests__/settings/router.test.ts server/__tests__/suppliers/router.test.ts
npm run test:client:run -- src/__tests__/pages/Settings.test.tsx src/__tests__/components/SettingsSectionNav.test.tsx src/__tests__/components/PostageTiersSection.test.tsx src/__tests__/components/PackagingOverheadSection.test.tsx src/__tests__/components/SupplierManagementSection.test.tsx src/__tests__/components/SupplierProductsModal.test.tsx src/__tests__/components/AuditHistorySection.test.tsx src/__tests__/lib/api/settings.test.ts src/__tests__/lib/api/suppliers.test.ts
npx tsc -p server/tsconfig.json --noEmit --rootDir .
npx tsc -p tsconfig.json --noEmit
npx eslint server/features/settings/router.ts server/features/suppliers/router.ts server/lib/settingsAudit.ts contracts/domain/settings.ts contracts/routes/settings.ts contracts/routes/suppliers.ts src/features/settings/pages/SettingsPage.tsx src/features/settings/components/SettingsSectionNav.tsx src/features/settings/components/PostageTiersSection.tsx src/features/settings/components/PackagingOverheadSection.tsx src/features/settings/components/SupplierManagementSection.tsx src/features/settings/components/AuditHistorySection.tsx src/lib/api/settings.ts src/lib/api/suppliers.ts
npm run build
npm run test:server:run
npm run test:client:run
rtk git diff --check
```

Expected: Prisma generation/validation, focused suites, both project type-checks, touched-file ESLint, production build, full server suite, full client suite, and diff check PASS. If a pre-existing unrelated failure remains, record its exact file and error separately and prove every touched-file/focused check passes.

- [ ] **Step 5: Update progress and handoff notes**

Change the Task 1 Active Work Log row to `Done`. Add a dated handoff note containing:

- Root cause resolved: archived unique values are restored/updated instead of inserted.
- Editable fields and archive/restore surfaces shipped.
- Audit migration name and atomicity guarantee.
- Etsy Access Management remained untouched.
- Exact verification totals and any proven pre-existing failures.
- Production rollout note: apply the Prisma migration before deploying the server.

- [ ] **Step 6: Commit Task 8**

```powershell
git add src/features/settings/components/AuditHistorySection.tsx src/features/settings/pages/SettingsPage.tsx src/__tests__/components/AuditHistorySection.test.tsx src/__tests__/pages/Settings.test.tsx docs/PROGRESS.md
git commit -m "feat: add settings audit history"
```

- [ ] **Step 7: Run independent review and fresh verification**

Dispatch a fresh reviewer that did not author the implementation to check the approved design, this plan, the full branch diff, migration safety, conflict semantics, audit atomicity, untouched Etsy Access scope, and regression coverage. Resume the original implementer for any fixes, then dispatch a fresh verifier to rerun the exact Task 8 verification commands against the final candidate commit.
