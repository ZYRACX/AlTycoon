import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { Client } from "discord.js";

// Recreate __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async (client: Client): Promise<void> => {
    // Files will be read from the compiled 'dist' folder
    const eventsPath = path.join(__dirname, "..", "events");

    if (!fs.existsSync(eventsPath)) return;

    // Filter for compiled .js files inside the dist/events folder
    const files = fs
        .readdirSync(eventsPath)
        .filter(file => file.endsWith(".ts"));

    for (const file of files) {
        const filePath = path.join(eventsPath, file);
        
        // Convert the absolute path to a file URL for dynamic ESM import
        const fileUrl = new URL(`file://${filePath}`).href;
        const eventModule = await import(fileUrl);

        // ESM imports return an object; handle both default or named exports
        const event = eventModule.default || eventModule;

        if (event.name) {
            if (event.once) {
                client.once(event.name, (...args: any[]) => event.execute(...args, client));
            } else {
                client.on(event.name, (...args: any[]) => event.execute(...args, client));
            }
        }
    }
};