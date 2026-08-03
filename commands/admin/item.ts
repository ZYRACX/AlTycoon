import {
    EmbedBuilder,
    Message,
    PermissionsBitField,
    SlashCommandBuilder,
} from "discord.js";
import type { Command } from "../../types/commands.js";
import { item_category } from "../../generated/prisma/enums.js";
import prisma from "../../utils/database.js";
import findItemByNameOrId from "../../utils/itemSearch.js";

const categories = Object.values(item_category);

function helpMessage(): string {
    return [
        "**Admin item commands**",
        "`!item add <name> <category> <weight> <volume> [price] [stack]`",
        "`!item modify <name> key=value ...` (category, weight, volume, price, stack)",
        "`!item remove <name>`",
        "`!item list` (names and IDs only)",
        "`!item view <name-or-ID>`",
        `Categories: ${categories.join(", ")}`,
    ].join("\n");
}

function numberValue(value: string | undefined, field: string): number {
    const parsed = Number(value);
    if (value === undefined || !Number.isFinite(parsed) || parsed < 0) {
        throw new Error(`${field} must be a non-negative number.`);
    }
    return parsed;
}

const command: Command = {
    name: "item",
    slash: false,
    prefix: true,

    data: new SlashCommandBuilder()
        .setName("item")
        .setDescription("Manage game items (administrator only)."),

    async execute(ctx) {
        if (!(ctx instanceof Message)) return;

        if (!ctx.member?.permissions.has(PermissionsBitField.Flags.Administrator)) {
            await ctx.reply("❌ Only server administrators can manage items.");
            return;
        }

        const args = ctx.content.trim().split(/\s+/);
        const action = args[1]?.toLowerCase();

        if (!action) {
            await ctx.reply(helpMessage());
            return;
        }

        try {
            if (action === "list") {
                const items = await prisma.items.findMany({ orderBy: { name: "asc" } });

                if (items.length === 0) {
                    await ctx.reply("There are no items in the game yet.");
                    return;
                }

                const lines = items.map((item) => `**${item.name}** — \`${item.id}\``);

                let message = "📋 **Items in the game**\n\n";
                for (const line of lines) {
                    const next = `${message}${line}\n\n`;
                    if (next.length > 1900) {
                        await ctx.reply(message);
                        message = "📋 **Items continued**\n\n";
                    }
                    message += `${line}\n\n`;
                }

                if (message.trim()) await ctx.reply(message);
                return;
            }

            if (action === "view") {
                const identifier = args[2];
                if (!identifier) throw new Error("Provide an item name or ID to view.");

                const item = await findItemByNameOrId(identifier);

                if (!item) {
                    await ctx.reply("❌ Item not found. Use `!item list` to see available names and IDs.");
                    return;
                }

                const embed = new EmbedBuilder()
                    .setColor(0x57f287)
                    .setTitle(`📦 ${item.name}`)
                    .addFields(
                        { name: "ID", value: `\`${item.id}\`` },
                        { name: "Category", value: item.category, inline: true },
                        { name: "Weight", value: String(item.weight), inline: true },
                        { name: "Volume", value: String(item.volume), inline: true },
                        { name: "Stack size", value: String(item.stack_size), inline: true },
                        { name: "Base price", value: `$${item.base_price}`, inline: true },
                    );

                await ctx.reply({ embeds: [embed] });
                return;
            }

            if (action === "add") {
                const [name, categoryInput, weightInput, volumeInput, priceInput, stackInput] = args.slice(2);
                const category = categoryInput?.toUpperCase();

                if (!name || !category || !categories.includes(category as item_category)) {
                    throw new Error(`category must be one of: ${categories.join(", ")}.`);
                }

                const item = await prisma.items.create({
                    data: {
                        name,
                        category: category as item_category,
                        weight: numberValue(weightInput, "Weight"),
                        volume: numberValue(volumeInput, "Volume"),
                        base_price: priceInput === undefined ? 0 : numberValue(priceInput, "Price"),
                        stack_size: stackInput === undefined ? 100 : numberValue(stackInput, "Stack size"),
                    },
                });

                await ctx.reply(`✅ Added item **${item.name}** (${item.category}).`);
                return;
            }

            if (action === "modify") {
                const name = args[2];
                if (!name) throw new Error("Provide the item name to modify.");

                const updates: Record<string, string | number> = {};
                for (const assignment of args.slice(3)) {
                    const separator = assignment.indexOf("=");
                    if (separator < 1) throw new Error(`Invalid update '${assignment}'. Use key=value.`);
                    const key = assignment.slice(0, separator).toLowerCase();
                    const value = assignment.slice(separator + 1);

                    if (key === "category") {
                        const category = value.toUpperCase();
                        if (!categories.includes(category as item_category)) {
                            throw new Error(`category must be one of: ${categories.join(", ")}.`);
                        }
                        updates.category = category;
                    } else if (["weight", "volume", "price", "stack"].includes(key)) {
                        updates[key === "price" ? "base_price" : key === "stack" ? "stack_size" : key] =
                            numberValue(value, key);
                    } else {
                        throw new Error(`Unknown field '${key}'.`);
                    }
                }

                if (Object.keys(updates).length === 0) throw new Error("Provide at least one key=value update.");

                const item = await prisma.items.update({ where: { name }, data: updates });
                await ctx.reply(`✅ Updated item **${item.name}**.`);
                return;
            }

            if (action === "remove" || action === "delete") {
                const name = args[2];
                if (!name) throw new Error("Provide the item name to remove.");

                await prisma.items.delete({ where: { name } });
                await ctx.reply(`✅ Removed item **${name}**.`);
                return;
            }

            await ctx.reply(helpMessage());
        } catch (error: any) {
            if (error?.code === "P2002") {
                await ctx.reply("❌ An item with that name already exists.");
            } else if (error?.code === "P2025") {
                await ctx.reply("❌ Item not found.");
            } else if (error?.code === "P2003") {
                await ctx.reply("❌ That item is in use and cannot be removed.");
            } else {
                await ctx.reply(`❌ ${error instanceof Error ? error.message : "Item operation failed."}`);
            }
        }
    },
};

export default command;
