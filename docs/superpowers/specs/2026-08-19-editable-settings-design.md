# Editable Settings Design

**Date:** 2026-08-19  
**Status:** Approved for implementation planning

## Summary

Redesign only the editable configuration area within the existing **Settings & More** page. Keep the page title and its links to Sales, Analytics, Shopping List, Categories, Products, and Expenses unchanged.

The configuration area will use section navigation and make postage tiers, packaging overheads, and supplier names fully editable. Existing Etsy fee editing and Etsy account controls remain available. Postage and supplier creation will recover cleanly from conflicts with archived records, and setting changes will be recorded in an audit log.

## Problem

`PostageTier.etsyCharge` is unique across active and archived rows. Removing a postage tier currently sets `isActive` to `false`, but adding the same charge later attempts to insert a second row. The database correctly rejects that insert and the API returns HTTP 409. The Settings UI also exposes Add and Remove controls but no Edit or Restore controls, despite update APIs already existing.

Supplier names have the same underlying risk: they are globally unique and removal is a soft archive, so recreating an archived name can conflict.

Packaging overheads can already be updated through the API, but the UI exposes only Add and Remove.

## Scope

### In scope

- Preserve the existing **Settings & More** page heading and navigation cards.
- Add section navigation to the editable configuration area only.
- Make postage tier charge, actual cost, and optional label editable.
- Make packaging overhead name and per-order cost editable.
- Make supplier name editable without changing the existing product-assignment modal.
- Preserve the current versioned Etsy fee workflow.
- Preserve the current Etsy account connect, set-default, and remove controls.
- Archive and restore postage tiers, packaging overheads, and suppliers.
- Create an audit record for creates, updates, archives, restores, and new Etsy fee versions.
- Show recent setting changes in an Audit History section.

### Out of scope

- Redesigning or removing the existing **More** navigation cards.
- Changing Sales, Analytics, Shopping List, Categories, Products, or Expenses pages.
- Editing Etsy account credentials or changing Etsy authentication.
- Recalculating historical sales when a setting changes.
- Hard-deleting settings or their audit records.
- Adding multi-user approval or rollback workflows.

## User Experience

### Section navigation

The configuration area contains these sections:

1. Postage
2. Packaging
3. Suppliers
4. Etsy Fees
5. Etsy Accounts
6. Audit History

Desktop uses a compact left-hand section list with one panel visible at a time. Mobile uses horizontally scrolling section tabs. The selected section is stored in the URL so refresh and browser navigation preserve it.

### Editable lists

Postage, Packaging, and Suppliers use the same interaction pattern:

- Rows display their current values with **Edit** and **Archive** actions.
- **Edit** changes only that row into an inline form.
- The inline form offers **Save** and **Cancel**.
- The affected row is disabled while its request is in progress; unrelated rows and sections remain usable.
- The existing add form remains below the active list.
- A collapsed **Archived** area lists inactive records with a **Restore** action.
- Validation appears beside the relevant field. Request failures remain visible within the current section.

The Suppliers section retains its existing **Products** action and product-assignment modal.

### Etsy sections

Etsy fee editing continues to create a new effective configuration and close the previous configuration. It does not mutate rates that may explain historical calculations.

Etsy account controls retain their current connect, set-default, and remove behavior.

### Audit History

Audit History shows the latest 100 redesigned-setting changes in reverse chronological order. Each row shows the timestamp, setting type, display label, and action. A row can be expanded to show the recorded before and after values. This is a traceability view, not an undo feature.

## Data Behavior

### Postage create-or-update

`etsyCharge` remains the stable unique business key for postage tiers.

When the Add form is submitted:

- If no row has that charge, create an active tier and return `created`.
- If an active row already has that charge, update its actual cost and label and return `updated`.
- If an archived row has that charge, update its actual cost and label, reactivate it, and return `restored`.

The operation must query active and archived rows and run atomically. A concurrent uniqueness race must re-read the winning row and apply the requested update rather than exposing a raw database conflict.

Editing an existing tier may change every displayed field. If the new charge belongs to a different tier, saving is rejected with HTTP 409 and a clear field-level message. The two tier identities are not silently merged.

### Suppliers

Supplier Add follows the same create-or-update rule using its globally unique name:

- A new name creates a supplier.
- An existing active name resolves to the existing supplier without creating a duplicate.
- An archived name restores that supplier, preserving its existing product relationships.

Editing a supplier to another supplier's name returns HTTP 409 instead of merging supplier relationships.

### Packaging overheads

Packaging overheads have no unique database key beyond their ID. Add always creates a new overhead. Edit updates the selected record. Archive and Restore change its active state. Existing `effectiveFrom` and `effectiveTo` fields remain coherent: archive sets `effectiveTo`, and restore clears it.

### Archive and restore

Archive never deletes a row. Active-list endpoints hide archived rows by default but accept an explicit `includeArchived` query for the Settings editor. Restore reactivates the same ID, preserving references and history.

## Audit Model

Add a `SettingsAuditLog` model with:

- `id`: CUID primary key
- `settingType`: `POSTAGE_TIER`, `PACKAGING_OVERHEAD`, `SUPPLIER`, or `ETSY_FEE_CONFIG`
- `settingId`: ID of the changed record
- `action`: `CREATE`, `UPDATE`, `ARCHIVE`, or `RESTORE`
- `before`: nullable JSON snapshot
- `after`: nullable JSON snapshot
- `createdAt`: timestamp

The application is single-user, so this design does not add an actor identity. Audit snapshots contain only setting fields needed to explain the change; they never contain Etsy tokens or credentials.

Each setting mutation and its audit insert run in the same Prisma transaction. A failed audit insert fails the mutation, and a failed mutation writes no audit entry.

## API and Contracts

Shared Zod contracts remain the source of truth for request and response validation.

Required API capabilities:

- List active and archived postage tiers, packaging overheads, and suppliers for the editor.
- Create-or-update postage tiers with an outcome of `created`, `updated`, or `restored`.
- Update, archive, and restore a specific postage tier.
- Update, archive, and restore a specific packaging overhead.
- Create-or-restore suppliers, plus update, archive, and restore a specific supplier.
- List the latest 100 audit entries.

Create-or-update responses include both the resulting item and the outcome so the UI can show an accurate confirmation. Existing unrelated consumers retain active-only list behavior by default.

Validation and conflict handling must distinguish:

- `400` for malformed or invalid values.
- `404` for an unknown setting ID.
- `409` when an Edit attempts to take a unique key owned by a different record.
- `500` only for unexpected failures.

## Client Architecture

`SettingsPage` continues to own the existing More links and composes the editable configuration area. The section-navigation shell owns the selected section only. Each section component owns its row editing, per-row pending state, validation messages, and reload behavior so one save does not block unrelated controls.

Reusable interaction primitives should be limited to behavior genuinely shared by the three list editors, such as section navigation and archived-list presentation. Domain-specific forms and contracts remain separate to preserve type safety and clear boundaries.

## Error Handling and Concurrency

- Currency values are validated as finite, non-negative values with the existing database precision.
- Names are trimmed and must remain non-empty.
- Postage labels are optional and trimmed; an empty label is stored as `null`.
- Archive and Restore are idempotent from the user's perspective.
- A create uniqueness race is recovered as create-or-update.
- Edit conflicts identify the field and value already in use.
- The UI retains unsaved row values after a recoverable request error.
- Reload failures do not erase the last successfully displayed settings.

## Testing Strategy

Implementation follows test-driven development.

Server coverage will prove:

- The original archived-£5 reproduction restores and updates one row without returning 409.
- Adding an active existing postage charge updates the existing row.
- Concurrent same-charge adds converge on one updated active tier.
- Editing a tier to a charge owned by another tier returns a clear 409.
- Archived supplier names restore the original supplier and preserve product relationships.
- Packaging and supplier edit/archive/restore behavior.
- Audit entries contain correct before/after snapshots and are atomic with mutations.
- Active-only consumers do not receive archived records unless explicitly requested.

Client coverage will prove:

- Existing Settings & More links remain present and unchanged.
- Section selection works on desktop and mobile markup and is URL-preserved.
- Postage, Packaging, and Supplier rows support Edit, Save, Cancel, Archive, and Restore.
- Per-row pending state does not disable unrelated rows.
- Create-or-update outcomes and conflicts are communicated clearly.
- Etsy fee versioning, supplier product management, and Etsy account controls remain available.
- Audit history renders and expands before/after values without exposing credentials.

Verification includes focused tests, client and server TypeScript checks, touched-file ESLint, the production build, and the relevant full test suites.

## Migration and Existing Data

The migration adds only the audit table and indexes needed for recent-history queries. Existing postage tiers, packaging overheads, suppliers, fee configurations, and historical sales are not rewritten.

The manually repaired postage row remains valid. After deployment, future same-charge Add operations use the create-or-update behavior and no longer require direct database intervention.
