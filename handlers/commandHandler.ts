import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { Client } from "discord.js";

// Recreate __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Recursively collect all command files (including subfolders like commands/admin/)
function getCommandFiles(dir: string): string[] {
    let results: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            results = results.concat(getCommandFiles(fullPath));
        } else if (entry.name.endsWith(".ts")) {
            // Compiled output lives in dist, so we filter for .js here
            results.push(fullPath);
        }
    }

    return results;
}

export default async (client: Client): Promise<void> => {
    // When running, files will be read from the compiled 'dist' folder
    const commandsPath = path.join(__dirname, "..", "commands");

    if (!fs.existsSync(commandsPath)) return;

    const files = getCommandFiles(commandsPath);

    for (const filePath of files) {
        // Convert the absolute path to a file URL for dynamic ESM import
        const fileUrl = new URL(`file://${filePath}`).href;
        const command = await import(fileUrl);

        // ESM imports return an object; if you export using 'export default',
        // use command.default. If you export using 'export const', use command.
        const cmdData = command.default || command;

        if (cmdData.name) {
            client.commands.set(cmdData.name, cmdData);

            if (cmdData.aliases && Array.isArray(cmdData.aliases)) {
                for (const alias of cmdData.aliases) {
                    client.aliases.set(alias, cmdData);
                }
            }
        }
    }

    console.log(`Loaded ${client.commands.size} commands.`);
};