import { EmbedBuilder, Message, SlashCommandBuilder } from "discord.js";
import type { Command } from "../../types/commands.js";
import prisma from "../../utils/database.js";
import findItemByNameOrId from "../../utils/itemSearch.js";

const command: Command = {
    name: "user-item",
    aliases: ["ui"],
    slash: false,
    prefix: true,

    data: new SlashCommandBuilder()
        .setName("user-item")
        .setDescription("Browse items available in the game."),

    async execute(ctx) {
        if (!(ctx instanceof Message)) return;

        const args = ctx.content.trim().split(/\s+/).slice(1);
        const search = args[0]?.toLowerCase();

        if (!search || search === "list") {
            const items = await prisma.items.findMany({
                orderBy: { name: "asc" },
                select: { name: true, id: true },
            });

            if (items.length === 0) {
                await ctx.reply("There are no items in the game yet.");
                return;
            }

            const lines = items.map((item) => `**${item.name}** — \`${item.id}\``);
            let message = "📋 **Available items**\n\n";

            for (const line of lines) {
                if (`${message}${line}\n`.length > 1900) {
                    await ctx.reply(message);
                    message = "📋 **Available items continued**\n\n";
                }
                message += `${line}\n`;
            }

            await ctx.reply(message);
            return;
        }

        const identifier = args[1] && search === "view" ? args[1] : args[0];
        if (!identifier) {
            await ctx.reply("Use `!ui list` or `!ui <item-name-or-ID>`.");
            return;
        }

        const item = await findItemByNameOrId(identifier);

        if (!item) {
            await ctx.reply("❌ Item not found. Use `!ui list` to see available items.");
            return;
        }

        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle(`📦 ${item.name}`)
            .addFields(
                { name: "ID", value: `\`${item.id}\`` },
                { name: "Category", value: item.category, inline: true },
                { name: "Weight", value: String(item.weight), inline: true },
                { name: "Volume", value: String(item.volume), inline: true },
                { name: "Stack size", value: String(item.stack_size), inline: true },
                { name: "Base price", value: `$${item.base_price}`, inline: true },
            )
            .setFooter({ text: "Use !ui list to browse all items" });

        await ctx.reply({ embeds: [embed] });
    },
};

export default command;
