import { Interaction } from "slashcord";
import { NorthMessage, SlashCommand } from "../../classes/NorthClient";
import { genPermMsg, commonModerationEmbed, findMember } from "../../function";

class UnDeafenCommand implements SlashCommand {
    name: "undeafen"
    description: "Undeafen a member while the member is in a voice channel."
    args: 1
    aliases: ["undeaf"]
    usage: "<user | user ID> [reason]"
    category: 1
    permissions: 8388608
    options = [
        {
            name: "user",
            description: "The user to undeafen.",
            required: true,
            type: 6
        },
        {
            name: "reason",
            description: "The reason of undeafening.",
            required: false,
            type: 3
        }
    ]

    async execute(obj: { interaction: Interaction, args: any[] }) {
        if (!obj.interaction.guild) return await obj.interaction.reply("This command only works on server.");
        const author = obj.interaction.member;
        const guild = obj.interaction.guild;
        if (!author.permissions.has(this.permissions)) return await obj.interaction.reply(genPermMsg(this.permissions, 0));
        if (!guild.me.permissions.has(this.permissions)) return await obj.interaction.reply(genPermMsg(this.permissions, 1));
        const member = await guild.members.fetch(obj.args[0].value);
        var reason;
        if (obj.args[1]?.value) reason = obj.args[1].value;
        const embeds = commonModerationEmbed(guild, author.user, member, "undeafen", "undeafened", reason);
        try {
            if (reason) await member.voice.setDeaf(false, reason)
            else await member.voice.setDeaf(false);
            member.user.send(embeds[0]).catch(() => { });
            await obj.interaction.reply(embeds[1]);
        } catch (err) {
            await obj.interaction.reply(embeds[2]);
        }
    }

    async run(message: NorthMessage, args: string[]) {
        if (!message.member.permissions.has(this.permissions)) return await message.channel.send(genPermMsg(this.permissions, 0));
        if (!message.guild.me.permissions.has(this.permissions)) return await message.channel.send(genPermMsg(this.permissions, 1));
        const member = await findMember(message, args[0]);
        if (!member) return;
        var reason;
        if (args[1]) reason = args.slice(1).join(" ");
        const embeds = commonModerationEmbed(message.guild, message.author, member, "undeafen", "undeafened", reason);
        try {
            if (reason) await member.voice.setDeaf(false, reason)
            else await member.voice.setDeaf(false);
            member.user.send(embeds[0]).catch(() => { });
            await message.channel.send(embeds[1]);
        } catch (error) {
            await message.channel.send(embeds[2]);
        }
    }
}

const cmd = new UnDeafenCommand();
export default cmd;