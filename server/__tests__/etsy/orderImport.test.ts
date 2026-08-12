import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before importing the module
vi.mock('../../lib/prisma', () => ({
    prisma: {
        sale: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
        hamper: { findFirst: vi.fn() },
        hamperVariant: { findFirst: vi.fn(), update: vi.fn() },
        etsyFeeConfig: { findFirst: vi.fn() },
        packagingOverhead: { findMany: vi.fn() },
        componentCategory: { findUnique: vi.fn() },
        hamperVariantMapping: { findUnique: vi.fn(), findMany: vi.fn() },
        inventoryLot: { update: vi.fn(), findMany: vi.fn() },
        $transaction: vi.fn(),
    },
}));

vi.mock('../../lib/etsyClient', () => ({
    etsyClient: {
        getReceipts: vi.fn(),
        getListingInventory: vi.fn(),
        getPaymentsForReceipt: vi.fn(),
    },
}));

vi.mock('../../lib/etsy/debugLogger', () => ({
    logWorkflow: vi.fn(),
    startLogSession: vi.fn().mockReturnValue('test-session'),
    endLogSession: vi.fn(),
}));

import { prisma } from '../../lib/prisma';
import { etsyClient } from '../../lib/etsyClient';
import { clearInventoryCache } from '../../lib/etsy/inventoryCache';
import { importOrder, importOrdersBulk } from '../../lib/etsy/sync/orders';
import { getEtsyFeeReconciliationStatus } from '../../features/sales/router';

const mockPrisma = prisma as unknown as {
    sale: {
        findFirst: ReturnType<typeof vi.fn>;
        findMany: ReturnType<typeof vi.fn>;
        findUnique: ReturnType<typeof vi.fn>;
        create: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
        updateMany: ReturnType<typeof vi.fn>;
    };
    hamper: { findFirst: ReturnType<typeof vi.fn> };
    hamperVariant: { findFirst: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
    etsyFeeConfig: { findFirst: ReturnType<typeof vi.fn> };
    packagingOverhead: { findMany: ReturnType<typeof vi.fn> };
    componentCategory: { findUnique: ReturnType<typeof vi.fn> };
    hamperVariantMapping: { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
    inventoryLot: { update: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
};

const mockEtsyClient = etsyClient as unknown as {
    getReceipts: ReturnType<typeof vi.fn>;
    getListingInventory: ReturnType<typeof vi.fn>;
    getPaymentsForReceipt: ReturnType<typeof vi.fn>;
};

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

function configureMinimalOrderImport(receiptId: number) {
    mockPrisma.sale.findFirst.mockResolvedValue(null);
    mockPrisma.etsyFeeConfig.findFirst.mockResolvedValue(null);
    mockPrisma.packagingOverhead.findMany.mockResolvedValue([]);
    mockPrisma.hamper.findFirst.mockResolvedValue({
        id: 'hamper-deferred',
        name: 'Deferred Hamper',
        etsyListingId: '100',
        hasVariants: false,
        requirements: [],
        variants: [],
    });
    mockEtsyClient.getReceipts.mockResolvedValue({
        receipts: [{
            receipt_id: receiptId,
            name: 'Deferred Buyer',
            is_paid: true,
            is_shipped: false,
            create_timestamp: Math.floor(Date.now() / 1000),
            grandtotal: { amount: 3000, divisor: 100 },
            subtotal: { amount: 3000, divisor: 100 },
            total_shipping_cost: { amount: 0, divisor: 100 },
            transactions: [{
                transaction_id: receiptId,
                listing_id: 100,
                title: 'Deferred Hamper',
                quantity: 1,
                price: { amount: 3000, divisor: 100 },
                sku: null,
                product_id: null,
                variations: [],
            }],
        }],
    });
    mockPrisma.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
        sale: {
            create: vi.fn().mockResolvedValue({
                id: `sale-deferred-${receiptId}`,
                etsyOrderId: String(receiptId),
                grossRevenue: 30,
                totalCost: 0,
                margin: 30,
                netRevenue: 30,
                etsyFees: 0,
                packagingOverhead: 0,
            }),
        },
        inventoryLot: { update: vi.fn().mockResolvedValue({}) },
        $executeRaw: vi.fn().mockResolvedValue(0),
    }));
}

function nextEventLoopTurn() {
    return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe('Order Import - Stock Decrement', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearInventoryCache();
        mockEtsyClient.getPaymentsForReceipt.mockResolvedValue([]);
        mockPrisma.sale.findMany.mockResolvedValue([]);
        mockPrisma.sale.update.mockResolvedValue({});
    });

    afterEach(async () => {
        await nextEventLoopTurn();
    });

    it.each([
        ['direct', undefined, 'NOT_APPLICABLE'],
        ['fair', undefined, 'NOT_APPLICABLE'],
        ['etsy', '12345', 'PENDING'],
        ['etsy', ' 12345 ', 'PENDING'],
        ['etsy', undefined, 'MANUAL_REVIEW'],
        ['etsy', '   ', 'MANUAL_REVIEW'],
        ['etsy', '12345-1', 'MANUAL_REVIEW'],
        ['etsy', 'abc', 'MANUAL_REVIEW'],
        ['direct', ' 12345 ', 'NOT_APPLICABLE'],
        ['fair', 'abc', 'NOT_APPLICABLE'],
    ] as const)('initializes %s sales with %s reconciliation status', (channel, etsyOrderId, expected) => {
        expect(getEtsyFeeReconciliationStatus(channel, etsyOrderId)).toBe(expected);
    });

    it('returns a single import before a slow Payment lookup resolves', async () => {
        const paymentLookup = deferred<unknown[]>();
        const receiptId = 91001;
        configureMinimalOrderImport(receiptId);
        mockEtsyClient.getPaymentsForReceipt.mockReturnValue(paymentLookup.promise);

        let resolved = false;
        const importPromise = importOrder(receiptId, 0).then((result) => {
            resolved = true;
            return result;
        });

        try {
            await nextEventLoopTurn();
            expect(resolved).toBe(true);
        } finally {
            paymentLookup.resolve([]);
            await importPromise;
            await nextEventLoopTurn();
        }
    });

    it('returns a bulk import before a slow Payment lookup resolves', async () => {
        const paymentLookup = deferred<unknown[]>();
        const receiptIds = [91002, 91003];
        configureMinimalOrderImport(receiptIds[0]);
        mockEtsyClient.getReceipts.mockResolvedValue({
            receipts: receiptIds.map((receiptId) => ({
                receipt_id: receiptId,
                name: 'Deferred Buyer',
                is_paid: true,
                is_shipped: false,
                create_timestamp: Math.floor(Date.now() / 1000),
                grandtotal: { amount: 3000, divisor: 100 },
                subtotal: { amount: 3000, divisor: 100 },
                total_shipping_cost: { amount: 0, divisor: 100 },
                transactions: [{
                    transaction_id: receiptId,
                    listing_id: 100,
                    title: 'Deferred Hamper',
                    quantity: 1,
                    price: { amount: 3000, divisor: 100 },
                    sku: null,
                    product_id: null,
                    variations: [],
                }],
            })),
        });
        mockEtsyClient.getPaymentsForReceipt.mockReturnValue(paymentLookup.promise);

        let resolved = false;
        const importPromise = importOrdersBulk(
            receiptIds.map((receiptId) => ({ receiptId, postageCost: 0 })),
        ).then((result) => {
            resolved = true;
            return result;
        });

        try {
            await nextEventLoopTurn();
            expect(resolved).toBe(true);
        } finally {
            paymentLookup.resolve([]);
            await importPromise;
            await nextEventLoopTurn();
        }
    });

    it('decrements inventoryLot.remaining when importing an order', async () => {
        // Track calls to inventoryLot.update inside transaction
        const inventoryLotUpdateCalls: Array<{ where: { id: string }; data: { remaining: { decrement: number } } }> = [];
        let createdSaleData: Record<string, unknown> | undefined;

        // Setup mock transaction that captures lot updates
        mockPrisma.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
            const mockTx = {
                sale: {
                    create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
                        createdSaleData = data;
                        return Promise.resolve({
                        id: 'sale-1',
                        etsyOrderId: '12345',
                        grossRevenue: 30,
                        totalCost: 5,
                        margin: 20,
                        netRevenue: 25,
                        etsyFees: 5,
                        packagingOverhead: 0,
                        });
                    }),
                },
                inventoryLot: {
                    update: vi.fn().mockImplementation((args) => {
                        inventoryLotUpdateCalls.push(args);
                        return Promise.resolve({});
                    }),
                },
                componentCategory: {
                    findUnique: vi.fn().mockResolvedValue({
                        id: 'cat-1',
                        name: 'T-Shirts',
                        products: [
                            {
                                id: 'prod-1',
                                name: 'Brown T-Shirt',
                                lots: [
                                    { id: 'lot-1', remaining: 10, unitCost: 5.0, receivedAt: new Date(), expiresAt: null },
                                ],
                            },
                        ],
                    }),
                },
                hamperVariantMapping: {
                    findUnique: vi.fn().mockResolvedValue(null),
                },
            };
            return callback(mockTx);
        });

        // Mock receipt from Etsy
        mockEtsyClient.getReceipts.mockResolvedValue({
            receipts: [
                {
                    receipt_id: 12345,
                    name: 'Test Buyer',
                    is_paid: true,
                    is_shipped: false,
                    create_timestamp: Math.floor(Date.now() / 1000),
                    grandtotal: { amount: 3000, divisor: 100 },
                    subtotal: { amount: 2500, divisor: 100 },
                    total_shipping_cost: { amount: 500, divisor: 100 },
                    transactions: [
                        {
                            transaction_id: 1,
                            listing_id: 100,
                            title: 'Test Hamper',
                            quantity: 1,
                            price: { amount: 2500, divisor: 100 },
                            sku: 'TEST-SKU',
                            product_id: 999,
                            variations: [],
                        },
                    ],
                },
            ],
        });

        mockPrisma.sale.findFirst.mockResolvedValue(null);
        mockPrisma.hamper.findFirst.mockResolvedValue({
            id: 'hamper-1',
            name: 'Test Hamper',
            etsyListingId: '100',
            hasVariants: false,
            requirements: [
                {
                    id: 'req-1',
                    categoryId: 'cat-1',
                    quantity: 1,
                    isOptional: false,
                    category: { id: 'cat-1', name: 'T-Shirts', pickRule: 'FIFO' },
                },
            ],
            variants: [],
        });
        mockPrisma.etsyFeeConfig.findFirst.mockResolvedValue({
            id: 'fee-1',
            transactionFee: 0.065,
            regulatoryFee: 0.003,
            paymentFeePercent: 0.04,
            paymentFeeFixed: 0.2,
            vatRate: 0.2,
            listingFee: 0.15,
        });
        mockPrisma.packagingOverhead.findMany.mockResolvedValue([]);
        mockPrisma.componentCategory.findUnique.mockResolvedValue({
            id: 'cat-1',
            name: 'T-Shirts',
            products: [
                {
                    id: 'prod-1',
                    name: 'Brown T-Shirt',
                    lots: [{ id: 'lot-1', remaining: 10, unitCost: 5.0, receivedAt: new Date(), expiresAt: null }],
                },
            ],
        });
        mockPrisma.hamperVariantMapping.findUnique.mockResolvedValue(null);
        mockEtsyClient.getPaymentsForReceipt.mockRejectedValue(new Error('Etsy unavailable'));

        const result = await importOrder(12345, 3.5);

        expect(result.success).toBe(true);
        expect(result.feeReconciliation.status).toBe('PENDING');
        expect(createdSaleData?.etsyFeeReconciliationStatus).toBe('PENDING');
        expect(inventoryLotUpdateCalls).toHaveLength(1);
        expect(inventoryLotUpdateCalls[0]).toEqual({
            where: { id: 'lot-1' },
            data: { remaining: { decrement: 1 } },
        });
    });

    it('preserves statement authority when manual Payment review races a statement update', async () => {
        const receiptId = 12350;
        let persistedStatus: 'PENDING' | 'STATEMENT_VERIFIED' | 'MANUAL_REVIEW' = 'PENDING';
        const updatedAt = new Date('2026-08-12T00:00:00.000Z');
        const money = (amount: number) => ({ amount, divisor: 100 });
        const saleSnapshot = {
            id: 'sale-race',
            etsyOrderId: String(receiptId),
            grossRevenue: { toNumber: () => 30 },
            etsyFees: { toNumber: () => 5 },
            netRevenue: { toNumber: () => 25 },
            margin: { toNumber: () => 20 },
            offsiteAdsFee: null,
            vatOnOffsiteAdsFee: null,
            etsyPaymentGross: null,
            etsyPaymentFees: null,
            etsyPaymentNet: null,
            offsiteAdsAttributed: null,
            get etsyFeeReconciliationStatus() { return persistedStatus; },
            updatedAt,
        };

        mockPrisma.sale.findMany.mockResolvedValue([saleSnapshot]);
        mockPrisma.sale.findUnique.mockImplementation(async () => ({
            etsyFeeReconciliationStatus: persistedStatus,
        }));
        mockPrisma.sale.update.mockImplementation(async ({ data }: { data: { etsyFeeReconciliationStatus: typeof persistedStatus } }) => {
            persistedStatus = 'STATEMENT_VERIFIED';
            persistedStatus = data.etsyFeeReconciliationStatus;
            return {};
        });
        mockPrisma.sale.updateMany.mockImplementation(async () => {
            persistedStatus = 'STATEMENT_VERIFIED';
            return { count: 0 };
        });
        mockPrisma.$transaction.mockImplementation(async (callback: (tx: any) => Promise<unknown>) => callback({
            $executeRaw: vi.fn().mockResolvedValue(0),
            sale: {
                create: vi.fn().mockResolvedValue({
                    id: 'sale-race',
                    etsyOrderId: String(receiptId),
                    grossRevenue: 30,
                    totalCost: 0,
                    margin: 20,
                    netRevenue: 25,
                    etsyFees: 5,
                    packagingOverhead: 0,
                }),
            },
        }));
        mockEtsyClient.getReceipts.mockResolvedValue({
            receipts: [{
                receipt_id: receiptId,
                name: 'Race Buyer',
                is_paid: true,
                is_shipped: false,
                create_timestamp: Math.floor(Date.now() / 1000),
                grandtotal: money(3000),
                subtotal: money(2500),
                total_shipping_cost: money(500),
                transactions: [{
                    transaction_id: receiptId,
                    listing_id: 100,
                    title: 'Race Hamper',
                    quantity: 1,
                    price: money(2500),
                    sku: null,
                    product_id: null,
                    variations: [],
                }],
            }],
        });
        mockEtsyClient.getPaymentsForReceipt.mockResolvedValue([{
            payment_id: 1,
            receipt_id: receiptId + 1,
            currency: 'GBP',
            amount_gross: { ...money(3000), currency_code: 'GBP' },
            amount_fees: { ...money(650), currency_code: 'GBP' },
            amount_net: { ...money(2350), currency_code: 'GBP' },
            adjusted_gross: { ...money(0), currency_code: 'GBP' },
            adjusted_fees: { ...money(0), currency_code: 'GBP' },
            adjusted_net: { ...money(0), currency_code: 'GBP' },
        }]);
        mockPrisma.sale.findFirst.mockResolvedValue(null);
        mockPrisma.hamper.findFirst.mockResolvedValue({
            id: 'hamper-race',
            name: 'Race Hamper',
            etsyListingId: '100',
            hasVariants: false,
            requirements: [],
            variants: [],
        });
        mockPrisma.etsyFeeConfig.findFirst.mockResolvedValue(null);
        mockPrisma.packagingOverhead.findMany.mockResolvedValue([]);

        const result = await importOrder(receiptId, 0, true);
        await nextEventLoopTurn();

        expect(result.success).toBe(true);
        expect(result.feeReconciliation.status).toBe('PENDING');
        expect(persistedStatus).toBe('STATEMENT_VERIFIED');
    });

    it('decrements multiple lots when order requires more than one allocation (FIFO)', async () => {
        const inventoryLotUpdateCalls: Array<{ where: { id: string }; data: { remaining: { decrement: number } } }> = [];

        mockPrisma.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
            const mockTx = {
                sale: {
                    create: vi.fn().mockResolvedValue({
                        id: 'sale-1',
                        etsyOrderId: '12346',
                        grossRevenue: 60,
                        totalCost: 15,
                        margin: 35,
                        netRevenue: 50,
                        etsyFees: 10,
                        packagingOverhead: 0,
                    }),
                },
                inventoryLot: {
                    update: vi.fn().mockImplementation((args) => {
                        inventoryLotUpdateCalls.push(args);
                        return Promise.resolve({});
                    }),
                },
                componentCategory: {
                    findUnique: vi.fn().mockResolvedValue({
                        id: 'cat-1',
                        name: 'T-Shirts',
                        products: [
                            {
                                id: 'prod-1',
                                name: 'Brown T-Shirt',
                                lots: [
                                    { id: 'lot-1', remaining: 2, unitCost: 5.0, receivedAt: new Date('2024-01-01'), expiresAt: null },
                                    { id: 'lot-2', remaining: 5, unitCost: 6.0, receivedAt: new Date('2024-01-02'), expiresAt: null },
                                ],
                            },
                        ],
                    }),
                },
                hamperVariantMapping: { findUnique: vi.fn().mockResolvedValue(null) },
            };
            return callback(mockTx);
        });

        mockEtsyClient.getReceipts.mockResolvedValue({
            receipts: [
                {
                    receipt_id: 12346,
                    name: 'Test Buyer',
                    is_paid: true,
                    is_shipped: false,
                    create_timestamp: Math.floor(Date.now() / 1000),
                    grandtotal: { amount: 6000, divisor: 100 },
                    subtotal: { amount: 5000, divisor: 100 },
                    total_shipping_cost: { amount: 1000, divisor: 100 },
                    transactions: [
                        {
                            transaction_id: 2,
                            listing_id: 100,
                            title: 'Test Hamper',
                            quantity: 3, // Needs 3 units, lot-1 has 2, lot-2 has 5
                            price: { amount: 2000, divisor: 100 },
                            sku: 'TEST-SKU',
                            product_id: 999,
                            variations: [],
                        },
                    ],
                },
            ],
        });

        mockPrisma.sale.findFirst.mockResolvedValue(null);
        mockPrisma.hamper.findFirst.mockResolvedValue({
            id: 'hamper-1',
            name: 'Test Hamper',
            etsyListingId: '100',
            hasVariants: false,
            requirements: [
                {
                    id: 'req-1',
                    categoryId: 'cat-1',
                    quantity: 1,
                    isOptional: false,
                    category: { id: 'cat-1', name: 'T-Shirts', pickRule: 'FIFO' },
                },
            ],
            variants: [],
        });
        mockPrisma.etsyFeeConfig.findFirst.mockResolvedValue({
            id: 'fee-1',
            transactionFee: 0.065,
            regulatoryFee: 0.003,
            paymentFeePercent: 0.04,
            paymentFeeFixed: 0.2,
            vatRate: 0.2,
            listingFee: 0.15,
        });
        mockPrisma.packagingOverhead.findMany.mockResolvedValue([]);
        mockPrisma.componentCategory.findUnique.mockResolvedValue({
            id: 'cat-1',
            name: 'T-Shirts',
            products: [
                {
                    id: 'prod-1',
                    name: 'Brown T-Shirt',
                    lots: [
                        { id: 'lot-1', remaining: 2, unitCost: 5.0, receivedAt: new Date('2024-01-01'), expiresAt: null },
                        { id: 'lot-2', remaining: 5, unitCost: 6.0, receivedAt: new Date('2024-01-02'), expiresAt: null },
                    ],
                },
            ],
        });
        mockPrisma.hamperVariantMapping.findUnique.mockResolvedValue(null);

        const result = await importOrder(12346, 5.0);

        expect(result.success).toBe(true);
        expect(inventoryLotUpdateCalls).toHaveLength(2);
        // FIFO: first lot-1 (2 units), then lot-2 (1 unit)
        expect(inventoryLotUpdateCalls[0]).toEqual({
            where: { id: 'lot-1' },
            data: { remaining: { decrement: 2 } },
        });
        expect(inventoryLotUpdateCalls[1]).toEqual({
            where: { id: 'lot-2' },
            data: { remaining: { decrement: 1 } },
        });
    });

    it('applies validated Payment totals after the import transaction commits', async () => {
        const previousGate = process.env.ETSY_PAYMENT_FEES_VALIDATED;
        process.env.ETSY_PAYMENT_FEES_VALIDATED = 'true';
        const updatedAt = new Date('2026-08-12T00:00:00.000Z');
        const updateMany = vi.fn().mockResolvedValue({ count: 1 });
        let transactionCall = 0;
        const money = (amount: number) => ({ amount, divisor: 100, currency_code: 'GBP' });

        mockPrisma.$transaction.mockImplementation(async (callback: (tx: any) => Promise<unknown>) => {
            transactionCall += 1;
            if (transactionCall === 1) {
                return callback({
                    sale: {
                        create: vi.fn().mockResolvedValue({
                            id: 'sale-payment',
                            etsyOrderId: '12349',
                            grossRevenue: 30,
                            totalCost: 5,
                            margin: 20,
                            netRevenue: 25,
                            etsyFees: 5,
                            packagingOverhead: 0,
                        }),
                    },
                    inventoryLot: {
                        update: vi.fn().mockResolvedValue({}),
                    },
                    componentCategory: {
                        findUnique: vi.fn().mockResolvedValue({
                            id: 'cat-1',
                            name: 'T-Shirts',
                            products: [
                                {
                                    id: 'prod-1',
                                    name: 'Brown T-Shirt',
                                    lots: [{ id: 'lot-1', remaining: 10, unitCost: 5, receivedAt: new Date(), expiresAt: null }],
                                },
                            ],
                        }),
                    },
                    hamperVariantMapping: {
                        findUnique: vi.fn().mockResolvedValue(null),
                    },
                });
            }
            return callback({ sale: { updateMany } });
        });

        mockEtsyClient.getReceipts.mockResolvedValue({
            receipts: [{
                receipt_id: 12349,
                name: 'Payment Buyer',
                is_paid: true,
                is_shipped: false,
                create_timestamp: Math.floor(Date.now() / 1000),
                grandtotal: money(3000),
                subtotal: money(2500),
                total_shipping_cost: money(500),
                transactions: [{
                    transaction_id: 9,
                    listing_id: 100,
                    title: 'Test Hamper',
                    quantity: 1,
                    price: money(2500),
                    sku: null,
                    product_id: null,
                    variations: [],
                }],
            }],
        });
        mockEtsyClient.getPaymentsForReceipt.mockResolvedValue([{
            payment_id: 1,
            receipt_id: 12349,
            currency: 'GBP',
            amount_gross: money(3000),
            amount_fees: money(650),
            amount_net: money(2350),
            adjusted_gross: money(0),
            adjusted_fees: money(0),
            adjusted_net: money(0),
        }]);
        mockPrisma.sale.findFirst.mockResolvedValue(null);
        mockPrisma.sale.findMany.mockResolvedValue([{
            id: 'sale-payment',
            etsyOrderId: '12349',
            grossRevenue: { toNumber: () => 30 },
            etsyFees: { toNumber: () => 5 },
            netRevenue: { toNumber: () => 25 },
            margin: { toNumber: () => 20 },
            offsiteAdsFee: null,
            vatOnOffsiteAdsFee: null,
            etsyPaymentGross: null,
            etsyPaymentFees: null,
            etsyPaymentNet: null,
            offsiteAdsAttributed: null,
            etsyFeeReconciliationStatus: 'PENDING',
            updatedAt,
        }]);
        mockPrisma.hamper.findFirst.mockResolvedValue({
            id: 'hamper-1',
            name: 'Test Hamper',
            etsyListingId: '100',
            hasVariants: false,
            requirements: [{
                id: 'req-1',
                categoryId: 'cat-1',
                quantity: 1,
                isOptional: false,
                category: { id: 'cat-1', name: 'T-Shirts', pickRule: 'FIFO' },
            }],
            variants: [],
        });
        mockPrisma.etsyFeeConfig.findFirst.mockResolvedValue({
            id: 'fee-1',
            transactionFee: 0.065,
            regulatoryFee: 0.003,
            paymentFeePercent: 0.04,
            paymentFeeFixed: 0.2,
            vatRate: 0.2,
            listingFee: 0.15,
        });
        mockPrisma.packagingOverhead.findMany.mockResolvedValue([]);
        mockPrisma.hamperVariantMapping.findUnique.mockResolvedValue(null);

        try {
            const result = await importOrder(12349, 3.5);
            await nextEventLoopTurn();

            expect(result.feeReconciliation.status).toBe('PENDING');
            expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
                where: { id: 'sale-payment', updatedAt },
                data: expect.objectContaining({
                    etsyFees: 6.5,
                    netRevenue: 23.5,
                    margin: 18.5,
                    etsyFeeReconciliationStatus: 'PAYMENT_SYNCED',
                }),
            }));
        } finally {
            if (previousGate === undefined) delete process.env.ETSY_PAYMENT_FEES_VALIDATED;
            else process.env.ETSY_PAYMENT_FEES_VALIDATED = previousGate;
        }
    });

    it('continues bulk imports when one Payment lookup fails', async () => {
        let createdSaleCount = 0;
        mockPrisma.sale.findMany.mockResolvedValue([]);
        mockPrisma.etsyFeeConfig.findFirst.mockResolvedValue(null);
        mockPrisma.packagingOverhead.findMany.mockResolvedValue([]);
        mockPrisma.hamper.findFirst.mockResolvedValue({
            id: 'hamper-bulk',
            name: 'Bulk Hamper',
            etsyListingId: '100',
            hasVariants: false,
            requirements: [],
            variants: [],
        });
        mockPrisma.$transaction.mockImplementation(async (callback: (tx: any) => Promise<unknown>) => callback({
            sale: {
                create: vi.fn().mockResolvedValue({ id: `sale-bulk-${++createdSaleCount}` }),
            },
            $executeRaw: vi.fn().mockResolvedValue(0),
        }));
        mockEtsyClient.getReceipts.mockResolvedValue({
            receipts: [10001, 10002].map((receiptId) => ({
                receipt_id: receiptId,
                name: 'Bulk Buyer',
                is_paid: true,
                is_shipped: false,
                create_timestamp: Math.floor(Date.now() / 1000),
                grandtotal: { amount: 3000, divisor: 100 },
                subtotal: { amount: 2500, divisor: 100 },
                total_shipping_cost: { amount: 500, divisor: 100 },
                transactions: [{
                    transaction_id: receiptId,
                    listing_id: 100,
                    title: 'Bulk Hamper',
                    quantity: 1,
                    price: { amount: 2500, divisor: 100 },
                    sku: null,
                    product_id: null,
                    variations: [],
                }],
            })),
        });
        mockEtsyClient.getPaymentsForReceipt
            .mockRejectedValueOnce(new Error('Etsy unavailable'))
            .mockResolvedValueOnce([]);

        const result = await importOrdersBulk(
            [{ receiptId: 10001, postageCost: 3.5 }, { receiptId: 10002, postageCost: 3.5 }],
            true,
        );
        await nextEventLoopTurn();

        expect(result.imported).toBe(2);
        expect(result.failed).toBe(0);
        expect(result.results).toEqual([
            expect.objectContaining({ receiptId: 10001, success: true, feeReconciliation: { status: 'PENDING' } }),
            expect.objectContaining({ receiptId: 10002, success: true, feeReconciliation: { status: 'PENDING' } }),
        ]);
        expect(mockEtsyClient.getPaymentsForReceipt).toHaveBeenCalledTimes(2);
    });

    it('decrements priority 1 product first when variant has alternatives', async () => {
        const inventoryLotUpdateCalls: Array<{ where: { id: string }; data: { remaining: { decrement: number } } }> = [];

        // Mock for pre-check phase (uses global prisma)
        const variantMappingsData = [
            {
                variantId: 'var-boy',
                categoryId: 'cat-rattle',
                productId: 'prod-blue',
                priority: 1,
                category: { id: 'cat-rattle', name: 'Rattle' },
                product: {
                    id: 'prod-blue',
                    name: 'Blue Rattle',
                    lots: [{ id: 'lot-blue', remaining: 10, unitCost: 2.0, receivedAt: new Date(), expiresAt: null }],
                },
            },
            {
                variantId: 'var-boy',
                categoryId: 'cat-rattle',
                productId: 'prod-grey',
                priority: 2,
                category: { id: 'cat-rattle', name: 'Rattle' },
                product: {
                    id: 'prod-grey',
                    name: 'Grey Rattle',
                    lots: [{ id: 'lot-grey', remaining: 10, unitCost: 1.5, receivedAt: new Date(), expiresAt: null }],
                },
            },
        ];

        mockPrisma.hamperVariantMapping.findMany.mockResolvedValue(variantMappingsData);

        mockPrisma.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
            const mockTx = {
                sale: {
                    create: vi.fn().mockResolvedValue({
                        id: 'sale-1',
                        etsyOrderId: '12347',
                        grossRevenue: 30,
                        totalCost: 5,
                        margin: 20,
                        netRevenue: 25,
                        etsyFees: 5,
                        packagingOverhead: 0,
                    }),
                },
                inventoryLot: {
                    update: vi.fn().mockImplementation((args) => {
                        inventoryLotUpdateCalls.push(args);
                        return Promise.resolve({});
                    }),
                },
                componentCategory: {
                    findUnique: vi.fn().mockResolvedValue({
                        id: 'cat-rattle',
                        name: 'Rattle',
                        products: [
                            {
                                id: 'prod-blue',
                                name: 'Blue Rattle',
                                lots: [{ id: 'lot-blue', remaining: 10, unitCost: 2.0, receivedAt: new Date(), expiresAt: null }],
                            },
                            {
                                id: 'prod-grey',
                                name: 'Grey Rattle',
                                lots: [{ id: 'lot-grey', remaining: 10, unitCost: 1.5, receivedAt: new Date(), expiresAt: null }],
                            },
                        ],
                    }),
                },
                hamperVariantMapping: {
                    findMany: vi.fn().mockResolvedValue(variantMappingsData),
                },
            };
            return callback(mockTx);
        });

        mockEtsyClient.getReceipts.mockResolvedValue({
            receipts: [
                {
                    receipt_id: 12347,
                    name: 'Test Buyer',
                    is_paid: true,
                    is_shipped: false,
                    create_timestamp: Math.floor(Date.now() / 1000),
                    grandtotal: { amount: 3000, divisor: 100 },
                    subtotal: { amount: 2500, divisor: 100 },
                    total_shipping_cost: { amount: 500, divisor: 100 },
                    transactions: [
                        {
                            transaction_id: 3,
                            listing_id: 200,
                            title: 'Baby Hamper - Boy',
                            quantity: 1,
                            price: { amount: 2500, divisor: 100 },
                            sku: 'BOY-SKU',
                            product_id: 888,
                            variations: [{ property_id: 1, value: 'Boy' }],
                        },
                    ],
                },
            ],
        });

        mockPrisma.sale.findFirst.mockResolvedValue(null);
        mockPrisma.hamper.findFirst.mockResolvedValue({
            id: 'hamper-baby',
            name: 'Baby Hamper',
            etsyListingId: '200',
            hasVariants: true,
            requirements: [
                {
                    id: 'req-rattle',
                    categoryId: 'cat-rattle',
                    quantity: 1,
                    isOptional: false,
                    category: { id: 'cat-rattle', name: 'Rattle', pickRule: 'FIFO' },
                },
            ],
            variants: [
                { id: 'var-boy', name: 'Boy', etsySku: 'BOY-SKU', etsyProductId: '888' },
            ],
        });
        mockPrisma.hamperVariant.findFirst.mockResolvedValue({
            id: 'var-boy',
            hamperId: 'hamper-baby',
            name: 'Boy',
            etsySku: 'BOY-SKU',
            etsyProductId: '888',
        });
        mockPrisma.etsyFeeConfig.findFirst.mockResolvedValue({
            id: 'fee-1',
            transactionFee: 0.065,
            regulatoryFee: 0.003,
            paymentFeePercent: 0.04,
            paymentFeeFixed: 0.2,
            vatRate: 0.2,
            listingFee: 0.15,
        });
        mockPrisma.packagingOverhead.findMany.mockResolvedValue([]);

        const result = await importOrder(12347, 3.5);

        expect(result.success).toBe(true);
        expect(inventoryLotUpdateCalls).toHaveLength(1);
        // Should decrement from priority 1 (Blue Rattle), not priority 2 (Grey Rattle)
        expect(inventoryLotUpdateCalls[0]).toEqual({
            where: { id: 'lot-blue' },
            data: { remaining: { decrement: 1 } },
        });
    });

    it('does not fall back to SKU when Etsy has duplicate SKUs for the listing', async () => {
        mockPrisma.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
            const mockTx = {
                $executeRaw: vi.fn().mockResolvedValue(1),
                sale: {
                    create: vi.fn().mockResolvedValue({
                        id: 'sale-6001',
                        etsyOrderId: '6001',
                        grossRevenue: 30,
                        totalCost: 0,
                        margin: 30,
                        netRevenue: 30,
                        etsyFees: 0,
                        packagingOverhead: 0,
                        lines: [
                            {
                                hamperId: 'hamper-baby',
                                variantId: null,
                                quantity: 1,
                                unitPrice: 30,
                                lineCost: 0,
                                consumptions: [],
                            },
                        ],
                    }),
                },
            };
            return callback(mockTx);
        });

        mockEtsyClient.getReceipts.mockResolvedValue({
            receipts: [
                {
                    receipt_id: 6001,
                    name: 'Test Buyer',
                    is_paid: true,
                    is_shipped: false,
                    create_timestamp: Math.floor(Date.now() / 1000),
                    grandtotal: { amount: 3000, divisor: 100 },
                    subtotal: { amount: 3000, divisor: 100 },
                    total_shipping_cost: { amount: 0, divisor: 100 },
                    transactions: [
                        {
                            transaction_id: 6001,
                            listing_id: 200,
                            title: 'Baby Hamper',
                            quantity: 1,
                            price: { amount: 3000, divisor: 100 },
                            sku: 'DUP-SKU',
                            product_id: 999,
                            variations: [],
                        },
                    ],
                },
            ],
        });
        mockEtsyClient.getListingInventory.mockResolvedValue({
            listing_id: 200,
            products: [
                { product_id: 999, sku: 'DUP-SKU', is_deleted: false, property_values: [], offerings: [] },
                { product_id: 888, sku: 'DUP-SKU', is_deleted: false, property_values: [], offerings: [] },
            ],
            price_on_property: [],
            quantity_on_property: [],
            sku_on_property: [],
        });

        mockPrisma.sale.findFirst.mockResolvedValue(null);
        mockPrisma.hamper.findFirst.mockResolvedValue({
            id: 'hamper-baby',
            name: 'Baby Hamper',
            etsyListingId: '200',
            hasVariants: true,
            requirements: [
                {
                    id: 'req-rattle',
                    categoryId: 'cat-rattle',
                    quantity: 1,
                    isOptional: false,
                    category: { id: 'cat-rattle', name: 'Rattle', pickRule: 'FIFO' },
                },
            ],
            variants: [
                { id: 'var-mustard', name: 'Mustard', etsySku: 'DUP-SKU', etsyProductId: '888' },
            ],
        });
        mockPrisma.hamperVariant.findFirst.mockImplementation(({ where }: any) => {
            if (where?.etsyProductId === '999') return Promise.resolve(null);
            if (where?.etsySku === 'DUP-SKU') {
                return Promise.resolve({
                    id: 'var-mustard',
                    hamperId: 'hamper-baby',
                    name: 'Mustard',
                    etsySku: 'DUP-SKU',
                    etsyProductId: '888',
                    sellingPrice: 30,
                });
            }
            return Promise.resolve(null);
        });
        mockPrisma.etsyFeeConfig.findFirst.mockResolvedValue({
            id: 'fee-1',
            transactionFee: 0,
            regulatoryFee: 0,
            paymentFeePercent: 0,
            paymentFeeFixed: 0,
            vatRate: 0,
            listingFee: 0,
        });
        mockPrisma.packagingOverhead.findMany.mockResolvedValue([]);

        const result = await importOrder(6001, 0, true);

        expect(result.success).toBe(true);
        expect(result.warnings?.[0]).toContain('not mapped to variant');
        expect(mockPrisma.hamperVariant.findFirst).not.toHaveBeenCalledWith({
            where: { hamperId: 'hamper-baby', etsySku: 'DUP-SKU' },
        });
    });

    it('falls through to priority 2 when priority 1 is depleted', async () => {
        const inventoryLotUpdateCalls: Array<{ where: { id: string }; data: { remaining: { decrement: number } } }> = [];

        // Mock for pre-check phase (uses global prisma)
        const variantMappingsData = [
            {
                variantId: 'var-boy',
                categoryId: 'cat-rattle',
                productId: 'prod-blue',
                priority: 1,
                category: { id: 'cat-rattle', name: 'Rattle' },
                product: {
                    id: 'prod-blue',
                    name: 'Blue Rattle',
                    lots: [{ id: 'lot-blue', remaining: 1, unitCost: 2.0, receivedAt: new Date(), expiresAt: null }],
                },
            },
            {
                variantId: 'var-boy',
                categoryId: 'cat-rattle',
                productId: 'prod-grey',
                priority: 2,
                category: { id: 'cat-rattle', name: 'Rattle' },
                product: {
                    id: 'prod-grey',
                    name: 'Grey Rattle',
                    lots: [{ id: 'lot-grey', remaining: 10, unitCost: 1.5, receivedAt: new Date(), expiresAt: null }],
                },
            },
        ];

        mockPrisma.hamperVariantMapping.findMany.mockResolvedValue(variantMappingsData);

        mockPrisma.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
            const mockTx = {
                sale: {
                    create: vi.fn().mockResolvedValue({
                        id: 'sale-1',
                        etsyOrderId: '12348',
                        grossRevenue: 60,
                        totalCost: 10,
                        margin: 40,
                        netRevenue: 50,
                        etsyFees: 10,
                        packagingOverhead: 0,
                    }),
                },
                inventoryLot: {
                    update: vi.fn().mockImplementation((args) => {
                        inventoryLotUpdateCalls.push(args);
                        return Promise.resolve({});
                    }),
                },
                componentCategory: {
                    findUnique: vi.fn().mockResolvedValue({
                        id: 'cat-rattle',
                        name: 'Rattle',
                        products: [
                            {
                                id: 'prod-blue',
                                name: 'Blue Rattle',
                                lots: [{ id: 'lot-blue', remaining: 1, unitCost: 2.0, receivedAt: new Date(), expiresAt: null }],
                            },
                            {
                                id: 'prod-grey',
                                name: 'Grey Rattle',
                                lots: [{ id: 'lot-grey', remaining: 10, unitCost: 1.5, receivedAt: new Date(), expiresAt: null }],
                            },
                        ],
                    }),
                },
                hamperVariantMapping: {
                    findMany: vi.fn().mockResolvedValue(variantMappingsData),
                },
            };
            return callback(mockTx);
        });

        mockEtsyClient.getReceipts.mockResolvedValue({
            receipts: [
                {
                    receipt_id: 12348,
                    name: 'Test Buyer',
                    is_paid: true,
                    is_shipped: false,
                    create_timestamp: Math.floor(Date.now() / 1000),
                    grandtotal: { amount: 6000, divisor: 100 },
                    subtotal: { amount: 5000, divisor: 100 },
                    total_shipping_cost: { amount: 1000, divisor: 100 },
                    transactions: [
                        {
                            transaction_id: 4,
                            listing_id: 200,
                            title: 'Baby Hamper - Boy',
                            quantity: 3, // Needs 3, priority 1 has only 1
                            price: { amount: 2000, divisor: 100 },
                            sku: 'BOY-SKU',
                            product_id: 888,
                            variations: [{ property_id: 1, value: 'Boy' }],
                        },
                    ],
                },
            ],
        });

        mockPrisma.sale.findFirst.mockResolvedValue(null);
        mockPrisma.hamper.findFirst.mockResolvedValue({
            id: 'hamper-baby',
            name: 'Baby Hamper',
            etsyListingId: '200',
            hasVariants: true,
            requirements: [
                {
                    id: 'req-rattle',
                    categoryId: 'cat-rattle',
                    quantity: 1,
                    isOptional: false,
                    category: { id: 'cat-rattle', name: 'Rattle', pickRule: 'FIFO' },
                },
            ],
            variants: [
                { id: 'var-boy', name: 'Boy', etsySku: 'BOY-SKU', etsyProductId: '888' },
            ],
        });
        mockPrisma.hamperVariant.findFirst.mockResolvedValue({
            id: 'var-boy',
            hamperId: 'hamper-baby',
            name: 'Boy',
            etsySku: 'BOY-SKU',
            etsyProductId: '888',
        });
        mockPrisma.etsyFeeConfig.findFirst.mockResolvedValue({
            id: 'fee-1',
            transactionFee: 0.065,
            regulatoryFee: 0.003,
            paymentFeePercent: 0.04,
            paymentFeeFixed: 0.2,
            vatRate: 0.2,
            listingFee: 0.15,
        });
        mockPrisma.packagingOverhead.findMany.mockResolvedValue([]);

        const result = await importOrder(12348, 5.0);

        expect(result.success).toBe(true);
        expect(inventoryLotUpdateCalls).toHaveLength(2);
        // First: all from priority 1 (Blue Rattle - only 1 available)
        expect(inventoryLotUpdateCalls[0]).toEqual({
            where: { id: 'lot-blue' },
            data: { remaining: { decrement: 1 } },
        });
        // Second: remainder from priority 2 (Grey Rattle - need 2 more)
        expect(inventoryLotUpdateCalls[1]).toEqual({
            where: { id: 'lot-grey' },
            data: { remaining: { decrement: 2 } },
        });
    });

    it('returns verbose shortages across multiple categories', async () => {
        mockEtsyClient.getReceipts.mockResolvedValue({
            receipts: [
                {
                    receipt_id: 5001,
                    name: 'Test Buyer',
                    is_paid: true,
                    is_shipped: false,
                    create_timestamp: Math.floor(Date.now() / 1000),
                    grandtotal: { amount: 3000, divisor: 100 },
                    subtotal: { amount: 2500, divisor: 100 },
                    total_shipping_cost: { amount: 500, divisor: 100 },
                    transactions: [
                        {
                            transaction_id: 1,
                            listing_id: 100,
                            title: 'Test Hamper',
                            quantity: 1,
                            price: { amount: 2500, divisor: 100 },
                            sku: null,
                            product_id: null,
                            variations: [],
                        },
                    ],
                },
            ],
        });

        mockPrisma.sale.findFirst.mockResolvedValue(null);
        mockPrisma.hamper.findFirst.mockResolvedValue({
            id: 'hamper-1',
            name: 'Test Hamper',
            etsyListingId: '100',
            hasVariants: false,
            requirements: [
                {
                    id: 'req-a',
                    categoryId: 'cat-a',
                    quantity: 2,
                    isOptional: false,
                    category: { id: 'cat-a', name: 'Category A', pickRule: 'FIFO' },
                },
                {
                    id: 'req-b',
                    categoryId: 'cat-b',
                    quantity: 1,
                    isOptional: false,
                    category: { id: 'cat-b', name: 'Category B', pickRule: 'FIFO' },
                },
            ],
            variants: [],
        });
        mockPrisma.etsyFeeConfig.findFirst.mockResolvedValue({
            id: 'fee-1',
            transactionFee: 0.065,
            regulatoryFee: 0.003,
            paymentFeePercent: 0.04,
            paymentFeeFixed: 0.2,
            vatRate: 0.2,
            listingFee: 0.15,
        });
        mockPrisma.packagingOverhead.findMany.mockResolvedValue([]);

        mockPrisma.componentCategory.findUnique.mockImplementation(({ where }: any) => {
            if (where?.id === 'cat-a') {
                return Promise.resolve({
                    id: 'cat-a',
                    name: 'Category A',
                    products: [
                        {
                            id: 'prod-a',
                            name: 'Product A',
                            lots: [
                                { id: 'lot-a', remaining: 1, unitCost: 1.0, receivedAt: new Date(), expiresAt: null },
                            ],
                        },
                    ],
                });
            }
            if (where?.id === 'cat-b') {
                return Promise.resolve({
                    id: 'cat-b',
                    name: 'Category B',
                    products: [
                        {
                            id: 'prod-b',
                            name: 'Product B',
                            lots: [],
                        },
                    ],
                });
            }
            return Promise.resolve(null);
        });

        let thrown: any;
        try {
            await importOrder(5001, 3.5);
        } catch (err) {
            thrown = err;
        }

        expect(thrown).toBeTruthy();
        expect(thrown.status).toBe(400);
        expect(thrown.body.code).toBe('insufficient_stock');
        expect(thrown.body.shortages).toHaveLength(2);

        const shortages = thrown.body.shortages as any[];
        const shortageA = shortages.find((s) => s.key === 'cat-a-all');
        const shortageB = shortages.find((s) => s.key === 'cat-b-all');

        expect(shortageA).toMatchObject({
            categoryId: 'cat-a',
            categoryName: 'Category A',
            need: 2,
            have: 1,
            missing: 1,
            productName: 'Product A',
        });
        expect(shortageB).toMatchObject({
            categoryId: 'cat-b',
            categoryName: 'Category B',
            need: 1,
            have: 0,
            missing: 1,
        });
        expect(String(thrown.body.message)).toContain('Category A');
        expect(String(thrown.body.message)).toContain('need 2, have 1');
        expect(String(thrown.body.message)).toContain('Category B');
    });

    it('imports successfully using substitutions across multiple categories', async () => {
        const inventoryLotUpdateCalls: Array<{ where: { id: string }; data: { remaining: { decrement: number } } }> = [];

        mockPrisma.$transaction.mockImplementation(async (callback: (tx: any) => Promise<unknown>) => {
            const mockTx = {
                sale: {
                    create: vi.fn().mockResolvedValue({
                        id: 'sale-5002',
                        etsyOrderId: '5002',
                        grossRevenue: 30,
                        totalCost: 5,
                        margin: 20,
                        netRevenue: 25,
                        etsyFees: 5,
                        packagingOverhead: 0,
                    }),
                },
                inventoryLot: {
                    findUnique: vi.fn().mockImplementation(({ where }: any) => {
                        if (where?.id === 'lot-a1') {
                            return Promise.resolve({ id: 'lot-a1', remaining: 10, unitCost: 1.25 });
                        }
                        if (where?.id === 'lot-b1') {
                            return Promise.resolve({ id: 'lot-b1', remaining: 10, unitCost: 0.5 });
                        }
                        return Promise.resolve(null);
                    }),
                    update: vi.fn().mockImplementation((args: any) => {
                        inventoryLotUpdateCalls.push(args);
                        return Promise.resolve({});
                    }),
                },
            };
            return callback(mockTx);
        });

        mockEtsyClient.getReceipts.mockResolvedValue({
            receipts: [
                {
                    receipt_id: 5002,
                    name: 'Test Buyer',
                    is_paid: true,
                    is_shipped: false,
                    create_timestamp: Math.floor(Date.now() / 1000),
                    grandtotal: { amount: 3000, divisor: 100 },
                    subtotal: { amount: 2500, divisor: 100 },
                    total_shipping_cost: { amount: 500, divisor: 100 },
                    transactions: [
                        {
                            transaction_id: 1,
                            listing_id: 100,
                            title: 'Test Hamper',
                            quantity: 1,
                            price: { amount: 2500, divisor: 100 },
                            sku: null,
                            product_id: null,
                            variations: [],
                        },
                    ],
                },
            ],
        });

        mockPrisma.sale.findFirst.mockResolvedValue(null);
        mockPrisma.hamper.findFirst.mockResolvedValue({
            id: 'hamper-1',
            name: 'Test Hamper',
            etsyListingId: '100',
            hasVariants: false,
            requirements: [
                {
                    id: 'req-a',
                    categoryId: 'cat-a',
                    quantity: 2,
                    isOptional: false,
                    category: { id: 'cat-a', name: 'Category A', pickRule: 'FIFO' },
                },
                {
                    id: 'req-b',
                    categoryId: 'cat-b',
                    quantity: 1,
                    isOptional: false,
                    category: { id: 'cat-b', name: 'Category B', pickRule: 'FIFO' },
                },
            ],
            variants: [],
        });
        mockPrisma.etsyFeeConfig.findFirst.mockResolvedValue({
            id: 'fee-1',
            transactionFee: 0.065,
            regulatoryFee: 0.003,
            paymentFeePercent: 0.04,
            paymentFeeFixed: 0.2,
            vatRate: 0.2,
            listingFee: 0.15,
        });
        mockPrisma.packagingOverhead.findMany.mockResolvedValue([]);

        mockPrisma.inventoryLot.findMany.mockResolvedValue([
            {
                id: 'lot-a1',
                remaining: 10,
                product: { id: 'prod-a', name: 'Product A', categoryId: 'cat-a' },
            },
            {
                id: 'lot-b1',
                remaining: 10,
                product: { id: 'prod-b', name: 'Product B', categoryId: 'cat-b' },
            },
        ] as any);

        const result = await importOrder(5002, 3.5, false, {
            'cat-a-all': [{ lotId: 'lot-a1', quantity: 2 }],
            'cat-b-all': [{ lotId: 'lot-b1', quantity: 1 }],
        });

        expect(result.success).toBe(true);
        expect(inventoryLotUpdateCalls).toHaveLength(2);
        expect(inventoryLotUpdateCalls).toEqual([
            { where: { id: 'lot-a1' }, data: { remaining: { decrement: 2 } } },
            { where: { id: 'lot-b1' }, data: { remaining: { decrement: 1 } } },
        ]);
    });

    it('rejects substitutions that do not cover the required quantity', async () => {
        mockEtsyClient.getReceipts.mockResolvedValue({
            receipts: [
                {
                    receipt_id: 5003,
                    name: 'Test Buyer',
                    is_paid: true,
                    is_shipped: false,
                    create_timestamp: Math.floor(Date.now() / 1000),
                    grandtotal: { amount: 3000, divisor: 100 },
                    subtotal: { amount: 2500, divisor: 100 },
                    total_shipping_cost: { amount: 500, divisor: 100 },
                    transactions: [
                        {
                            transaction_id: 1,
                            listing_id: 100,
                            title: 'Test Hamper',
                            quantity: 1,
                            price: { amount: 2500, divisor: 100 },
                            sku: null,
                            product_id: null,
                            variations: [],
                        },
                    ],
                },
            ],
        });

        mockPrisma.sale.findFirst.mockResolvedValue(null);
        mockPrisma.hamper.findFirst.mockResolvedValue({
            id: 'hamper-1',
            name: 'Test Hamper',
            etsyListingId: '100',
            hasVariants: false,
            requirements: [
                {
                    id: 'req-a',
                    categoryId: 'cat-a',
                    quantity: 2,
                    isOptional: false,
                    category: { id: 'cat-a', name: 'Category A', pickRule: 'FIFO' },
                },
            ],
            variants: [],
        });
        mockPrisma.etsyFeeConfig.findFirst.mockResolvedValue({
            id: 'fee-1',
            transactionFee: 0.065,
            regulatoryFee: 0.003,
            paymentFeePercent: 0.04,
            paymentFeeFixed: 0.2,
            vatRate: 0.2,
            listingFee: 0.15,
        });
        mockPrisma.packagingOverhead.findMany.mockResolvedValue([]);

        mockPrisma.inventoryLot.findMany.mockResolvedValue([
            {
                id: 'lot-a1',
                remaining: 10,
                product: { id: 'prod-a', name: 'Product A', categoryId: 'cat-a' },
            },
        ] as any);

        await expect(
            importOrder(5003, 3.5, false, {
                'cat-a-all': [{ lotId: 'lot-a1', quantity: 1 }], // Need 2
            })
        ).rejects.toMatchObject({
            status: 400,
        });
    });

    it('splits substituted quantity across multiple lots in the same category', async () => {
        const inventoryLotUpdateCalls: Array<{ where: { id: string }; data: { remaining: { decrement: number } } }> = [];

        mockPrisma.$transaction.mockImplementation(async (callback: (tx: any) => Promise<unknown>) => {
            const mockTx = {
                sale: {
                    create: vi.fn().mockResolvedValue({
                        id: 'sale-5004',
                        etsyOrderId: '5004',
                        grossRevenue: 30,
                        totalCost: 5,
                        margin: 20,
                        netRevenue: 25,
                        etsyFees: 5,
                        packagingOverhead: 0,
                    }),
                },
                inventoryLot: {
                    findUnique: vi.fn().mockImplementation(({ where }: any) => {
                        if (where?.id === 'lot-a1') {
                            return Promise.resolve({ id: 'lot-a1', remaining: 10, unitCost: 1.25 });
                        }
                        if (where?.id === 'lot-a2') {
                            return Promise.resolve({ id: 'lot-a2', remaining: 10, unitCost: 1.5 });
                        }
                        return Promise.resolve(null);
                    }),
                    update: vi.fn().mockImplementation((args: any) => {
                        inventoryLotUpdateCalls.push(args);
                        return Promise.resolve({});
                    }),
                },
            };
            return callback(mockTx);
        });

        mockEtsyClient.getReceipts.mockResolvedValue({
            receipts: [
                {
                    receipt_id: 5004,
                    name: 'Test Buyer',
                    is_paid: true,
                    is_shipped: false,
                    create_timestamp: Math.floor(Date.now() / 1000),
                    grandtotal: { amount: 3000, divisor: 100 },
                    subtotal: { amount: 2500, divisor: 100 },
                    total_shipping_cost: { amount: 500, divisor: 100 },
                    transactions: [
                        {
                            transaction_id: 1,
                            listing_id: 100,
                            title: 'Test Hamper',
                            quantity: 1,
                            price: { amount: 2500, divisor: 100 },
                            sku: null,
                            product_id: null,
                            variations: [],
                        },
                    ],
                },
            ],
        });

        mockPrisma.sale.findFirst.mockResolvedValue(null);
        mockPrisma.hamper.findFirst.mockResolvedValue({
            id: 'hamper-1',
            name: 'Test Hamper',
            etsyListingId: '100',
            hasVariants: false,
            requirements: [
                {
                    id: 'req-a',
                    categoryId: 'cat-a',
                    quantity: 2,
                    isOptional: false,
                    category: { id: 'cat-a', name: 'Category A', pickRule: 'FIFO' },
                },
            ],
            variants: [],
        });
        mockPrisma.etsyFeeConfig.findFirst.mockResolvedValue({
            id: 'fee-1',
            transactionFee: 0.065,
            regulatoryFee: 0.003,
            paymentFeePercent: 0.04,
            paymentFeeFixed: 0.2,
            vatRate: 0.2,
            listingFee: 0.15,
        });
        mockPrisma.packagingOverhead.findMany.mockResolvedValue([]);

        mockPrisma.inventoryLot.findMany.mockResolvedValue([
            {
                id: 'lot-a1',
                remaining: 10,
                product: { id: 'prod-a', name: 'Product A', categoryId: 'cat-a' },
            },
            {
                id: 'lot-a2',
                remaining: 10,
                product: { id: 'prod-a', name: 'Product A', categoryId: 'cat-a' },
            },
        ] as any);

        const result = await importOrder(5004, 3.5, false, {
            'cat-a-all': [
                { lotId: 'lot-a1', quantity: 1 },
                { lotId: 'lot-a2', quantity: 1 },
            ],
        });

        expect(result.success).toBe(true);
        expect(inventoryLotUpdateCalls).toHaveLength(2);
        expect(inventoryLotUpdateCalls).toEqual([
            { where: { id: 'lot-a1' }, data: { remaining: { decrement: 1 } } },
            { where: { id: 'lot-a2' }, data: { remaining: { decrement: 1 } } },
        ]);
    });

    it('rejects substitutions when a selected lot is in the wrong category', async () => {
        mockEtsyClient.getReceipts.mockResolvedValue({
            receipts: [
                {
                    receipt_id: 5005,
                    name: 'Test Buyer',
                    is_paid: true,
                    is_shipped: false,
                    create_timestamp: Math.floor(Date.now() / 1000),
                    grandtotal: { amount: 3000, divisor: 100 },
                    subtotal: { amount: 2500, divisor: 100 },
                    total_shipping_cost: { amount: 500, divisor: 100 },
                    transactions: [
                        {
                            transaction_id: 1,
                            listing_id: 100,
                            title: 'Test Hamper',
                            quantity: 1,
                            price: { amount: 2500, divisor: 100 },
                            sku: null,
                            product_id: null,
                            variations: [],
                        },
                    ],
                },
            ],
        });

        mockPrisma.sale.findFirst.mockResolvedValue(null);
        mockPrisma.hamper.findFirst.mockResolvedValue({
            id: 'hamper-1',
            name: 'Test Hamper',
            etsyListingId: '100',
            hasVariants: false,
            requirements: [
                {
                    id: 'req-a',
                    categoryId: 'cat-a',
                    quantity: 1,
                    isOptional: false,
                    category: { id: 'cat-a', name: 'Category A', pickRule: 'FIFO' },
                },
            ],
            variants: [],
        });
        mockPrisma.etsyFeeConfig.findFirst.mockResolvedValue({
            id: 'fee-1',
            transactionFee: 0.065,
            regulatoryFee: 0.003,
            paymentFeePercent: 0.04,
            paymentFeeFixed: 0.2,
            vatRate: 0.2,
            listingFee: 0.15,
        });
        mockPrisma.packagingOverhead.findMany.mockResolvedValue([]);

        mockPrisma.inventoryLot.findMany.mockResolvedValue([
            {
                id: 'lot-wrong',
                remaining: 10,
                product: { id: 'prod-b', name: 'Product B', categoryId: 'cat-b' }, // Wrong category
            },
        ] as any);

        await expect(
            importOrder(5005, 3.5, false, {
                'cat-a-all': [{ lotId: 'lot-wrong', quantity: 1 }],
            })
        ).rejects.toMatchObject({
            status: 400,
        });
    });
});
