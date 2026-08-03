import "dotenv/config";
import { Client, Collection, GatewayIntentBits } from "discord.js";
import commandHandler from "./handlers/commandHandler.js";
import eventHandler from "./handlers/eventHandler.js";

// Extend the Discord.js Client class to support custom properties
declare module "discord.js" {
    export interface Client {
        commands: Collection<string, any>;
        aliases: Collection<string, any>;
    }
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.commands = new Collection();
client.aliases = new Collection();

// Execute the handlers
commandHandler(client);
eventHandler(client);

client.login(process.env.TOKEN);