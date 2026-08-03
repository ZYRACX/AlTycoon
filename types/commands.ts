import type { ChatInputCommandInteraction, Message, SlashCommandBuilder } from "discord.js";


export interface Command {
    name: string;
    aliases?: string[];
    slash: boolean;
    prefix: boolean;
    data: SlashCommandBuilder;
    execute: (ctx: ChatInputCommandInteraction | Message) => Promise<void>;
}
