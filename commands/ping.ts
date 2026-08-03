import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/commands.js";


const command: Command = {
    name: "ping",
    slash: true,
    prefix: true,

    data: new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Replies with Pong!"),

    async execute(ctx) {
        await ctx.reply("🏓 Pong!");
    }
};

export default command;