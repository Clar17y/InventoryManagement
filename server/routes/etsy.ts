import { Router } from 'express';
import crypto from 'crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { etsyClient, etsyAuth } from '../lib/etsyClient';
import { MOCK_SHOP } from '../lib/etsy/fixtures';
import { fetchAllActiveListings } from '../lib/etsy/pagination';

const isMockMode = () => process.env.ETSY_MODE === 'mock';

const router = Router();

// Store PKCE code verifier temporarily (in production, use session or Redis)
const codeVerifiers = new Map<string, { verifier: string; expiresAt: number }>();

/**
 * Generate PKCE code verifier and challenge
 */
function generatePKCE() {
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto
        .createHash('sha256')
        .update(verifier)
        .digest('base64url');
    return { verifier, challenge };
}

/**
 * GET /api/etsy/status
 * Check Etsy connection status
 */
router.get('/status', async (req, res) => {
    try {
        // In mock mode, always return connected with mock shop
        if (isMockMode()) {
            return res.json({
                connected: true,
                shopId: String(MOCK_SHOP.shop_id),
                shopName: MOCK_SHOP.shop_name,
                mockMode: true,
            });
        }

        const credentials = await etsyAuth.getCredentials();

        if (!credentials) {
            return res.json({ connected: false });
        }

        return res.json({
            connected: true,
            shopId: credentials.shopId,
            shopName: credentials.shopName,
            expiresAt: credentials.expiresAt,
        });
    } catch (error) {
        console.warn('Etsy credentials invalid/expired, treating as disconnected:', error);
        return res.json({ connected: false });
    }
});

/**
 * GET /api/etsy/auth
 * Initiate OAuth flow - returns URL to redirect user to
 */
router.get('/auth', (req, res) => {
    try {
        // In mock mode, no OAuth needed - already "connected"
        if (isMockMode()) {
            return res.json({
                mockMode: true,
                message: 'Mock mode active - no OAuth required. Already connected.',
            });
        }

        const apiKey = process.env.ETSY_API_KEY;
        const redirectUri = process.env.ETSY_REDIRECT_URI;

        if (!apiKey || !redirectUri) {
            return res.status(500).json({
                error: 'Etsy API not configured. Set ETSY_API_KEY and ETSY_REDIRECT_URI.'
            });
        }

        // Generate PKCE challenge
        const { verifier, challenge } = generatePKCE();

        // Generate state for CSRF protection
        const state = crypto.randomBytes(16).toString('hex');

        // Store verifier temporarily (expires in 10 minutes)
        codeVerifiers.set(state, {
            verifier,
            expiresAt: Date.now() + 10 * 60 * 1000,
        });

        // Cleanup old verifiers
        for (const [key, value] of codeVerifiers.entries()) {
            if (value.expiresAt < Date.now()) {
                codeVerifiers.delete(key);
            }
        }

        // Scopes needed for inventory management and reading orders
        const scopes = [
            'listings_r',     // Read listings
            'listings_w',     // Write listings (update inventory)
            'transactions_r', // Read transactions/orders
            'shops_r',        // Read shop info
        ].join('%20');

        const authUrl = `https://www.etsy.com/oauth/connect?` +
            `response_type=code&` +
            `client_id=${apiKey}&` +
            `redirect_uri=${encodeURIComponent(redirectUri)}&` +
            `scope=${scopes}&` +
            `state=${state}&` +
            `code_challenge=${challenge}&` +
            `code_challenge_method=S256`;

        res.json({ authUrl, state });
    } catch (error) {
        console.error('Error initiating Etsy auth:', error);
        res.status(500).json({ error: 'Failed to initiate Etsy authentication' });
    }
});

/**
 * GET /api/etsy/callback
 * OAuth callback - exchange code for tokens
 */
router.get('/callback', async (req, res) => {
    try {
        const { code, state, error, error_description } = req.query;

        if (error) {
            return res.redirect(`/?etsy_error=${encodeURIComponent(error_description as string || error as string)}`);
        }

        if (!code || !state) {
            return res.redirect('/?etsy_error=Missing+code+or+state');
        }

        // Retrieve and validate code verifier
        const stored = codeVerifiers.get(state as string);
        if (!stored || stored.expiresAt < Date.now()) {
            codeVerifiers.delete(state as string);
            return res.redirect('/?etsy_error=Invalid+or+expired+state');
        }

        const codeVerifier = stored.verifier;
        codeVerifiers.delete(state as string);

        // Exchange code for tokens (uses auth functions, not client interface)
        const tokens = await etsyAuth.exchangeCodeForTokens(code as string, codeVerifier);

        // Extract user ID from access token (format: USER_ID.TOKEN)
        const userId = tokens.access_token.split('.')[0];

        // Get shop info
        const apiKey = process.env.ETSY_API_KEY!;
        const sharedSecret = process.env.ETSY_SHARED_SECRET || '';
        const xApiKey = sharedSecret ? `${apiKey}:${sharedSecret}` : apiKey;
        const shopResponse = await fetch(
            `https://api.etsy.com/v3/application/users/${userId}/shops`,
            {
                headers: {
                    // access_token already includes userId prefix (format: userId.token)
                    'Authorization': `Bearer ${tokens.access_token}`,
                    'x-api-key': xApiKey,
                },
            }
        );

        if (!shopResponse.ok) {
            const errorText = await shopResponse.text();
            console.error('Failed to get shop info:', shopResponse.status, errorText);
            return res.redirect('/?etsy_error=Failed+to+get+shop+info');
        }

        const shopData = await shopResponse.json();
        // API returns shop directly, not wrapped in results array
        const shop = shopData.shop_id ? shopData : shopData.results?.[0];

        if (!shop) {
            console.error('No shop found. Response:', shopData);
            return res.redirect('/?etsy_error=No+shop+found+for+this+account');
        }

        // Check if this should be the app owner and/or default
        const [existingCount, hasAppOwner, hasDefault] = await Promise.all([
            prisma.etsyCredentials.count(),
            prisma.etsyCredentials.findFirst({ where: { isAppOwner: true } }),
            prisma.etsyCredentials.findFirst({ where: { isDefault: true } }),
        ]);
        const isFirstAccount = existingCount === 0;
        const shouldBeAppOwner = isFirstAccount || !hasAppOwner;
        const shouldBeDefault = isFirstAccount || !hasDefault;

        // Upsert credentials - allows reconnecting same user or adding new users
        await prisma.etsyCredentials.upsert({
            where: { userId },
            create: {
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token,
                expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
                shopId: String(shop.shop_id),
                shopName: shop.shop_name,
                userId: userId,
                loginName: shop.login_name || null,
                isDefault: shouldBeDefault,
                isAppOwner: shouldBeAppOwner,
            },
            update: {
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token,
                expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
                shopName: shop.shop_name,
                loginName: shop.login_name || null,
                // If no app owner exists, make this one the app owner
                ...(shouldBeAppOwner && { isAppOwner: true }),
                ...(shouldBeDefault && { isDefault: true }),
            },
        });

        // Redirect to hampers page with success message
        res.redirect('/hampers?etsy_connected=true');
    } catch (error) {
        console.error('Error in Etsy callback:', error);
        res.redirect(`/?etsy_error=${encodeURIComponent('Failed to complete authentication')}`);
    }
});

/**
 * POST /api/etsy/disconnect
 * Disconnect from Etsy (clear stored credentials)
 */
router.post('/disconnect', async (req, res) => {
    try {
        // In mock mode, just acknowledge (can't really disconnect mock)
        if (isMockMode()) {
            return res.json({ success: true, mockMode: true });
        }

        await etsyClient.disconnect();
        res.json({ success: true });
    } catch (error) {
        console.error('Error disconnecting from Etsy:', error);
        res.status(500).json({ error: 'Failed to disconnect from Etsy' });
    }
});

// =============================================================================
// Account Management Routes
// =============================================================================

/**
 * GET /api/etsy/accounts
 * List all connected Etsy accounts
 */
router.get('/accounts', async (req, res) => {
    try {
        const accounts = await prisma.etsyCredentials.findMany({
            select: {
                userId: true,
                shopId: true,
                shopName: true,
                loginName: true,
                isDefault: true,
                isAppOwner: true,
                expiresAt: true,
            },
            orderBy: [
                { isDefault: 'desc' },
                { createdAt: 'asc' },
            ],
        });
        res.json({ accounts });
    } catch (error) {
        console.error('Error fetching Etsy accounts:', error);
        res.status(500).json({ error: 'Failed to fetch accounts' });
    }
});

/**
 * POST /api/etsy/accounts/:userId/set-default
 * Set an account as the default for API calls
 */
router.post('/accounts/:userId/set-default', async (req, res) => {
    try {
        const { userId } = req.params;

        // Verify account exists
        const account = await prisma.etsyCredentials.findUnique({ where: { userId } });
        if (!account) {
            return res.status(404).json({ error: 'Account not found' });
        }

        // Use transaction to ensure only one default
        await prisma.$transaction([
            prisma.etsyCredentials.updateMany({
                where: { isDefault: true },
                data: { isDefault: false },
            }),
            prisma.etsyCredentials.update({
                where: { userId },
                data: { isDefault: true },
            }),
        ]);

        res.json({ success: true });
    } catch (error) {
        console.error('Error setting default account:', error);
        res.status(500).json({ error: 'Failed to set default account' });
    }
});

/**
 * DELETE /api/etsy/accounts/:userId
 * Remove an Etsy account
 */
router.delete('/accounts/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        const account = await prisma.etsyCredentials.findUnique({ where: { userId } });
        if (!account) {
            return res.status(404).json({ error: 'Account not found' });
        }

        await prisma.etsyCredentials.delete({ where: { userId } });

        // If we deleted the default, make another account default
        if (account.isDefault) {
            const nextAccount = await prisma.etsyCredentials.findFirst();
            if (nextAccount) {
                await prisma.etsyCredentials.update({
                    where: { id: nextAccount.id },
                    data: { isDefault: true },
                });
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error removing Etsy account:', error);
        res.status(500).json({ error: 'Failed to remove account' });
    }
});

// =============================================================================
// Provisional Users Routes (Etsy API management)
// =============================================================================

/**
 * GET /api/etsy/provisional-users
 * List registered provisional users from Etsy
 */
router.get('/provisional-users', async (req, res) => {
    try {
        // Use app owner's credentials to call Etsy API
        const appOwner = await prisma.etsyCredentials.findFirst({
            where: { isAppOwner: true },
        });

        if (!appOwner) {
            return res.status(400).json({ error: 'App owner account not connected' });
        }

        const apiKey = process.env.ETSY_API_KEY!;
        const sharedSecret = process.env.ETSY_SHARED_SECRET || '';
        const xApiKey = sharedSecret ? `${apiKey}:${sharedSecret}` : apiKey;

        // Try openapi.etsy.com (per Etsy documentation)
        const url = 'https://openapi.etsy.com/v3/application/provisional-users';
        console.log('Fetching provisional users from:', url);
        console.log('Using userId:', appOwner.userId);

        const response = await fetch(url, {
            headers: {
                'x-api-key': xApiKey,
                'Authorization': `Bearer ${appOwner.accessToken}`,
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Failed to fetch provisional users:', response.status, errorText);
            console.error('Request headers:', { 'x-api-key': xApiKey.substring(0, 10) + '...', userId: appOwner.userId });
            return res.status(response.status).json({
                error: 'Failed to fetch provisional users from Etsy',
                status: response.status,
                details: errorText,
            });
        }

        const data = await response.json();
        res.json({ provisionalUsers: data.results || [] });
    } catch (error) {
        console.error('Error fetching provisional users:', error);
        res.status(500).json({ error: 'Failed to fetch provisional users' });
    }
});

/**
 * POST /api/etsy/provisional-users
 * Register a user as a provisional user with Etsy
 * Body: { loginName: string }
 */
router.post('/provisional-users', async (req, res) => {
    try {
        const { loginName } = req.body;

        if (!loginName || typeof loginName !== 'string') {
            return res.status(400).json({ error: 'loginName is required' });
        }

        const appOwner = await prisma.etsyCredentials.findFirst({
            where: { isAppOwner: true },
        });

        if (!appOwner) {
            return res.status(400).json({ error: 'App owner account not connected' });
        }

        const apiKey = process.env.ETSY_API_KEY!;
        const sharedSecret = process.env.ETSY_SHARED_SECRET || '';
        const xApiKey = sharedSecret ? `${apiKey}:${sharedSecret}` : apiKey;

        const response = await fetch(
            `https://openapi.etsy.com/v3/application/provisional-users?login_name=${encodeURIComponent(loginName)}`,
            {
                method: 'POST',
                headers: {
                    'x-api-key': xApiKey,
                    'Authorization': `Bearer ${appOwner.accessToken}`,
                },
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Failed to add provisional user:', response.status, errorText);
            return res.status(response.status).json({
                error: 'Failed to add provisional user',
                details: errorText,
            });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error adding provisional user:', error);
        res.status(500).json({ error: 'Failed to add provisional user' });
    }
});

/**
 * DELETE /api/etsy/provisional-users/:userId
 * Remove a provisional user from Etsy
 */
router.delete('/provisional-users/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        const appOwner = await prisma.etsyCredentials.findFirst({
            where: { isAppOwner: true },
        });

        if (!appOwner) {
            return res.status(400).json({ error: 'App owner account not connected' });
        }

        const apiKey = process.env.ETSY_API_KEY!;
        const sharedSecret = process.env.ETSY_SHARED_SECRET || '';
        const xApiKey = sharedSecret ? `${apiKey}:${sharedSecret}` : apiKey;

        const response = await fetch(
            `https://openapi.etsy.com/v3/application/provisional-users/${userId}`,
            {
                method: 'DELETE',
                headers: {
                    'x-api-key': xApiKey,
                    'Authorization': `Bearer ${appOwner.accessToken}`,
                },
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Failed to remove provisional user:', response.status, errorText);
            return res.status(response.status).json({ error: 'Failed to remove provisional user' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error removing provisional user:', error);
        res.status(500).json({ error: 'Failed to remove provisional user' });
    }
});

/**
 * GET /api/etsy/listings
 * Get all active listings from Etsy
 */
router.get('/listings', async (req, res) => {
    try {
        const listings = await fetchAllActiveListings(etsyClient);
        const count = listings.length;

        // Fetch inventory for all listings in a single batch call
        const listingIds = listings.map(l => l.listing_id);
        const listingsWithInventory = await etsyClient.getListingsByListingIds(listingIds, ['Inventory']);

        res.json({ listings: listingsWithInventory, count });
    } catch (error) {
        console.error('Error fetching Etsy listings:', error);
        res.status(500).json({ error: 'Failed to fetch Etsy listings' });
    }
});

/**
 * POST /api/etsy/import
 * Import Etsy listings as Hampers
 */
router.post('/import', async (req, res) => {
    try {
        const listings = await fetchAllActiveListings(etsyClient);

        // Pre-fetch all inventories in a single batch call
        const listingIds = listings.map(l => l.listing_id);
        const listingsWithInventory = await etsyClient.getListingsByListingIds(listingIds, ['Inventory']);
        const inventoryMap = new Map(
            listingsWithInventory
                .filter(l => l.inventory)
                .map(l => [l.listing_id, l.inventory!])
        );

        const results = {
            created: 0,
            updated: 0,
            skipped: 0,
            errors: [] as string[],
        };

        const normalizeSku = (sku: unknown): string | null => {
            if (typeof sku !== 'string') return null;
            const trimmed = sku.trim();
            return trimmed.length > 0 ? trimmed : null;
        };

        const getVariantNameFromPropertyValues = (product: { property_values?: Array<{ values?: string[] }> }): string | null => {
            const name = (product.property_values ?? [])
                .map(pv => (pv.values ?? []).filter(Boolean).join(', '))
                .filter(Boolean)
                .join(' / ')
                .trim();
            return name.length > 0 ? name : null;
        };

        for (const listing of listings) {
            try {
                const listingIdStr = String(listing.listing_id);

                // Check if hamper with this etsyListingId already exists
                const existing = await prisma.hamper.findFirst({
                    where: { etsyListingId: listingIdStr },
                });

                // Convert Etsy price (divisor format) to decimal
                const price = listing.price.amount / listing.price.divisor;

                // Get inventory from pre-fetched map
                let variants: Array<{ name: string; sku: string | null; productId: string; sellingPrice: number | null }> = [];
                let hasVariants = false;
                const inventory = inventoryMap.get(listing.listing_id);
                const inventoryLoaded = !!inventory;

                if (inventory) {
                    const products = (inventory.products ?? []).filter(p => !p.is_deleted);
                    hasVariants = products.length > 1;

                    variants = products.map(p => {
                        // Build variant name from property values
                        const nameFromProperties = getVariantNameFromPropertyValues(p);
                        const name = hasVariants ? (nameFromProperties ?? `Variant ${p.product_id}`) : 'Default';

                        // Convert empty string to null (Etsy returns "" for no SKU)
                        const sku = normalizeSku(p.sku);

                        // Get price from first offering
                        const offering = p.offerings?.[0];
                        const sellingPrice = offering?.price
                            ? offering.price.amount / offering.price.divisor
                            : null;

                        return {
                            name,
                            sku,
                            productId: String(p.product_id),
                            sellingPrice,
                        };
                    });
                }

                let hamperId: string;

                if (!existing) {
                    // Create hamper
                    const hamper = await prisma.hamper.create({
                        data: {
                            name: listing.title,
                            etsyListingId: listingIdStr,
                            sellingPrice: price,
                            hasVariants,
                            isActive: listing.state === 'active',
                        },
                    });
                    hamperId = hamper.id;
                    results.created++;
                } else {
                    hamperId = existing.id;

                    // If we could load inventory, refresh hasVariants and ensure variants exist.
                    // Never touches local requirements/mappings.
                    let didUpdate = false;

                    if (inventoryLoaded && existing.hasVariants !== hasVariants) {
                        await prisma.hamper.update({
                            where: { id: existing.id },
                            data: { hasVariants },
                        });
                        didUpdate = true;
                    }

                    if (inventoryLoaded && variants.length > 0) {
                        const localVariants = await prisma.hamperVariant.findMany({
                            where: { hamperId: existing.id, isActive: true },
                            select: {
                                id: true,
                                name: true,
                                etsySku: true,
                                etsyProductId: true,
                                sellingPrice: true,
                            },
                        });

                        const normalizeName = (name: string | null): string | null => {
                            const trimmed = (name ?? '').trim();
                            return trimmed.length > 0 ? trimmed.toLowerCase() : null;
                        };

                        for (const v of variants) {
                            const productId = v.productId;
                            const sku = v.sku;
                            const nameKey = normalizeName(v.name);

                            const candidate =
                                localVariants.find(lv => lv.etsyProductId === productId) ??
                                (sku ? localVariants.find(lv => lv.etsySku === sku) : undefined) ??
                                (nameKey
                                    ? (() => {
                                        const matches = localVariants.filter(lv => normalizeName(lv.name) === nameKey);
                                        return matches.length === 1 ? matches[0] : undefined;
                                    })()
                                    : undefined);

                            if (candidate) {
                                const updateData: Prisma.HamperVariantUpdateInput = {};

                                if (candidate.etsyProductId !== productId) updateData.etsyProductId = productId;
                                if (!candidate.etsySku && sku) updateData.etsySku = sku;
                                if (candidate.sellingPrice === null && v.sellingPrice !== null) updateData.sellingPrice = v.sellingPrice;

                                // If this looks like an auto placeholder name, update it to Etsy's name.
                                if (/^Variant\s+\d+$/i.test(candidate.name) && candidate.name !== v.name) {
                                    updateData.name = v.name;
                                }

                                if (Object.keys(updateData).length > 0) {
                                    try {
                                        await prisma.hamperVariant.update({
                                            where: { id: candidate.id },
                                            data: updateData,
                                        });
                                        didUpdate = true;
                                    } catch (variantErr) {
                                        // If we hit a unique constraint (e.g., productId already linked elsewhere), fall back to re-linking that variant.
                                        const existingByProductId = await prisma.hamperVariant.findFirst({
                                            where: { etsyProductId: productId },
                                            select: { id: true },
                                        });

                                        if (existingByProductId) {
                                            await prisma.hamperVariant.update({
                                                where: { id: existingByProductId.id },
                                                data: { hamperId: existing.id, isActive: true },
                                            });
                                            didUpdate = true;
                                        } else {
                                            console.warn(`Failed to update variant "${v.name}" for listing ${listingIdStr}:`, variantErr);
                                        }
                                    }
                                }
                            } else {
                                try {
                                    await prisma.hamperVariant.create({
                                        data: {
                                            hamperId: existing.id,
                                            name: v.name,
                                            sellingPrice: v.sellingPrice,
                                            etsySku: v.sku,
                                            etsyProductId: v.productId,
                                            isActive: true,
                                        },
                                    });
                                    didUpdate = true;
                                } catch (variantErr) {
                                    const existingBySku = v.sku
                                        ? await prisma.hamperVariant.findFirst({
                                            where: { etsySku: v.sku },
                                        })
                                        : null;
                                    const existingByProductId = v.productId
                                        ? await prisma.hamperVariant.findFirst({
                                            where: { etsyProductId: v.productId },
                                        })
                                        : null;
                                    const existingVariant = existingByProductId ?? existingBySku;

                                    if (existingVariant) {
                                        // Update orphaned variant to point to this hamper
                                        await prisma.hamperVariant.update({
                                            where: { id: existingVariant.id },
                                            data: { hamperId: existing.id, isActive: true },
                                        });
                                        didUpdate = true;
                                        console.warn(`Re-linked orphaned variant ${v.name} to hamper ${existing.id}`);
                                    } else {
                                        console.warn(`Skipping variant ${v.name}: ${variantErr instanceof Error ? variantErr.message : variantErr}`);
                                    }
                                }
                            }
                        }
                    }

                    if (didUpdate) {
                        results.updated++;
                    } else {
                        results.skipped++;
                    }

                    continue;
                }

                // Create variants one by one to handle unique constraint errors gracefully
                if (variants.length > 0) {
                    for (const v of variants) {
                        try {
                            await prisma.hamperVariant.create({
                                data: {
                                    hamperId,
                                    name: v.name,
                                    sellingPrice: v.sellingPrice,
                                    etsySku: v.sku,
                                    etsyProductId: v.productId,
                                    isActive: true,
                                },
                            });
                        } catch (variantErr) {
                            // If unique constraint fails, try to find and update existing variant
                            const existingBySku = v.sku
                                ? await prisma.hamperVariant.findFirst({
                                    where: { etsySku: v.sku },
                                })
                                : null;
                            const existingByProductId = v.productId
                                ? await prisma.hamperVariant.findFirst({
                                    where: { etsyProductId: v.productId },
                                })
                                : null;
                            const existingVariant = existingBySku ?? existingByProductId;

                            if (existingVariant) {
                                // Update orphaned variant to point to new hamper
                                await prisma.hamperVariant.update({
                                    where: { id: existingVariant.id },
                                    data: { hamperId },
                                });
                                console.warn(`Re-linked orphaned variant ${v.name} to hamper ${hamperId}`);
                            } else {
                                console.warn(`Skipping variant ${v.name}: ${variantErr instanceof Error ? variantErr.message : variantErr}`);
                            }
                        }
                    }
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                results.errors.push(`Listing ${listing.listing_id}: ${message}`);
            }
        }

        res.json(results);
    } catch (error) {
        console.error('Error importing Etsy listings:', error);
        res.status(500).json({ error: 'Failed to import Etsy listings' });
    }
});

export default router;
