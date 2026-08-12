import type { Sale } from '../../../lib/api'
import { formatCurrency } from '../../../lib/formatting'
import { formatDate } from '../utils'

const statusLabels: Record<Sale['etsyFeeReconciliationStatus'], string> = {
  NOT_APPLICABLE: 'Not applicable',
  PENDING: 'Pending',
  PAYMENT_SYNCED: 'Payment synced',
  STATEMENT_VERIFIED: 'Statement verified',
  MANUAL_REVIEW: 'Manual review',
}

const sourceLabels: Record<NonNullable<Sale['etsyFeeReconciliationSource']>, string> = {
  ETSY_PAYMENT_API: 'Etsy Payment API',
  ETSY_STATEMENT: 'Etsy statement',
}

function formatAttribution(value: Sale['offsiteAdsAttributed']) {
  if (value === true) return 'Yes'
  if (value === false) return 'No'
  return 'Not checked'
}

export default function EtsyFeeDetails({ sale }: { sale: Sale }) {
  const status = sale.etsyFeeReconciliationStatus
  const source = sale.etsyFeeReconciliationSource

  return (
    <div className="rounded-lg border border-orange-100 bg-orange-50 p-3 text-sm">
      <h4 className="mb-2 font-medium text-gray-700">Etsy fee verification</h4>
      <div className="grid grid-cols-1 gap-1 text-gray-600 sm:grid-cols-2">
        <div>Offsite Ads: {formatAttribution(sale.offsiteAdsAttributed)}</div>
        {sale.offsiteAdsFee != null && (
          <div>Offsite Ads fee: {formatCurrency(Number(sale.offsiteAdsFee))}</div>
        )}
        {sale.vatOnOffsiteAdsFee != null && (
          <div>VAT on Offsite Ads fee: {formatCurrency(Number(sale.vatOnOffsiteAdsFee))}</div>
        )}
        <div>Status: {statusLabels[status]}</div>
        {source && <div>Source: {sourceLabels[source]}</div>}
        {sale.etsyFeeReconciledAt && <div>Reconciled: {formatDate(sale.etsyFeeReconciledAt)}</div>}
      </div>
    </div>
  )
}
