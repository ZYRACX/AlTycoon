import { SlashCommandBuilder } from "discord.js";

// You can create a reusable type/interface for your command structure
export interface Command {
    name: string;
    slash: boolean;
    prefix: boolean;
    data: SlashCommandBuilder;
    execute: (ctx: any) => Promise<void>;
}

const command: Command = {
    name: "aping",
    slash: true,
    prefix: true,

    data: new SlashCommandBuilder()
        .setName("admin_ping")
        .setDescription("Replies with Pong!(Admin)"),

    async execute(ctx) {
        await ctx.reply("🏓 Pong!(Admin)");
    }
};

export default command;