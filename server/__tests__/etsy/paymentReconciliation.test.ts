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

  it('marks non-zero adjusted values as manual review without canonical authorization', () => {
    expect(
      normalizeReceiptPayments('4137418052', [
        payment({ adjusted_fees: { amount: 1, divisor: 100, currency_code: 'GBP' } }),
      ])
    ).toMatchObject({ status: 'MANUAL_REVIEW', canApplyCanonicalFees: false });
  });
});

describe('Etsy Payment reconciliation orchestration', () => {
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
});
