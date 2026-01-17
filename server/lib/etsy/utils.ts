/**
 * Etsy Utility Functions
 */

/**
 * Decode HTML entities in a string.
 * Etsy's API returns text with HTML entities encoded (e.g., &#39; for apostrophe).
 * This function converts them back to normal characters.
 */
export function decodeHtmlEntities(text: string): string {
    const entities: Record<string, string> = {
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&#39;': "'",
        '&#x27;': "'",
        '&apos;': "'",
        '&#x2F;': '/',
        '&#47;': '/',
        '&nbsp;': ' ',
    };

    // Replace named/numeric entities
    let decoded = text;
    for (const [entity, char] of Object.entries(entities)) {
        decoded = decoded.replace(new RegExp(entity, 'g'), char);
    }

    // Handle remaining numeric entities (&#NNN; or &#xHHH;)
    decoded = decoded.replace(/&#(\d+);/g, (_, num) =>
        String.fromCharCode(parseInt(num, 10))
    );
    decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
        String.fromCharCode(parseInt(hex, 16))
    );

    return decoded;
}
