import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing the module
vi.mock('../../lib/prisma', () => ({
    prisma: {
        sale: { findFirst: vi.fn(), create: vi.fn() },
        hamper: { findFirst: vi.fn() },
        hamperVariant: { findFirst: vi.fn() },
        etsyFeeConfig: { findFirst: vi.fn() },
        packagingOverhead: { findMany: vi.fn() },
        componentCategory: { findUnique: vi.fn() },
        hamperVariantMapping: { findUnique: vi.fn(), findMany: vi.fn() },
        inventoryLot: { update: vi.fn() },
        $transaction: vi.fn(),
    },
}));

vi.mock('../../lib/etsyClient', () => ({
    etsyClient: {
        getReceipts: vi.fn(),
    },
}));

vi.mock('../../lib/etsy/debugLogger', () => ({
    logWorkflow: vi.fn(),
    startLogSession: vi.fn().mockReturnValue('test-session'),
    endLogSession: vi.fn(),
}));

import { prisma } from '../../lib/prisma';
import { etsyClient } from '../../lib/etsyClient';
import { importOrder } from '../../lib/etsy/sync/orders';

const mockPrisma = prisma as unknown as {
    sale: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
    hamper: { findFirst: ReturnType<typeof vi.fn> };
    hamperVariant: { findFirst: ReturnType<typeof vi.fn> };
    etsyFeeConfig: { findFirst: ReturnType<typeof vi.fn> };
    packagingOverhead: { findMany: ReturnType<typeof vi.fn> };
    componentCategory: { findUnique: ReturnType<typeof vi.fn> };
    hamperVariantMapping: { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
    inventoryLot: { update: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
};

const mockEtsyClient = etsyClient as unknown as {
    getReceipts: ReturnType<typeof vi.fn>;
};

describe('Order Import - Stock Decrement', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('decrements inventoryLot.remaining when importing an order', async () => {
        // Track calls to inventoryLot.update inside transaction
        const inventoryLotUpdateCalls: Array<{ where: { id: string }; data: { remaining: { decrement: number } } }> = [];

        // Setup mock transaction that captures lot updates
        mockPrisma.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
            const mockTx = {
                sale: {
                    create: vi.fn().mockResolvedValue({
                        id: 'sale-1',
                        etsyOrderId: '12345',
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

        const result = await importOrder(12345, 3.5);

        expect(result.success).toBe(true);
        expect(inventoryLotUpdateCalls).toHaveLength(1);
        expect(inventoryLotUpdateCalls[0]).toEqual({
            where: { id: 'lot-1' },
            data: { remaining: { decrement: 1 } },
        });
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
});
