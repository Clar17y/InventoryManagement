/**
 * Script to fix HTML entities in Hamper names imported from Etsy
 * Converts &#39; -> ' and &#34; -> " and other common entities
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Common HTML entities to decode
const HTML_ENTITIES: Record<string, string> = {
    '&#39;': "'",
    '&apos;': "'",
    '&#34;': '"',
    '&quot;': '"',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&#38;': '&',
    '&#60;': '<',
    '&#62;': '>',
};

function decodeHtmlEntities(text: string): string {
    let result = text;
    for (const [entity, char] of Object.entries(HTML_ENTITIES)) {
        result = result.replaceAll(entity, char);
    }
    return result;
}

async function main() {
    console.log('🔍 Finding hampers with HTML entities in names...\n');

    // Find all hampers that might have HTML entities
    const hampers = await prisma.hamper.findMany({
        where: {
            OR: [
                { name: { contains: '&#' } },
                { name: { contains: '&amp;' } },
                { name: { contains: '&apos;' } },
                { name: { contains: '&quot;' } },
            ],
        },
    });

    if (hampers.length === 0) {
        console.log('✅ No hampers found with HTML entities. Nothing to fix!');
        return;
    }

    console.log(`Found ${hampers.length} hamper(s) with HTML entities:\n`);

    for (const hamper of hampers) {
        const newName = decodeHtmlEntities(hamper.name);
        console.log(`📦 ID: ${hamper.id}`);
        console.log(`   Before: ${hamper.name}`);
        console.log(`   After:  ${newName}\n`);

        await prisma.hamper.update({
            where: { id: hamper.id },
            data: { name: newName },
        });
    }

    console.log(`\n✅ Updated ${hampers.length} hamper name(s) successfully!`);
}

main()
    .catch((e) => {
        console.error('Error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
