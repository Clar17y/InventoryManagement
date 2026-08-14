import { describe, expect, it } from 'vitest'
import {
  buildEtsySaleResolution,
  receiptIdentity,
  type EtsySaleResolutionSnapshot,
} from '../../lib/sales/etsyResolutionCalculations'

const UPDATED_AT = '2026-08-14T12:00:00.000Z'

function snapshot(overrides: Partial<EtsySaleResolutionSnapshot> = {}): EtsySaleResolutionSnapshot {
  const base: EtsySaleResolutionSnapshot = {
    id: 'sale-1',
    saleChannel: 'etsy',
    etsyOrderId: '4137418052',
    grossRevenuePence: 3_000,
    postageChargedPence: 500,
    postageCostPence: 250,
    transactionFeePence: 60,
    postageTransactionFeePence: 10,
    regulatoryFeePence: 25,
    processingFeePence: 40,
    vatOnProcessingFeePence: 8,
    listingFeePence: 20,
    offsiteAdsAttributed: true,
    offsiteAdsFeePence: 100,
    vatOnOffsiteAdsFeePence: 20,
    etsyFeesPence: 283,
    packagingOverheadPence: 30,
    netRevenuePence: 3_187,
    totalCostPence: 1_100,
    marginPence: 1_837,
    etsyPaymentGrossPence: null,
    etsyPaymentFeesPence: null,
    etsyPaymentNetPence: null,
    status: 'PENDING',
    source: null,
    reconciledAt: null,
    statementImportId: null,
    manualResolutionNote: null,
    updatedAt: UPDATED_AT,
  }
  return { ...base, ...overrides }
}

function resolution(
  value:
    | { type: 'reclassify'; channel: 'direct' | 'fair'; note?: string }
    | { type: 'correct_receipt_id'; etsyOrderId: string; note?: string }
    | {
      type: 'manual_verify'
      etsyOrderId?: string
      attributed: boolean
      offsiteAdsFeePence: number
      vatOnOffsiteAdsFeePence: number
      note?: string
    },
) {
  return value
}

describe('receiptIdentity', () => {
  it('accepts only an exact numeric receipt or one immediate numeric suffix', () => {
    expect(receiptIdentity('4137418052')).toEqual({ baseId: '4137418052', suffix: '' })
    expect(receiptIdentity('4137418052-1')).toEqual({ baseId: '4137418052', suffix: '-1' })
    expect(receiptIdentity('4137418052-01')).toEqual({ baseId: '4137418052', suffix: '-01' })
    expect(receiptIdentity('4137418052-1-extra')).toBeNull()
    expect(receiptIdentity('x-4137418052')).toBeNull()
    expect(receiptIdentity('')).toBeNull()
  })
})

describe('buildEtsySaleResolution', () => {
  const DATABASE_MAX_PENCE = 9_999_999_999

  it('reclassifies a complete placeholder receipt group and recomputes only dependent money', () => {
    const currentGroup = [
      snapshot({ id: 'sale-2', etsyOrderId: '1-1', grossRevenuePence: 2_000, postageChargedPence: 200, postageCostPence: 100, packagingOverheadPence: 25, totalCostPence: 700 }),
      snapshot({ id: 'sale-1', etsyOrderId: '1', grossRevenuePence: 3_000, postageChargedPence: 500, postageCostPence: 250, packagingOverheadPence: 30, totalCostPence: 1_100 }),
      snapshot({ id: 'sale-3', etsyOrderId: '1-2', grossRevenuePence: 1_000, postageChargedPence: 0, postageCostPence: 0, packagingOverheadPence: 10, totalCostPence: 300 }),
    ]
    const before = structuredClone(currentGroup)

    const result = buildEtsySaleResolution(
      'sale-1',
      resolution({ type: 'reclassify', channel: 'direct', note: 'In-person order' }),
      currentGroup,
      [],
    )

    expect(result.baseReceiptId).toBe('1')
    expect(result.proposals).toHaveLength(3)
    expect(result.proposals.map((proposal) => proposal.saleId)).toEqual(['sale-1', 'sale-2', 'sale-3'])
    expect(result.proposals).toEqual(expect.arrayContaining([
      expect.objectContaining({
        saleId: 'sale-1',
        expectedUpdatedAt: UPDATED_AT,
        data: expect.objectContaining({
          saleChannel: 'direct',
          etsyOrderId: null,
          transactionFeePence: 0,
          postageTransactionFeePence: 0,
          regulatoryFeePence: 0,
          processingFeePence: 0,
          vatOnProcessingFeePence: 0,
          listingFeePence: 0,
          offsiteAdsAttributed: null,
          offsiteAdsFeePence: null,
          vatOnOffsiteAdsFeePence: null,
          etsyFeesPence: 0,
          etsyPaymentGrossPence: null,
          etsyPaymentFeesPence: null,
          etsyPaymentNetPence: null,
          status: 'NOT_APPLICABLE',
          source: 'MANUAL',
          reconciledAt: 'now',
          statementImportId: null,
          manualResolutionNote: 'In-person order',
          netRevenuePence: 3_470,
          marginPence: 2_120,
        }),
      }),
      expect.objectContaining({
        saleId: 'sale-2',
        data: expect.objectContaining({
          netRevenuePence: 2_175,
          marginPence: 1_375,
        }),
      }),
      expect.objectContaining({
        saleId: 'sale-3',
        data: expect.objectContaining({
          netRevenuePence: 990,
          marginPence: 690,
        }),
      }),
    ]))
    expect(result.warnings.join(' ')).toMatch(/Etsy fees and evidence/i)
    expect(currentGroup).toEqual(before)
  })

  it('corrects a grouped receipt ID while preserving money and clearing evidence', () => {
    const currentGroup = [
      snapshot({ id: 'sale-b', etsyOrderId: '1-1', status: 'MANUAL_REVIEW', offsiteAdsAttributed: null, offsiteAdsFeePence: null, vatOnOffsiteAdsFeePence: null }),
      snapshot({ id: 'sale-a', etsyOrderId: '1', status: 'MANUAL_REVIEW', offsiteAdsAttributed: null, offsiteAdsFeePence: null, vatOnOffsiteAdsFeePence: null }),
    ]

    const result = buildEtsySaleResolution(
      'sale-a',
      resolution({ type: 'correct_receipt_id', etsyOrderId: '4137418052', note: 'Matched Etsy export' }),
      currentGroup,
      [],
    )

    expect(result.baseReceiptId).toBe('1')
    expect(result.proposals.map((proposal) => [proposal.saleId, proposal.data.etsyOrderId])).toEqual([
      ['sale-a', '4137418052'],
      ['sale-b', '4137418052-1'],
    ])
    for (const proposal of result.proposals) {
      const current = currentGroup.find((sale) => sale.id === proposal.saleId)!
      expect(proposal.data).toMatchObject({
        saleChannel: 'etsy',
        transactionFeePence: current.transactionFeePence,
        postageTransactionFeePence: current.postageTransactionFeePence,
        regulatoryFeePence: current.regulatoryFeePence,
        processingFeePence: current.processingFeePence,
        vatOnProcessingFeePence: current.vatOnProcessingFeePence,
        listingFeePence: current.listingFeePence,
        offsiteAdsAttributed: null,
        offsiteAdsFeePence: null,
        vatOnOffsiteAdsFeePence: null,
        etsyFeesPence: current.etsyFeesPence,
        netRevenuePence: current.netRevenuePence,
        marginPence: current.marginPence,
        etsyPaymentGrossPence: null,
        etsyPaymentFeesPence: null,
        etsyPaymentNetPence: null,
        status: 'PENDING',
        source: null,
        reconciledAt: null,
        statementImportId: null,
        manualResolutionNote: 'Matched Etsy export',
      })
    }
    expect(result.warnings.join(' ')).toMatch(/clears/i)
  })

  it.each([
    ['exact collision', '4137418052'],
    ['immediate suffix collision', '4137418052-1'],
  ])('rejects corrected IDs with a %s', (_label, conflictingOrderId) => {
    expect(() => buildEtsySaleResolution(
      'sale-1',
      resolution({ type: 'correct_receipt_id', etsyOrderId: '4137418052' }),
      [snapshot({ etsyOrderId: '1' })],
      [snapshot({ id: 'conflict', etsyOrderId: conflictingOrderId })],
    )).toThrow(/collision/i)
  })

  it.each([
    ['Offsite fee itemization', { offsiteAdsFeePence: 1 }],
    ['Offsite attribution', { offsiteAdsAttributed: false }],
    ['Payment aggregate', { etsyPaymentFeesPence: 1 }],
    ['statement link', { statementImportId: 'statement-1' }],
    ['authoritative source', { source: 'ETSY_PAYMENT_API' as const }],
  ])('rejects ID-only correction when %s exists', (_label, override) => {
    expect(() => buildEtsySaleResolution(
      'sale-1',
      resolution({ type: 'correct_receipt_id', etsyOrderId: '4137418052' }),
      [snapshot({ etsyOrderId: '1', ...override })],
      [],
    )).toThrow(/evidence|authoritative|manual verification/i)
  })

  it('replaces final manual fee and VAT balances and preserves penny-exact receipt totals', () => {
    const currentGroup = [
      snapshot({ id: 'sale-a', etsyOrderId: '4137418052', grossRevenuePence: 3_000, offsiteAdsFeePence: 300, vatOnOffsiteAdsFeePence: 60, etsyFeesPence: 500, netRevenuePence: 3_000, marginPence: 1_650 }),
      snapshot({ id: 'sale-b', etsyOrderId: '4137418052-1', grossRevenuePence: 2_000, offsiteAdsFeePence: 200, vatOnOffsiteAdsFeePence: 40, etsyFeesPence: 400, netRevenuePence: 1_800, marginPence: 1_200 }),
      snapshot({ id: 'sale-c', etsyOrderId: '4137418052-2', grossRevenuePence: 1_000, offsiteAdsFeePence: 100, vatOnOffsiteAdsFeePence: 20, etsyFeesPence: 300, netRevenuePence: 800, marginPence: 500 }),
    ]

    const result = buildEtsySaleResolution(
      'sale-a',
      resolution({
        type: 'manual_verify',
        attributed: true,
        offsiteAdsFeePence: 480,
        vatOnOffsiteAdsFeePence: 96,
        note: 'Checked Etsy finances',
      }),
      currentGroup,
      [],
    )

    const byId = new Map(result.proposals.map((proposal) => [proposal.saleId, proposal]))
    expect([...byId.values()].map((proposal) => proposal.data.offsiteAdsFeePence)).toEqual([240, 160, 80])
    expect([...byId.values()].map((proposal) => proposal.data.vatOnOffsiteAdsFeePence)).toEqual([48, 32, 16])
    expect([...byId.values()].reduce((sum, proposal) => sum + (proposal.data.offsiteAdsFeePence ?? 0), 0)).toBe(480)
    expect([...byId.values()].reduce((sum, proposal) => sum + (proposal.data.vatOnOffsiteAdsFeePence ?? 0), 0)).toBe(96)

    expect(byId.get('sale-a')?.data).toMatchObject({
      etsyFeesPence: 428,
      netRevenuePence: 3_072,
      marginPence: 1_722,
      status: 'MANUALLY_VERIFIED',
      source: 'MANUAL',
      reconciledAt: 'now',
      etsyPaymentGrossPence: null,
      etsyPaymentFeesPence: null,
      etsyPaymentNetPence: null,
      statementImportId: null,
      manualResolutionNote: 'Checked Etsy finances',
    })
    expect(byId.get('sale-b')?.data).toMatchObject({ etsyFeesPence: 352, netRevenuePence: 1_848, marginPence: 1_248 })
    expect(byId.get('sale-c')?.data).toMatchObject({ etsyFeesPence: 276, netRevenuePence: 824, marginPence: 524 })
  })

  it('writes zero Offsite components for a not-attributed manual verification', () => {
    const result = buildEtsySaleResolution(
      'sale-1',
      resolution({ type: 'manual_verify', attributed: false, offsiteAdsFeePence: 0, vatOnOffsiteAdsFeePence: 0 }),
      [snapshot({ etsyOrderId: '4137418052', etsyFeesPence: 283, netRevenuePence: 3_187, marginPence: 1_837 })],
      [],
    )

    expect(result.proposals[0]?.data).toMatchObject({
      offsiteAdsAttributed: false,
      offsiteAdsFeePence: 0,
      vatOnOffsiteAdsFeePence: 0,
      etsyFeesPence: 163,
      netRevenuePence: 3_307,
      marginPence: 1_957,
      status: 'MANUALLY_VERIFIED',
      source: 'MANUAL',
    })
  })

  it('allocates a one-penny remainder by stable Sale ID for equal gross weights', () => {
    const currentGroup = [
      snapshot({ id: 'sale-c', etsyOrderId: '4137418052-2', grossRevenuePence: 1_000, offsiteAdsFeePence: 0, vatOnOffsiteAdsFeePence: 0, etsyFeesPence: 100 }),
      snapshot({ id: 'sale-a', etsyOrderId: '4137418052', grossRevenuePence: 1_000, offsiteAdsFeePence: 0, vatOnOffsiteAdsFeePence: 0, etsyFeesPence: 100 }),
      snapshot({ id: 'sale-b', etsyOrderId: '4137418052-1', grossRevenuePence: 1_000, offsiteAdsFeePence: 0, vatOnOffsiteAdsFeePence: 0, etsyFeesPence: 100 }),
    ]
    const result = buildEtsySaleResolution(
      'sale-a',
      resolution({ type: 'manual_verify', attributed: true, offsiteAdsFeePence: 1, vatOnOffsiteAdsFeePence: 0 }),
      currentGroup,
      [],
    )

    expect(new Map(result.proposals.map((proposal) => [proposal.saleId, proposal.data.offsiteAdsFeePence]))).toEqual(new Map([
      ['sale-a', 1],
      ['sale-b', 0],
      ['sale-c', 0],
    ]))
  })

  it('rejects missing targets, mixed groups, implausible manual IDs, and immutable rows', () => {
    expect(() => buildEtsySaleResolution(
      'missing',
      resolution({ type: 'reclassify', channel: 'fair' }),
      [snapshot({ id: 'sale-1', etsyOrderId: '1' })],
      [],
    )).toThrow(/target/i)

    expect(() => buildEtsySaleResolution(
      'sale-1',
      resolution({ type: 'reclassify', channel: 'fair' }),
      [snapshot({ id: 'sale-1', etsyOrderId: '4137418052' }), snapshot({ id: 'sale-2', etsyOrderId: '4137418053' })],
      [],
    )).toThrow(/base receipt|group/i)

    expect(() => buildEtsySaleResolution(
      'sale-1',
      resolution({ type: 'manual_verify', attributed: true, offsiteAdsFeePence: 1, vatOnOffsiteAdsFeePence: 0 }),
      [snapshot({ id: 'sale-1', etsyOrderId: '1' })],
      [],
    )).toThrow(/plausible|receipt ID/i)

    expect(() => buildEtsySaleResolution(
      'sale-1',
      { type: 'manual_verify', etsyOrderId: '1', attributed: true, offsiteAdsFeePence: 1, vatOnOffsiteAdsFeePence: 0 } as never,
      [snapshot({ id: 'sale-1', etsyOrderId: '4137418052' })],
      [],
    )).toThrow(/plausible|receipt ID/i)

    for (const status of ['STATEMENT_VERIFIED', 'MANUALLY_VERIFIED'] as const) {
      expect(() => buildEtsySaleResolution(
        'sale-1',
        resolution({ type: 'reclassify', channel: 'direct' }),
        [snapshot({ id: 'sale-1', status })],
        [],
      )).toThrow(/immutable|verified/i)
    }
  })

  it('rejects unsafe pence inputs and derived values before persistence', () => {
    const maxSafePence = Number.MAX_SAFE_INTEGER

    expect(() => buildEtsySaleResolution(
      'sale-1',
      resolution({ type: 'reclassify', channel: 'fair' }),
      [snapshot({ grossRevenuePence: maxSafePence + 1 })],
      [],
    )).toThrow(/integer|safe|pence/i)

    expect(() => buildEtsySaleResolution(
      'sale-1',
      resolution({ type: 'reclassify', channel: 'fair' }),
      [snapshot({ grossRevenuePence: maxSafePence, postageChargedPence: maxSafePence })],
      [],
    )).toThrow(/safe|range/i)
  })

  it('accepts the Decimal(10,2) pence maximum and rejects maximum-plus-one inputs', () => {
    const result = buildEtsySaleResolution(
      'sale-1',
      resolution({
        type: 'manual_verify',
        attributed: true,
        offsiteAdsFeePence: DATABASE_MAX_PENCE,
        vatOnOffsiteAdsFeePence: 0,
      }),
      [snapshot({
        grossRevenuePence: 3_000,
        offsiteAdsFeePence: 0,
        vatOnOffsiteAdsFeePence: 0,
        etsyFeesPence: 0,
        netRevenuePence: 0,
        marginPence: 0,
      })],
      [],
    )

    expect(result.proposals[0]?.data).toMatchObject({
      offsiteAdsFeePence: DATABASE_MAX_PENCE,
      etsyFeesPence: DATABASE_MAX_PENCE,
      netRevenuePence: -DATABASE_MAX_PENCE,
      marginPence: -DATABASE_MAX_PENCE,
    })

    expect(() => buildEtsySaleResolution(
      'sale-1',
      resolution({
        type: 'manual_verify',
        attributed: true,
        offsiteAdsFeePence: DATABASE_MAX_PENCE + 1,
        vatOnOffsiteAdsFeePence: 0,
      }),
      [snapshot({ offsiteAdsFeePence: 0, vatOnOffsiteAdsFeePence: 0, etsyFeesPence: 0 })],
      [],
    )).toThrow(/database|Decimal|pence|range/i)
  })

  it('rejects Decimal(10,2) maximum-plus-one snapshot inputs and derived net or margin overflow', () => {
    expect(() => buildEtsySaleResolution(
      'sale-1',
      resolution({ type: 'reclassify', channel: 'fair' }),
      [snapshot({ grossRevenuePence: DATABASE_MAX_PENCE + 1 })],
      [],
    )).toThrow(/database|Decimal|pence|range/i)

    expect(() => buildEtsySaleResolution(
      'sale-1',
      resolution({ type: 'reclassify', channel: 'fair' }),
      [snapshot({ grossRevenuePence: DATABASE_MAX_PENCE, postageChargedPence: 1, packagingOverheadPence: 0 })],
      [],
    )).toThrow(/database|Decimal|pence|range/i)

    expect(() => buildEtsySaleResolution(
      'sale-1',
      resolution({ type: 'manual_verify', attributed: false, offsiteAdsFeePence: 0, vatOnOffsiteAdsFeePence: 0 }),
      [snapshot({
        offsiteAdsFeePence: 1,
        vatOnOffsiteAdsFeePence: 0,
        etsyFeesPence: 1,
        netRevenuePence: DATABASE_MAX_PENCE,
        marginPence: DATABASE_MAX_PENCE,
      })],
      [],
    )).toThrow(/database|Decimal|pence|range/i)
  })
})
