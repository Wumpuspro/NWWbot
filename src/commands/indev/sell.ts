import { NorthClient, NorthInteraction, NorthMessage, SlashCommand } from "../../classes/NorthClient";
import * as Discord from "discord.js";
import { color, jsDate2Mysql } from "../../function";
import { RowDataPacket } from "mysql2";


class SellCommand implements SlashCommand {
    name = "sell"
    description = "Put something to the cross-server shop and sell it!"
    usage = "<price> <item>"
    args = 2
    category = 9

    async execute(interaction: NorthInteraction) {
        await interaction.reply("This command is not available in slash.");
    }

    async run(message: NorthMessage, args: string[]) {
        if (isNaN(Number(args[0]))) return message.channel.send(args[0] + " is not a valid price!");
        const price = Math.round((Number(args[0]) + Number.EPSILON) * 100) / 100;
        const confirmationEmbed = new Discord.MessageEmbed()
            .setColor(color())
            .setTitle("Confirm?")
            .setDescription("This will cost 5% of the price to put it at the shop! The item will be up for 7 days.\n\n✅ Confirm\n❌ Cancel")
            .addField("Price", price.toString())
            .addField("Item", args.slice(1).join(" "))
            .setFooter("Please answer within 30 seconds.", message.client.user.displayAvatarURL());
        var msg = await message.channel.send({embeds: [confirmationEmbed]});
        await msg.react("✅");
        await msg.react("❌");
        const filter = (reaction, user) => ["✅", "❌"].includes(reaction.emoji.name) && user.id === message.author.id && !user.bot;
        const collected = await msg.awaitReactions({ filter, time: 30000, max: 1 });
        if (!collected.first()) {
            confirmationEmbed
                .setTitle("Cancelled")
                .setDescription("Timed out.")
                .setFooter("Please try again.", message.client.user.displayAvatarURL());
            await msg.edit({embeds: [confirmationEmbed]});
            return msg.reactions.removeAll().catch(NorthClient.storage.error);
        }
        var reaction = collected.first();
        if (reaction.emoji.name === "✅") {
            const currentDate = new Date();
            const newDateSql = jsDate2Mysql(new Date(currentDate.getTime() + 604800000));
            const con = await message.pool.getConnection();
            try {
                var [result] = <RowDataPacket[][]> await con.query(`SELECT currency FROM currency WHERE user_id = '${message.author.id}' AND guild = '${message.guild.id}'`);
                if (result.length == 0) await message.channel.send("You don't have any money!");
                else if (result[0].currency < price * 0.05) await message.channel.send("You don't have enough money!");
                else {
                    await con.query(`INSERT INTO shop(item, price, endAt) VALUES('${args.slice(1).join(" ").replace(/"/g, '\\"').replace(/'/g, "\\'")}', ${price}, '${newDateSql}')`);
                    await con.query(`UPDATE currency SET currency = ${(result[0].currency - price * 0.05)} WHERE user_id = '${message.author.id}' AND guild = '${message.guild.id}'`);
                    confirmationEmbed
                        .setTitle("Confirmed!")
                        .setDescription("Your item is now at the shop!")
                        .setFooter("Have a nice day! :)", message.client.user.displayAvatarURL());
                    await msg.edit({embeds: [confirmationEmbed]});
                    msg.reactions.removeAll().catch(NorthClient.storage.error);
                }
            } catch (err) {
                NorthClient.storage.error(err);
                await message.reply("there was an error trying to sell the item!");
            }
            con.release();
        } else {
            confirmationEmbed
                .setTitle("Cancelled")
                .setDescription("Your choice is to cancel it.")
                .setFooter("Have a nice day! :)", message.client.user.displayAvatarURL());
            await msg.edit({embeds: [confirmationEmbed]});
        }
    }
};

const cmd = new SellCommand();
export default cmd;