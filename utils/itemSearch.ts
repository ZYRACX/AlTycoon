import prisma from "./database.js";

export type ItemSearchResult = {
    id: string;
    name: string;
    score: number;
};

/** Find an item by its exact name or exact ID. */
export default function findItemByNameOrId(identifier: string) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identifier);

    return prisma.items.findFirst({
        where: {
            ...(isUuid
                ? {
                    OR: [
                        { name: { equals: identifier, mode: "insensitive" } },
                        { id: identifier },
                    ],
                }
                : { name: { equals: identifier, mode: "insensitive" } }),
        },
    });
}

function levenshtein(left: string, right: string): number {
    const row = Array.from({ length: right.length + 1 }, (_, index) => index);

    for (let i = 1; i <= left.length; i++) {
        let previous = row[0]!;
        row[0] = i;

        for (let j = 1; j <= right.length; j++) {
            const current = row[j]!;
            row[j] = left[i - 1] === right[j - 1]
                ? previous
                : Math.min(previous + 1, row[j]! + 1, row[j - 1]! + 1);
            previous = current;
        }
    }

    return row[right.length]!;
}

/** Search item names and return the closest matches first. */
export async function searchItems(query: string): Promise<ItemSearchResult[]> {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return [];

    const items = await prisma.items.findMany({
        select: { id: true, name: true },
    });

    return items
        .map((item) => {
            const name = item.name.toLowerCase();
            const words = name.split(/\s+/);
            const distance = levenshtein(normalizedQuery, name);
            let score = 100 + distance;

            if (name === normalizedQuery) score = 0;
            else if (name.startsWith(normalizedQuery)) score = 10 + name.length;
            else if (words.some((word) => word.startsWith(normalizedQuery))) score = 20 + name.length;
            else if (name.includes(normalizedQuery)) score = 30 + name.length;

            return { ...item, score };
        })
        .filter((item) => item.score < 100 || item.name.toLowerCase().includes(normalizedQuery))
        .sort((left, right) => left.score - right.score || left.name.localeCompare(right.name));
}

findItemByNameOrId("coal")
