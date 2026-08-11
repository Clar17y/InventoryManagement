import type { SaleFeeSnapshot } from '../../lib/etsy/fees/types'
import {
  StatementReconciliationConflictError,
  type FeeReconciliationRepository,
  type FeeReconciliationTransaction,
  type SavedStatementImport,
} from '../../lib/etsy/fees/reconciliationService'
export const attributedCsv = `Date,Type,Description,Info,Currency,Amount,Fees & Taxes,Net
31 Jul 2025,Sale,Payment for Order #4137418052,,GBP,39.99,-4.00,35.99
31 Jul 2025,Marketing,Marketing Fee for sale made through Offsite Ads Order #4137418052 12% of order total,,GBP,0,-4.80,-4.80
31 Jul 2025,Tax,VAT: Offsite Ads fee Order #4137418052,,GBP,0,-0.96,-0.96`

export function sale(
  overrides: Partial<SaleFeeSnapshot> & Pick<SaleFeeSnapshot, 'id' | 'etsyOrderId'>,
): SaleFeeSnapshot {
  return {
    grossRevenuePence: 3999,
    etsyFeesPence: 400,
    netRevenuePence: 3599,
    marginPence: 2199,
    previousOffsiteAdsFeePence: null,
    previousVatOnOffsiteAdsFeePence: null,
    status: 'PENDING',
    updatedAt: '2025-07-31T12:00:00.000Z',
    ...overrides,
  }
}

function cloneSale(snapshot: SaleFeeSnapshot): SaleFeeSnapshot {
  return { ...snapshot }
}

export interface FeeReconciliationDbFixture extends FeeReconciliationRepository {
  sales: SaleFeeSnapshot[]
  readonly imports: SavedStatementImport[]
  readonly writeCount: number
}

/**
 * A deterministic repository fixture with copy-on-write transactions. It is
 * intentionally kept in the test tree so service tests never need a Prisma
 * client or a real database connection.
 */
export function createFeeDbFixture(initial: { sales: SaleFeeSnapshot[] }): FeeReconciliationDbFixture {
  let sales = initial.sales.map(cloneSale)
  let imports: SavedStatementImport[] = []
  let writeCount = 0
  let nextImportId = 1

  const fixture: FeeReconciliationDbFixture = {
    get sales() {
      return sales
    },
    set sales(nextSales: SaleFeeSnapshot[]) {
      sales = nextSales.map(cloneSale)
    },
    get imports() {
      return imports.map((statementImport) => ({
        ...statementImport,
        summary: { ...statementImport.summary },
      }))
    },
    get writeCount() {
      return writeCount
    },
    async listEtsySaleSnapshots() {
      return sales.map(cloneSale)
    },
    async findStatementImportByChecksum(checksum) {
      const statementImport = imports.find((candidate) => candidate.checksum === checksum)
      return statementImport
        ? { ...statementImport, summary: { ...statementImport.summary } }
        : null
    },
    async transaction<T>(work: (tx: FeeReconciliationTransaction) => Promise<T>): Promise<T> {
      const workingSales = sales.map(cloneSale)
      const workingImports = imports.map((statementImport) => ({
        ...statementImport,
        summary: { ...statementImport.summary },
      }))
      let pendingWrites = 0

      const tx: FeeReconciliationTransaction = {
        async createStatementImport(input) {
          const created = {
            id: `statement-import-${nextImportId}`,
            checksum: input.checksum,
            summary: {
              matched: 0,
              changed: 0,
              unchanged: 0,
              unmatched: 0,
              manualReview: 0,
              attributed: 0,
              notAttributed: 0,
              oldFeesPence: 0,
              newFeesPence: 0,
              marginDeltaPence: 0,
            },
          } satisfies SavedStatementImport
          nextImportId += 1
          workingImports.push(created)
          pendingWrites += 1
          return { id: created.id }
        },
        async updateSale(id, proposal, _statementImportId, expectedUpdatedAt) {
          const index = workingSales.findIndex((snapshot) => snapshot.id === id)
          if (index < 0) throw new Error(`Unknown fixture sale ${id}`)
          const current = workingSales[index]!
          if (current.updatedAt !== expectedUpdatedAt) {
            throw new StatementReconciliationConflictError(
              `Sale ${id} changed while applying Etsy fee evidence`,
            )
          }
          workingSales[index] = {
            ...current,
            etsyFeesPence: proposal.etsyFeesPence,
            netRevenuePence: proposal.netRevenuePence,
            marginPence: proposal.marginPence,
            previousOffsiteAdsFeePence: proposal.offsiteAdsFeePence,
            previousVatOnOffsiteAdsFeePence: proposal.vatOnOffsiteAdsFeePence,
            offsiteAdsAttributed: proposal.offsiteAdsAttributed,
            etsyPaymentGrossPence: proposal.etsyPaymentGrossPence,
            etsyPaymentFeesPence: proposal.etsyPaymentFeesPence,
            etsyPaymentNetPence: proposal.etsyPaymentNetPence,
            status: proposal.status,
          }
          pendingWrites += 1
        },
        async finishStatementImport(id, summary) {
          const statementImport = workingImports.find((candidate) => candidate.id === id)
          if (!statementImport) throw new Error(`Unknown fixture statement import ${id}`)
          statementImport.summary = { ...summary }
          pendingWrites += 1
        },
      }

      const result = await work(tx)
      sales = workingSales.map(cloneSale)
      imports = workingImports.map((statementImport) => ({
        ...statementImport,
        summary: { ...statementImport.summary },
      }))
      writeCount += pendingWrites
      return result
    },
  }

  return fixture
}
