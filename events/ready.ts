import { Events, Client } from "discord.js";

export interface Event {
    name: string;
    once?: boolean;
    execute: (client: Client<true>) => void;
}

const event: Event = {
    name: Events.ClientReady,
    once: true,

    execute(client) {
        console.clear();

        console.log("=========================");
        console.log(" Discord Bot Started");
        console.log("=========================");
        console.log(`Logged in as ${client.user.tag}`);
        console.log(`Servers: ${client.guilds.cache.size}`);
    }
};

export default event;