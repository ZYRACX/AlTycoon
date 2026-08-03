import { Message, SlashCommandBuilder } from "discord.js";
import type { Command } from "../../types/commands.js";
import prisma from "../../utils/database.js";


const command: Command = {
    name: "register",
    slash: false,
    prefix: true,

    data: new SlashCommandBuilder()
        .setName("register")
        .setDescription("Register the player for the game."),

    async execute(ctx) 
    {
        if (!(ctx instanceof Message)) return;

        const userID = ctx.member?.user.id
        const username = ctx.member?.user.username
        const content = ctx.content as string;
        const args = content.split(' ')

        try{
            if(args[1] == undefined){
                ctx.reply(" Give a name to your company!!");
                return
            }
            // !register 
            const craetePlayer = await prisma.players.create({
                data: {
                    discord_id: userID as string,
                    username: username as string,
                }
            })
            const craeteCompany = await prisma.companies.create({
                data: {
                    name: args[1],
                    balance: 10000,
                }
            })
            const createCompanyMember = await prisma.company_members.create({
                data: {
                    company_id: craeteCompany.id,
                    player_id: craetePlayer.id,
                    role: "OWNER",
                }
            })
            ctx.reply("Done!")

        }catch(error: any) {
            console.error(error.code)
            if(error.code == "P2002"){
                ctx.reply("User already registered!")
            }
        }
    }
};

export default command;
