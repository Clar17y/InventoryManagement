import { Router } from 'express';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { etsyClient, etsyAuth } from '../lib/etsyClient';
import { MOCK_SHOP } from '../lib/etsy/fixtures';

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
        const shopResponse = await fetch(
            `https://api.etsy.com/v3/application/users/${userId}/shops`,
            {
                headers: {
                    'Authorization': `Bearer ${tokens.access_token}`,
                    'x-api-key': apiKey,
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

        // Clear any existing credentials and store new ones
        await prisma.etsyCredentials.deleteMany();
        await prisma.etsyCredentials.create({
            data: {
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token,
                expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
                shopId: String(shop.shop_id),
                shopName: shop.shop_name,
                userId: userId,
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

/**
 * GET /api/etsy/listings
 * Get all active listings from Etsy
 */
router.get('/listings', async (req, res) => {
    try {
        const { listings, count } = await etsyClient.getActiveListings();

        // Fetch inventory for each listing to get variant info
        const listingsWithInventory = await Promise.all(
            listings.map(async (listing) => {
                try {
                    const inventory = await etsyClient.getListingInventory(listing.listing_id);
                    return {
                        ...listing,
                        inventory,
                    };
                } catch (err) {
                    console.warn(`Failed to get inventory for listing ${listing.listing_id}:`, err);
                    return {
                        ...listing,
                        inventory: null,
                    };
                }
            })
        );

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
        const { listings } = await etsyClient.getActiveListings();

        const results = {
            created: 0,
            updated: 0,
            skipped: 0,
            errors: [] as string[],
        };

        for (const listing of listings) {
            try {
                // Check if hamper with this etsyListingId already exists
                const existing = await prisma.hamper.findFirst({
                    where: { etsyListingId: String(listing.listing_id) },
                });

                if (existing) {
                    results.skipped++;
                    continue;
                }

                // Convert Etsy price (divisor format) to decimal
                const price = listing.price.amount / listing.price.divisor;

                // Get inventory to check for variants
                let variants: Array<{ name: string; sku: string | null; productId: string; sellingPrice: number | null }> = [];
                let hasVariants = false;

                try {
                    const inventory = await etsyClient.getListingInventory(listing.listing_id);

                    if (inventory.products && inventory.products.length > 1) {
                        hasVariants = true;
                        variants = inventory.products
                            .filter(p => !p.is_deleted)
                            .map(p => {
                                // Build variant name from property values
                                const name = p.property_values
                                    .map(pv => pv.values.join(', '))
                                    .join(' / ') || `Variant ${p.product_id}`;

                                // Convert empty string to null (Etsy returns "" for no SKU)
                                const sku = p.sku && p.sku.trim() !== '' ? p.sku : null;

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
                } catch (invErr) {
                    console.warn(`Failed to get inventory for listing ${listing.listing_id}:`, invErr);
                }

                // Create hamper
                const hamper = await prisma.hamper.create({
                    data: {
                        name: listing.title,
                        etsyListingId: String(listing.listing_id),
                        sellingPrice: price,
                        hasVariants,
                        isActive: listing.state === 'active',
                    },
                });

                // Create variants one by one to handle unique constraint errors gracefully
                if (variants.length > 0) {
                    for (const v of variants) {
                        try {
                            await prisma.hamperVariant.create({
                                data: {
                                    hamperId: hamper.id,
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
                                    data: { hamperId: hamper.id },
                                });
                                console.warn(`Re-linked orphaned variant ${v.name} to hamper ${hamper.id}`);
                            } else {
                                console.warn(`Skipping variant ${v.name}: ${variantErr instanceof Error ? variantErr.message : variantErr}`);
                            }
                        }
                    }
                }

                results.created++;
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
