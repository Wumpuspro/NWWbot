
import { NorthInteraction, NorthMessage, SlashCommand } from "../../classes/NorthClient";
import { globalClient as client } from "../../common";
import { color, ms, msgOrRes } from "../../function";
import * as Discord from "discord.js";
import * as neko from "akaneko";

class HentaiCommand implements SlashCommand {
    name = "hentai"
    description = "Return something very NSFW. Require NSFW channel."
    usage = "[tag | subcommand]"
    aliases = ["h"]
    subcommands = ["auto"]
    subaliases = ["a"]
    subdesc = ["Automate Hentai images."]
    subusage = ["<subcommand> <amount> <interval> [reverse] [tags]"]
    tags = [
        "ass",
        "bdsm",
        "blowjob",
        "cum",
        "doujin",
        "feet",
        "femdom",
        "foxgirl",
        "gifs",
        "glasses",
        "hentai",
        "netorare",
        "loli",
        "maid",
        "masturbation",
        "orgy",
        "panties",
        "pussy",
        "school",
        "tentacles",
        "thighs",
        "uglyBastard",
        "uniform",
        "yuri",
        "zettaiRyouiki",
        "neko"
    ]
    category = 5
    options = [
        {
            name: "single",
            description: "Displays a single Hentai.",
            type: "SUB_COMMAND",
            options: [{
                name: "tag",
                description: "The tag of Hentai to fetch.",
                required: false,
                type: "STRING"
            }]
        },
        {
            name: "auto",
            description: "Automatically fetches Hentai.",
            type: "SUB_COMMAND",
            options: [
                {
                    name: "amount",
                    description: "The amount of Hentai to fetch.",
                    required: true,
                    type: "INTEGER"
                },
                {
                    name: "interval",
                    description: "The interval between each fetch.",
                    required: true,
                    type: "STRING"
                },
                {
                    name: "exclude",
                    description: "Toggle tag excluding.",
                    required: false,
                    type: "BOOLEAN"
                },
                {
                    name: "tags",
                    description: "The tags to (not) fetch.",
                    required: false,
                    type: "STRING"
                }
            ]
        }
    ];

    async execute(interaction: NorthInteraction) {
        const sub = interaction.options.getSubcommand();
        if (sub === "single") {
            const t = interaction.options.getString("tag");
            var embed;
            if (t) {
                var tag = "random";
                const i = this.tags.findIndex(t => t.toLowerCase() === t);
                if (i !== -1) tag = this.tags[i];
                embed = await (t.toLowerCase() === "tags" ? this.tagsList() : this.tagged(tag));
            } else embed = await this.random();
            return await interaction.reply(embed);
        } else {
            const options = interaction.options;
            await this.auto(interaction, options.getInteger("amount"), ms(options.getString("interval")), options.getBoolean("exclude"), options.getString("tags").split(/ +/));
        }
    }

    async run(message: NorthMessage, args: string[]) {
        var tag = "random";
        if (args.length >= 1) {
            if (args[0].toLowerCase() === "tags") return await message.channel.send({embeds: [await this.tagsList()]});
            else if (["auto", "a"].includes(args[0].toLowerCase())) return await this.auto(message, args[1], args[2], args[3] === "true", args.slice(3));
            const testTag = args[0];
            const i = this.tags.findIndex(t => testTag === t);
            if (i !== -1) tag = this.tags[i];
        }
        if (tag === "random") return await message.channel.send({embeds: [await this.random()]});
        await message.channel.send({embeds: [await this.tagged(tag)]});
    }
    async tagged(tag) {
        if (tag === "neko") var result = neko.lewdneko();
        else if (neko.nsfw[tag]) var result = await neko.nsfw[tag]();
        else return await this.random();
        const embed = new Discord.MessageEmbed()
            .setTitle("Tag: " + tag)
            .setColor(color())
            .setImage(result)
            .setTimestamp()
            .setFooter("Made with Akaneko", client.user.displayAvatarURL());
        return embed;
    }
    async random() {
        var index = Math.floor(Math.random() * this.tags.length);
        var tag = this.tags[index];
        if (tag === "neko") var result = neko.lewdneko();
        else var result = await neko.nsfw[tag]();
        const embed = new Discord.MessageEmbed()
            .setTitle("Tag: " + tag)
            .setColor(color())
            .setImage(result)
            .setTimestamp()
            .setFooter("Made with Akaneko", client.user.displayAvatarURL());
        return embed;
    }
    async tagsList() {
        return new Discord.MessageEmbed()
            .setTitle("Tag list")
            .setColor(color())
            .setDescription("**" + this.tags.join("**\n**") + "**")
            .setFooter("Have a nice day! :)", client.user.displayAvatarURL());
    }
    async auto(message: NorthMessage | NorthInteraction, amount = undefined, interval = undefined, reverse = false, tags = []) {
        if (!amount) return await msgOrRes(message, "You didn't provide the amount of messages to be sent!");
        else if (!interval) return await msgOrRes(message, "You didn't provide the interval between each message!");
        if (isNaN(amount)) return await msgOrRes(message, "The amount of message is invalid!");
        else if (!interval) return await msgOrRes(message, "The interval is not valid!");
        else if (interval < 1000) return await msgOrRes(message, "The interval must be larger than 1 second!");
        else if (interval > 300000) return await msgOrRes(message, "The interval must be smaller than 5 minutes!");
        else if (amount < 1) return await msgOrRes(message, "The amount of message must be larger than 0!");
        else if (amount > 120) return await msgOrRes(message, "The amount of message must be smaller than 120!");
        await msgOrRes(message, `Auto-hentai initialized. **${amount} messages** with interval **${interval} milliseconds**`);
        if (reverse) tags = tags.filter(str => !this.tags.includes(str));
        else tags = tags.filter(str => this.tags.includes(str));
        var counter = 0;
        var i = setInterval(async () => {
            if (counter === amount) {
                await message.channel.send("Auto-hentai ended. Thank you for using that!");
                return clearInterval(i);
            }
            var embed;
            if (tags.length < 1) embed = await this.random();
            else if (tags.length > 1) embed = await this.tagged(tags[Math.floor(Math.random() * tags.length)]);
            else embed = await this.tagged(tags[0]);
            await message.channel.send(embed);
            counter++;
        }, interval);
    }
};

const cmd = new HentaiCommand();
export default cmd;