import { Message, Client } from "discord.js";
import config from "../config/config.js";

// Extend the Message interface to support the custom 'args' property
declare module "discord.js" {
    export interface Message {
        args?: string[];
    }
}

export interface Event {
    name: string;
    once?: boolean;
    execute: (message: Message, client: Client) => Promise<void>;
}

const event: Event = {
    name: "messageCreate",

    async execute(message, client) {
        if (message.author.bot) return;

        if (!message.content.startsWith(config.prefix)) return;

        const args = message.content
            .slice(config.prefix.length)
            .trim()
            .split(/\s+/);

        const firstArg = args.shift();
        if (!firstArg) return;
        
        const commandName = firstArg.toLowerCase();

        const command =
            client.commands.get(commandName) ||
            client.aliases.get(commandName);

        if (!command) return;
        if (!command.prefix) return;

        message.args = args;

        try {
            await command.execute(message);
        } catch (err) {
            console.error(err);
            await message.reply("❌ Something went wrong.");
        }
    }
};

export default event;