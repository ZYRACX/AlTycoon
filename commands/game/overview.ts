import { EmbedBuilder, Message, SlashCommandBuilder } from "discord.js";
import type { Command } from "../../types/commands.js";
import prisma from "../../utils/database.js";

const command: Command = {
    name: "overview",
    aliases: ["view"],
    slash: false,
    prefix: true,

    data: new SlashCommandBuilder()
        .setName("overview")
        .setDescription("View your company's overall status."),

    async execute(ctx) {
        if (!(ctx instanceof Message)) return;

        const member = await prisma.company_members.findFirst({
            where: { players: { discord_id: ctx.author.id } },
            include: {
                companies: {
                    include: {
                        _count: {
                            select: {
                                company_members: true,
                                buildings: true,
                                vehicles: true,
                                transport_orders: true,
                                market_orders: true,
                            },
                        },
                    },
                },
            },
        });

        if (!member) {
            await ctx.reply("You are not registered yet. Use `!register <company-name>` first.");
            return;
        }

        const company = member.companies;
        const balance = Number(company.balance).toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });

        const embed = new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle(`🏢 ${company.name}`)
            .setDescription(`Company overview for **${ctx.author.username}**`)
            .addFields(
                { name: "💰 Balance", value: `$${balance}`, inline: true },
                { name: "👥 Members", value: String(company._count.company_members), inline: true },
                { name: "🏗️ Buildings", value: String(company._count.buildings), inline: true },
                { name: "🚚 Vehicles", value: String(company._count.vehicles), inline: true },
                { name: "📦 Transport orders", value: String(company._count.transport_orders), inline: true },
                { name: "🛒 Market orders", value: String(company._count.market_orders), inline: true },
            )
            .setFooter({ text: `Role: ${member.role} • Use !view as a shortcut` })
            .setTimestamp();

        await ctx.reply({ embeds: [embed] });
    },
};

export default command;
