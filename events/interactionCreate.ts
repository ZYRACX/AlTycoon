import { type Interaction, Client } from "discord.js";

export interface Event {
    name: string;
    once?: boolean;
    execute: (interaction: Interaction, client: Client) => Promise<void>;
}

const event: Event = {
    name: "interactionCreate",

    async execute(interaction, client) {
        if (!interaction.isChatInputCommand()) return;

        const command = client.commands.get(interaction.commandName);

        if (!command) return;
        if (!command.slash) return;

        try {
            await command.execute(interaction);
        } catch (err) {
            console.error(err);
            
            const errorPayload = {
                content: "❌ Something went wrong.",
                ephemeral: true
            };

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorPayload);
            } else {
                await interaction.reply(errorPayload);
            }
        }
    }
};

export default event;