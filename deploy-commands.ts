import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { REST, Routes } from "discord.js";

// Recreate __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const commands: any[] = [];
const commandsPath = path.join(__dirname, "commands");

function getCommandFiles(dir: string): string[] {
    const files: string[] = [];

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const filePath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            files.push(...getCommandFiles(filePath));
        } else if (
            (entry.name.endsWith(".js") || entry.name.endsWith(".ts")) &&
            !entry.name.endsWith(".d.ts")
        ) {
            files.push(filePath);
        }
    }

    return files;
}

// 1. Dynamically import and read all command files
if (fs.existsSync(commandsPath)) {
    const files = getCommandFiles(commandsPath);

    for (const filePath of files) {
        // Convert path to file:// URL for ESM import compatibility
        const fileUrl = new URL(`file://${filePath}`).href;
        const commandModule = await import(fileUrl);
        const command = commandModule.default || commandModule;

        if (command.slash && command.data) {
            commands.push(command.data.toJSON());
        }
    }
}

// 2. Strict check for environment variables
const token = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId || !guildId) {
    console.error("❌ Missing required environment variables: TOKEN, CLIENT_ID, or GUILD_ID.");
    process.exit(1);
}

// 3. Deploy commands to Discord
const rest = new REST({ version: "10" }).setToken(token);

(async () => {
    try {
        console.log(`Deploying ${commands.length} commands...`);

        await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commands }
        );

        console.log("✅ Commands deployed.");
    } catch (err) {
        console.error(err);
    }
})();
