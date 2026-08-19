import { afterEach, describe, expect, it } from 'vitest';
import type { EtsyPayment, IEtsyClient } from '../../lib/etsy/types';
import {
  normalizeReceiptPayments,
} from '../../lib/etsy/fees/paymentNormalizer';
import {
  applyPaymentReconciliation,
  previewPaymentReconciliation,
  PaymentReconciliationConflictError,
  type PaymentReconciliationDependencies,
} from '../../lib/etsy/fees/paymentReconciliation';
import { reconcileImportedPaymentEvidence } from '../../lib/etsy/fees/reconciliationService';
import type { NormalizedOrderEvidence } from '../../lib/etsy/fees/types';
import { createFeeDbFixture, sale } from './feeTestHelpers';

const paymentFixture: EtsyPayment = {
  payment_id: 9001,
  receipt_id: 4137418052,
  currency: 'GBP',
  amount_gross: { amount: 3999, divisor: 100, currency_code: 'GBP' },
  amount_fees: { amount: 976, divisor: 100, currency_code: 'GBP' },
  amount_net: { amount: 3023, divisor: 100, currency_code: 'GBP' },
  adjusted_gross: { amount: 0, divisor: 100, currency_code: 'GBP' },
  adjusted_fees: { amount: 0, divisor: 100, currency_code: 'GBP' },
  adjusted_net: { amount: 0, divisor: 100, currency_code: 'GBP' },
};

function payment(overrides: Partial<EtsyPayment> = {}): EtsyPayment {
  return {
    ...paymentFixture,
    ...overrides,
  };
}

function clientFor(paymentsByReceiptId: Map<number, EtsyPayment[]>): IEtsyClient {
  return {
    getPaymentsForReceipt: async (receiptId: number) => paymentsByReceiptId.get(receiptId) ?? [],
  } as unknown as IEtsyClient;
}

function dependencies(
  paymentsByReceiptId: Map<number, EtsyPayment[]>,
  db = createFeeDbFixture({
    sales: [sale({ id: 's1', etsyOrderId: '4137418052' })],
  }),
): PaymentReconciliationDependencies & { db: typeof db } {
  return { client: clientFor(paymentsByReceiptId), db };
}

afterEach(() => {
  delete process.env.ETSY_PAYMENT_FEES_VALIDATED;
});

describe('Etsy Payment normalizer', () => {
  it('stores aggregate values but does not authorize profit writes by default', () => {
    delete process.env.ETSY_PAYMENT_FEES_VALIDATED;

    expect(normalizeReceiptPayments('4137418052', [paymentFixture])).toMatchObject({
      evidence: {
        paymentGrossPence: 3999,
        paymentFeesPence: 976,
        paymentNetPence: 3023,
      },
      status: 'PENDING',
      canApplyCanonicalFees: false,
    });
  });

  it('accepts live zero adjustments without redundant nested currency metadata', () => {
    delete process.env.ETSY_PAYMENT_FEES_VALIDATED;
    const liveShape = {
      ...paymentFixture,
      amount_gross: { amount: 2999, divisor: 100, currency_code: 'GBP' },
      amount_fees: { amount: 400, divisor: 100, currency_code: 'GBP' },
      amount_net: { amount: 2599, divisor: 100, currency_code: 'GBP' },
      adjusted_gross: { amount: 0, divisor: 100 },
      adjusted_fees: { amount: 0, divisor: 100 },
      adjusted_net: { amount: 0, divisor: 100 },
    } as EtsyPayment;

    expect(normalizeReceiptPayments('4137418052', [liveShape])).toMatchObject({
      status: 'PENDING',
      canApplyCanonicalFees: false,
      evidence: {
        paymentGrossPence: 2999,
        paymentFeesPence: 400,
        paymentNetPence: 2599,
      },
    });
  });

  it('authorizes canonical fee writes only for the explicit true gate', () => {
    process.env.ETSY_PAYMENT_FEES_VALIDATED = 'true';

    expect(normalizeReceiptPayments('4137418052', [paymentFixture])).toMatchObject({
      status: 'PAYMENT_SYNCED',
      canApplyCanonicalFees: true,
    });
  });

  it('leaves a missing payment pending with an unknown aggregate', () => {
    expect(normalizeReceiptPayments('4137418052', [])).toMatchObject({
      status: 'PENDING',
      evidence: {
        paymentGrossPence: null,
        paymentFeesPence: null,
        paymentNetPence: null,
      },
    });
  });

  it('rejects mixed currency payments as manual review', () => {
    expect(
      normalizeReceiptPayments('4137418052', [
        paymentFixture,
        payment({
          payment_id: 9002,
          currency: 'USD',
          amount_gross: { amount: 3999, divisor: 100, currency_code: 'USD' },
          amount_fees: { amount: 976, divisor: 100, currency_code: 'USD' },
          amount_net: { amount: 3023, divisor: 100, currency_code: 'USD' },
          adjusted_gross: { amount: 0, divisor: 100, currency_code: 'USD' },
          adjusted_fees: { amount: 0, divisor: 100, currency_code: 'USD' },
          adjusted_net: { amount: 0, divisor: 100, currency_code: 'USD' },
        }),
      ])
    ).toMatchObject({ status: 'MANUAL_REVIEW', canApplyCanonicalFees: false });
  });

  it('sums multiple same-currency payment records exactly in pence', () => {
    const second = payment({
      payment_id: 9002,
      amount_gross: { amount: 1, divisor: 100, currency_code: 'GBP' },
      amount_fees: { amount: 2, divisor: 100, currency_code: 'GBP' },
      amount_net: { amount: -1, divisor: 100, currency_code: 'GBP' },
    });

    expect(normalizeReceiptPayments('4137418052', [paymentFixture, second])).toMatchObject({
      evidence: {
        paymentGrossPence: 4000,
        paymentFeesPence: 978,
        paymentNetPence: 3022,
      },
    });
  });

  it('marks an aggregate whose gross less fees does not equal net as manual review', () => {
    expect(
      normalizeReceiptPayments('4137418052', [
        payment({ amount_net: { amount: 2500, divisor: 100, currency_code: 'GBP' } }),
      ])
    ).toMatchObject({ status: 'MANUAL_REVIEW', canApplyCanonicalFees: false });
  });

  it('marks non-zero adjusted values as manual review without canonical authorization', () => {
    expect(
      normalizeReceiptPayments('4137418052', [
        payment({ adjusted_fees: { amount: 1, divisor: 100, currency_code: 'GBP' } }),
      ])
    ).toMatchObject({ status: 'MANUAL_REVIEW', canApplyCanonicalFees: false });
  });

  it('rejects missing and mismatched nested money currency codes', () => {
    expect(normalizeReceiptPayments('4137418052', [
      payment({
        amount_gross: {
          amount: 3999,
          divisor: 100,
          currency_code: undefined as unknown as string,
        },
      }),
    ])).toMatchObject({ status: 'MANUAL_REVIEW' });

    expect(normalizeReceiptPayments('4137418052', [
      payment({
        amount_fees: { amount: 976, divisor: 100, currency_code: 'USD' },
      }),
    ])).toMatchObject({ status: 'MANUAL_REVIEW' });
  });
});

describe('Etsy Payment reconciliation orchestration', () => {
  const paymentEvidence: NormalizedOrderEvidence = {
    receiptId: '4137418052',
    currency: 'GBP',
    attributed: null,
    offsiteAdsFeePence: null,
    vatOnOffsiteAdsFeePence: null,
    paymentGrossPence: 3999,
    paymentFeesPence: 976,
    paymentNetPence: 3023,
    source: 'ETSY_PAYMENT_API',
  };

  it('enforces the validation gate at the direct canonical write boundary', async () => {
    for (const gate of [undefined, 'false'] as const) {
      if (gate === undefined) delete process.env.ETSY_PAYMENT_FEES_VALIDATED;
      else process.env.ETSY_PAYMENT_FEES_VALIDATED = gate;
      const db = createFeeDbFixture({
        sales: [sale({ id: 's1', etsyOrderId: '4137418052' })],
      });

      const result = await reconcileImportedPaymentEvidence(paymentEvidence, db);

      expect(result.applied).toBe(false);
      expect(db.writeCount).toBe(0);
      expect(db.sales[0]).toMatchObject({
        etsyFeesPence: 400,
        netRevenuePence: 3599,
        status: 'PENDING',
      });
    }

    process.env.ETSY_PAYMENT_FEES_VALIDATED = 'true';
    const enabledDb = createFeeDbFixture({
      sales: [sale({ id: 's1', etsyOrderId: '4137418052' })],
    });
    const enabled = await reconcileImportedPaymentEvidence(paymentEvidence, enabledDb);
    expect(enabled.applied).toBe(true);
    expect(enabledDb.sales[0]).toMatchObject({
      etsyFeesPence: 976,
      netRevenuePence: 3023,
      status: 'PAYMENT_SYNCED',
    });
  });

  it('never downgrades statement-verified sales for unsafe Payment results', async () => {
    const scenarios: Array<{
      name: string;
      client: IEtsyClient;
    }> = [
      {
        name: 'adjustment',
        client: clientFor(new Map([[4137418052, [payment({ adjusted_fees: { amount: 1, divisor: 100, currency_code: 'GBP' } })]]])),
      },
      {
        name: 'currency',
        client: clientFor(new Map([[4137418052, [payment({ amount_fees: { amount: 976, divisor: 100, currency_code: 'USD' } })]]])),
      },
      {
        name: 'missing',
        client: clientFor(new Map()),
      },
      {
        name: 'api failure',
        client: {
          getPaymentsForReceipt: async () => { throw new Error('temporary failure'); },
        } as unknown as IEtsyClient,
      },
    ];

    for (const scenario of scenarios) {
      const db = createFeeDbFixture({
        sales: [sale({
          id: 's1',
          etsyOrderId: '4137418052',
          status: 'STATEMENT_VERIFIED',
          previousOffsiteAdsFeePence: 480,
          previousVatOnOffsiteAdsFeePence: 96,
        })],
      });
      const result = await previewPaymentReconciliation(
        { receiptIds: ['4137418052'] },
        { client: scenario.client, db },
      );

      expect(result.changes[0], scenario.name).toMatchObject({
        newStatus: 'STATEMENT_VERIFIED',
      });
      expect(db.writeCount, scenario.name).toBe(0);
    }
  });

  it('automatically ignores manually verified rows when selecting Payment receipts', async () => {
    const requestedReceiptIds: number[] = [];
    const db = createFeeDbFixture({
      sales: [
        sale({
          id: 'manual-sale',
          etsyOrderId: '4137418052',
          status: 'MANUALLY_VERIFIED',
          etsyFeeReconciliationSource: 'MANUAL',
          etsyManualResolutionNote: 'Checked manually',
        }),
        sale({ id: 'pending-sale', etsyOrderId: '4137418053' }),
      ],
    });
    const client = {
      getPaymentsForReceipt: async (receiptId: number) => {
        requestedReceiptIds.push(receiptId);
        return receiptId === 4137418053
          ? [payment({ receipt_id: 4137418053 })]
          : [];
      },
    } as unknown as IEtsyClient;

    await previewPaymentReconciliation({ limit: 25 }, { client, db });

    expect(requestedReceiptIds).toEqual([4137418053]);
  });

  it('preserves a manually verified group for explicit Payment input even when the gate is enabled', async () => {
    process.env.ETSY_PAYMENT_FEES_VALIDATED = 'true';
    const db = createFeeDbFixture({
      sales: [sale({
        id: 'manual-sale',
        etsyOrderId: '4137418052',
        status: 'MANUALLY_VERIFIED',
        etsyFeeReconciliationSource: 'MANUAL',
        etsyManualResolutionNote: 'Checked manually',
      })],
    });
    const deps = dependencies(new Map([[4137418052, [paymentFixture]]]), db);

    const preview = await previewPaymentReconciliation({ receiptIds: ['4137418052'] }, deps);

    expect(preview.changes[0]).toMatchObject({
      oldStatus: 'MANUALLY_VERIFIED',
      newStatus: 'MANUALLY_VERIFIED',
      outcome: 'unchanged',
      oldFeesPence: 400,
      newFeesPence: 400,
    });
    expect(preview.canApplyCanonicalFees).toBe(false);

    const result = await applyPaymentReconciliation({
      receiptIds: preview.receiptIds,
      fingerprint: preview.fingerprint,
    }, deps);

    expect(result.applied).toBe(false);
    expect(db.saleWriteCount).toBe(0);
    expect(db.sales[0]).toMatchObject({
      status: 'MANUALLY_VERIFIED',
      etsyFeeReconciliationSource: 'MANUAL',
      etsyManualResolutionNote: 'Checked manually',
      etsyFeesPence: 400,
    });
  });

  it('does not downgrade manually verified rows in a mixed Payment receipt group', async () => {
    process.env.ETSY_PAYMENT_FEES_VALIDATED = 'true';
    const db = createFeeDbFixture({
      sales: [
        sale({
          id: 'manual-sale',
          etsyOrderId: '4137418052',
          grossRevenuePence: 2999,
          etsyFeesPence: 300,
          netRevenuePence: 2699,
          marginPence: 1699,
          status: 'MANUALLY_VERIFIED',
          etsyFeeReconciliationSource: 'MANUAL',
          etsyManualResolutionNote: 'Checked manually',
        }),
        sale({
          id: 'pending-sale',
          etsyOrderId: '4137418052-1',
          grossRevenuePence: 1000,
          etsyFeesPence: 100,
          netRevenuePence: 900,
          marginPence: 400,
        }),
      ],
    });
    const deps = dependencies(new Map([[4137418052, [paymentFixture]]]), db);
    const preview = await previewPaymentReconciliation({ receiptIds: ['4137418052'] }, deps);

    const result = await applyPaymentReconciliation({
      receiptIds: ['4137418052'],
      fingerprint: preview.fingerprint,
    }, deps);

    expect(result.applied).toBe(true);
    expect(db.sales[0]).toMatchObject({
      status: 'MANUALLY_VERIFIED',
      etsyFeeReconciliationSource: 'MANUAL',
      etsyManualResolutionNote: 'Checked manually',
      etsyFeesPence: 300,
    });
    expect(db.sales[1]).toMatchObject({ status: 'PAYMENT_SYNCED' });
  });
  it('previews a valid gated payment without writing, then applies the same evidence', async () => {
    process.env.ETSY_PAYMENT_FEES_VALIDATED = 'true';
    const db = createFeeDbFixture({
      sales: [sale({
        id: 's1',
        etsyOrderId: '4137418052',
        etsyFeesPence: 400,
        netRevenuePence: 3599,
        marginPence: 2199,
      })],
    });
    const deps = dependencies(new Map([[4137418052, [paymentFixture]]]), db);

    const preview = await previewPaymentReconciliation({ receiptIds: ['4137418052'] }, deps);
    expect(preview.changes[0]).toMatchObject({
      receiptId: '4137418052',
      oldFeesPence: 400,
      newFeesPence: 976,
      newStatus: 'PAYMENT_SYNCED',
    });
    expect(preview.canApplyCanonicalFees).toBe(true);
    expect(db.writeCount).toBe(0);

    const result = await applyPaymentReconciliation({
      receiptIds: ['4137418052'],
      fingerprint: preview.fingerprint,
    }, deps);
    expect(result.applied).toBe(true);
    expect(db.sales[0]).toMatchObject({
      etsyFeesPence: 976,
      netRevenuePence: 3023,
      status: 'PAYMENT_SYNCED',
    });
  });

  it('keeps a gate-enabled preview non-applicable when every Payment aggregate fails', async () => {
    process.env.ETSY_PAYMENT_FEES_VALIDATED = 'true';
    const db = createFeeDbFixture({
      sales: [
        sale({ id: 's1', etsyOrderId: '4137418052' }),
        sale({ id: 's2', etsyOrderId: '4137418053' }),
      ],
    });
    const deps: PaymentReconciliationDependencies = {
      client: {
        getPaymentsForReceipt: async (receiptId: number) => receiptId === 4137418052
          ? []
          : [payment({
            receipt_id: 4137418053,
            amount_fees: { amount: 976, divisor: 100, currency_code: 'USD' },
          })],
      } as unknown as IEtsyClient,
      db,
    };

    const preview = await previewPaymentReconciliation({
      receiptIds: ['4137418052', '4137418053'],
    }, deps);

    expect(preview.canApplyCanonicalFees).toBe(false);
    expect(preview.failures).toEqual([
      { receiptId: '4137418052', status: 'PENDING', message: 'No Payment record returned' },
      { receiptId: '4137418053', status: 'MANUAL_REVIEW', message: 'Payment records contain mixed currencies' },
    ]);

    const applied = await applyPaymentReconciliation({
      receiptIds: preview.receiptIds,
      fingerprint: preview.fingerprint,
    }, deps);
    expect(applied.applied).toBe(false);
    expect(db.writeCount).toBe(0);
  });

  it('keeps a valid gated aggregate non-applicable when no local sale matches', async () => {
    process.env.ETSY_PAYMENT_FEES_VALIDATED = 'true';
    const db = createFeeDbFixture({ sales: [] });
    const deps = dependencies(new Map([[4137418052, [paymentFixture]]]), db);

    const preview = await previewPaymentReconciliation({ receiptIds: ['4137418052'] }, deps);

    expect(preview.canApplyCanonicalFees).toBe(false);
    expect(preview.summary).toMatchObject({ matched: 0, changed: 0, unmatched: 1 });

    const result = await applyPaymentReconciliation({
      receiptIds: preview.receiptIds,
      fingerprint: preview.fingerprint,
    }, deps);
    expect(result.applied).toBe(false);
    expect(db.writeCount).toBe(0);
  });

  it('keeps a valid gated aggregate non-applicable for statement-verified sales', async () => {
    process.env.ETSY_PAYMENT_FEES_VALIDATED = 'true';
    const db = createFeeDbFixture({
      sales: [sale({
        id: 'verified',
        etsyOrderId: '4137418052',
        status: 'STATEMENT_VERIFIED',
        previousOffsiteAdsFeePence: 480,
        previousVatOnOffsiteAdsFeePence: 96,
      })],
    });
    const deps = dependencies(new Map([[4137418052, [paymentFixture]]]), db);

    const preview = await previewPaymentReconciliation({ receiptIds: ['4137418052'] }, deps);

    expect(preview.canApplyCanonicalFees).toBe(false);
    expect(preview.summary).toMatchObject({ matched: 1, changed: 0, unmatched: 0 });

    const result = await applyPaymentReconciliation({
      receiptIds: preview.receiptIds,
      fingerprint: preview.fingerprint,
    }, deps);
    expect(result.applied).toBe(false);
    expect(db.writeCount).toBe(0);
    expect(db.sales[0]?.status).toBe('STATEMENT_VERIFIED');
  });

  it('does not write canonical money when the validation gate is disabled', async () => {
    delete process.env.ETSY_PAYMENT_FEES_VALIDATED;
    const db = createFeeDbFixture({
      sales: [sale({ id: 's1', etsyOrderId: '4137418052', etsyFeesPence: 400 })],
    });

    const result = await previewPaymentReconciliation(
      { receiptIds: ['4137418052'] },
      dependencies(new Map([[4137418052, [paymentFixture]]]), db)
    );

    expect(result.changes[0]).toMatchObject({
      newStatus: 'PENDING',
      newFeesPence: 400,
      outcome: 'unchanged',
    });
    expect(result.canApplyCanonicalFees).toBe(false);
    expect(db.writeCount).toBe(0);

    const applied = await applyPaymentReconciliation({
      receiptIds: ['4137418052'],
      fingerprint: result.fingerprint,
    }, dependencies(new Map([[4137418052, [paymentFixture]]]), db));
    expect(applied.applied).toBe(false);
    expect(db.writeCount).toBe(0);
  });

  it('automatically skips placeholder Etsy receipt IDs', async () => {
    const requestedReceiptIds: number[] = [];
    const db = createFeeDbFixture({
      sales: [
        sale({ id: 'placeholder-1', etsyOrderId: '1' }),
        sale({ id: 'placeholder-2', etsyOrderId: '2' }),
        sale({ id: 'real-receipt', etsyOrderId: '4137418052' }),
      ],
    });
    const client = {
      getPaymentsForReceipt: async (receiptId: number) => {
        requestedReceiptIds.push(receiptId);
        return receiptId === 4137418052 ? [paymentFixture] : [];
      },
    } as unknown as IEtsyClient;

    const preview = await previewPaymentReconciliation({ limit: 25 }, { client, db });

    expect(requestedReceiptIds).toEqual([4137418052]);
    expect(preview.receiptIds).toEqual(['4137418052']);
  });

  it('does not count valid observe-only aggregates as failures', async () => {
    delete process.env.ETSY_PAYMENT_FEES_VALIDATED;
    const preview = await previewPaymentReconciliation(
      { receiptIds: ['4137418052'] },
      dependencies(new Map([[4137418052, [paymentFixture]]])),
    );

    expect(preview.failures).toEqual([]);
    expect(preview.summary).toMatchObject({ matched: 1, manualReview: 0 });
  });

  it('keeps API failures as per-order pending results', async () => {
    const deps: PaymentReconciliationDependencies = {
      client: {
        getPaymentsForReceipt: async () => {
          throw new Error('Payment API unavailable');
        },
      } as unknown as IEtsyClient,
      db: createFeeDbFixture({ sales: [sale({ id: 's1', etsyOrderId: '4137418052' })] }),
    };

    const result = await previewPaymentReconciliation({ receiptIds: ['4137418052'] }, deps);

    expect(result.changes[0]).toMatchObject({
      newStatus: 'PENDING',
      outcome: 'unchanged',
      message: 'Payment API unavailable',
    });
    expect(result.summary.unmatched).toBe(0);
    expect((deps.db as ReturnType<typeof createFeeDbFixture>).writeCount).toBe(0);
  });

  it('refetches apply evidence and rejects a stale preview fingerprint', async () => {
    process.env.ETSY_PAYMENT_FEES_VALIDATED = 'true';
    const db = createFeeDbFixture({ sales: [sale({ id: 's1', etsyOrderId: '4137418052' })] });
    let current = paymentFixture;
    const deps = dependencies(new Map([[4137418052, [current]]]), db);
    const preview = await previewPaymentReconciliation({ receiptIds: ['4137418052'] }, deps);
    current = payment({ amount_fees: { amount: 975, divisor: 100, currency_code: 'GBP' } });
    deps.client.getPaymentsForReceipt = async () => [current];

    await expect(applyPaymentReconciliation({
      receiptIds: ['4137418052'],
      fingerprint: preview.fingerprint,
    }, deps)).rejects.toBeInstanceOf(PaymentReconciliationConflictError);
    expect(db.writeCount).toBe(0);
  });

  it('rejects a sale-state mutation at the canonical write boundary', async () => {
    process.env.ETSY_PAYMENT_FEES_VALIDATED = 'true';
    const baseDb = createFeeDbFixture({
      sales: [sale({ id: 's1', etsyOrderId: '4137418052' })],
    });
    let listCalls = 0;
    const db = {
      ...baseDb,
      async listEtsySaleSnapshots() {
        listCalls += 1;
        if (listCalls === 3) {
          baseDb.sales = [sale({
            id: 's1',
            etsyOrderId: '4137418052',
            etsyFeesPence: 401,
          })];
        }
        return baseDb.listEtsySaleSnapshots();
      },
      async transaction(work: Parameters<typeof baseDb.transaction>[0]) {
        return baseDb.transaction(work);
      },
    };
    const deps = dependencies(
      new Map([[4137418052, [paymentFixture]]]),
      db as unknown as ReturnType<typeof createFeeDbFixture>,
    );
    const preview = await previewPaymentReconciliation({ receiptIds: ['4137418052'] }, deps);

    await expect(applyPaymentReconciliation({
      receiptIds: ['4137418052'],
      fingerprint: preview.fingerprint,
    }, deps)).rejects.toBeInstanceOf(PaymentReconciliationConflictError);
    expect(baseDb.writeCount).toBe(0);
    expect(baseDb.sales[0]?.etsyFeesPence).toBe(401);
  });

  it('rejects a mutation after the final snapshot read but before the conditional update', async () => {
    process.env.ETSY_PAYMENT_FEES_VALIDATED = 'true';
    const baseDb = createFeeDbFixture({
      sales: [sale({ id: 's1', etsyOrderId: '4137418052' })],
    });
    const db = {
      ...baseDb,
      async transaction(work: Parameters<typeof baseDb.transaction>[0]) {
        baseDb.sales = [sale({
          id: 's1',
          etsyOrderId: '4137418052',
          etsyFeesPence: 401,
          updatedAt: '2025-07-31T12:01:00.000Z',
        })];
        return baseDb.transaction(work);
      },
    };
    const deps = dependencies(
      new Map([[4137418052, [paymentFixture]]]),
      db as unknown as ReturnType<typeof createFeeDbFixture>,
    );
    const preview = await previewPaymentReconciliation({ receiptIds: ['4137418052'] }, deps);

    await expect(applyPaymentReconciliation({
      receiptIds: ['4137418052'],
      fingerprint: preview.fingerprint,
    }, deps)).rejects.toBeInstanceOf(PaymentReconciliationConflictError);
    expect(baseDb.writeCount).toBe(0);
    expect(baseDb.sales[0]).toMatchObject({ etsyFeesPence: 401 });
  });
});
