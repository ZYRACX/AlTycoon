import { Message, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/commands.js";
import { searchItems } from "../utils/itemSearch.js";

const command: Command = {
    name: "search",
    slash: false,
    prefix: true,

    data: new SlashCommandBuilder()
        .setName("search")
        .setDescription("Search for game items."),

    async execute(ctx) {
        if (!(ctx instanceof Message)) return;

        const query = ctx.content.trim().split(/\s+/).slice(1).join(" ");
        if (!query) {
            await ctx.reply("Use `!search <item-name>` to search for items.");
            return;
        }

        const matches = await searchItems(query);
        if (matches.length === 0) {
            await ctx.reply(`❌ No items found matching **${query}**.`);
            return;
        }

        const lines = matches.map((item, index) =>
            `${index + 1}. **${item.name}** — \`${item.id}\``
        );
        let message = `🔎 **Search results for “${query}”**\n\n`;

        for (const line of lines) {
            if (`${message}${line}\n`.length > 1900) {
                await ctx.reply(message);
                message = "🔎 **Search results continued**\n\n";
            }
            message += `${line}\n`;
        }

        await ctx.reply(message);
    },
};

export default command;
