# Etsy Fee Final Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the five Important correctness and responsiveness findings from the final review of Etsy Offsite Ads fee reconciliation.

**Architecture:** Keep statements authoritative and penny exact, extend change detection to all persisted evidence, validate manual Etsy IDs at the status boundary, and decouple best-effort Payment reconciliation from the committed order-import response. Each behavior is protected by a regression test that fails against commit `1995861` before the minimal production change is made.

**Tech Stack:** TypeScript 5.6, Vitest, Express, Zod, Prisma 6, React contracts.

## Global Constraints

- Do not access Etsy or a production database.
- Do not apply migrations or historical statements.
- Keep `ETSY_PAYMENT_FEES_VALIDATED=false`.
- Preserve statement precedence, preview fingerprints, atomic apply, and duplicate-statement semantics.
- Preserve successful order import if best-effort Payment reconciliation fails.
- Update `docs/PROGRESS.md`, commit the fixes, run full client/server verification, and update draft PR #37 without merging it.

---

### Task 1: Preserve statement attribution and parse exact pence

**Files:**
- Modify: `server/lib/etsy/fees/statementParser.ts`
- Test: `server/__tests__/etsy/statementParser.test.ts`

**Interfaces:**
- Consumes: Etsy monthly statement CSV text.
- Produces: `ParsedEtsyStatement` with attributed Offsite evidence even when the export lacks a separate Sale row; numeric cells are exact integer pence or rejected.

- [ ] Add a regression where an Offsite fee row (and optional VAT row) with an order ID but no Sale row yields attributed evidence and a covered receipt.
- [ ] Add table-driven regressions rejecting numeric cells with more than two decimal places, including `-4.805` and `0.009`.
- [ ] Run the focused parser suite and confirm the new tests fail for the expected current behaviors.
- [ ] Make Offsite fee evidence establish coverage for an attributed receipt while retaining Sale-row coverage as the only basis for explicit non-attribution.
- [ ] Replace floating-point conversion with sign-aware string parsing of comma-separated decimal values, accepting only digits plus zero-to-two fractional digits and enforcing the safe-integer pence range.
- [ ] Run parser tests, server TypeScript, and touched-file lint; commit.

### Task 2: Persist zero-fee attribution changes and classify manual IDs

**Files:**
- Modify: `server/lib/etsy/fees/reconciliationService.ts`
- Modify: `server/features/sales/router.ts`
- Test: `server/__tests__/etsy/feeReconciliationService.test.ts`
- Test: `server/__tests__/etsy/orderImport.test.ts`

**Interfaces:**
- Consumes: `SaleFeeSnapshot`, `SaleFeeProposal`, manual sale channel/order ID.
- Produces: changed proposals whenever persisted attribution changes; `PENDING` only for a nonempty digits-only Etsy receipt ID.

- [ ] Add a statement reconciliation regression where a `STATEMENT_VERIFIED` zero-fee sale changes `offsiteAdsAttributed` from `false` to `true` and is written.
- [ ] Add status table cases for trimmed numeric IDs, whitespace-only IDs, suffix IDs, alphabetic IDs, and non-Etsy channels.
- [ ] Run focused suites and confirm expected failures.
- [ ] Compare normalized snapshot attribution with proposal attribution in `proposalChanged`.
- [ ] Normalize manual Etsy IDs at the status boundary and return `PENDING` only for `^[0-9]+$`; otherwise return `MANUAL_REVIEW`.
- [ ] Run focused tests, server TypeScript, and touched-file lint; commit.

### Task 3: Return imports before best-effort Payment reconciliation

**Files:**
- Modify: `server/lib/etsy/sync/orders.ts`
- Modify contracts/client/UI only if the existing response contract requires it after root-cause analysis.
- Test: `server/__tests__/etsy/orderImport.test.ts`
- Test client contracts/UI only if their observable contract changes.

**Interfaces:**
- Consumes: a committed imported sale and receipt ID.
- Produces: an import response that returns promptly with a safe `PENDING` reconciliation status; best-effort reconciliation is scheduled after commit and cannot reject or delay the import response.

- [ ] Add deferred-promise regressions proving single and bulk import results resolve without waiting for `getPaymentsForReceipt`.
- [ ] Confirm both regressions fail because the current import awaits Payment reconciliation.
- [ ] Add a small injected/background scheduler boundary that catches/logs reconciliation errors and begins only after the sale transaction commits.
- [ ] Return the committed sale with `feeReconciliation: { status: 'PENDING' }`; let later summary/statement reconciliation show authoritative eventual state.
- [ ] Ensure tests drain scheduled work so there are no unhandled rejections; preserve import success when lookup/update fails.
- [ ] Run order import and affected client contract/UI tests, server/client TypeScript, and touched-file lint; commit.

### Task 4: Review, verification, and PR update

**Files:**
- Modify: `docs/PROGRESS.md`
- Modify: `.superpowers/sdd/2026-08-12-etsy-fee-review-fixes/*` reports/ledger.

**Interfaces:**
- Consumes: Tasks 1–3 commits.
- Produces: reviewed, verified, pushed branch and updated draft PR #37.

- [ ] Run task-scoped reviews and resolve all Critical/Important findings.
- [ ] Run a fresh whole-branch review against `main`.
- [ ] Run full server tests, full client tests with safe example env, server/client TypeScript, build, focused lint, and `git diff --check`.
- [ ] Mark the PROGRESS entry Done and record evidence.
- [ ] Push the branch and update PR #37; do not merge or mark ready unless review is clean.
