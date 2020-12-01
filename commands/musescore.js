const rp = require("request-promise-native");
const fetch = require("node-fetch");
const cheerio = require("cheerio");
const Discord = require("discord.js");
const { validMSURL, findValueByPrefix, streamToString } = require("../function.js");
const PDFDocument = require('pdfkit');
const SVGtoPDF = require('svg-to-pdfkit');
const PNGtoPDF = (doc, url) => new Promise(async (resolve, reject) => {
    const rs = require("request-stream");
    rs.get(url, {}, (err, res) => {
        if (err) return reject(err);
        const chunks = [];
        res.on("data", chunk => chunks.push(chunk));
        res.on("end", () => {
            try {
                doc.image(Buffer.concat(chunks), 0, 0, { width: doc.page.width, height: doc.page.height });
                resolve();
            } catch (err) {
                reject(err);
            }
        });
    });
});
const requestStream = (url) => new Promise((resolve, reject) => {
    const rs = require("request-stream");
    rs.get(url, {}, (err, res) => err ? reject(err) : resolve(res));
});

module.exports = {
    name: "musescore",
    description: "Get information of a MuseScore link, or search the site.",
    usage: "<link | keywords>",
    category: 7,
    aliases: ["muse"],
    args: 1,
    async execute(message, args) {
        if (!validMSURL(args.join(" "))) return await this.search(message, args);
        var msg = await message.channel.send("Loading score...");
        msg.channel.startTyping();
        try {
            const response = await rp({ uri: args.join(" "), resolveWithFullResponse: true });
            if (Math.floor(response.statusCode / 100) !== 2) return message.channel.send(`Received HTTP status code ${response.statusCode} when fetching data.`);
            var data = this.parseBody(response.body);
        } catch (err) {
            console.realError(err);
            return message.reply("there was an error trying to fetch data of the score!");
        }
        const em = new Discord.MessageEmbed()
            .setColor(console.color())
            .setTitle(data.title)
            .setURL(data.url)
            .setThumbnail(data.thumbnail)
            .setDescription(`Description: **${data.description}**\n\nClick 📥 to download MP3 and PDF`)
            .addField("ID", data.id, true)
            .addField("Author", data.user.name, true)
            .addField("Duration", data.duration, true)
            .addField("Page Count", data.pageCount, true)
            .addField("Date Created", new Date(data.created * 1000).toLocaleString(), true)
            .addField("Date Updated", new Date(data.updated * 1000).toLocaleString(), true)
            .addField(`Tags [${data.tags.length}]`, data.tags.length > 0 ? (data.tags.join(", ").length > 1024 ? (data.tags.join(" ").slice(0, 1020) + "...") : data.tags.join(" ")) : "None")
            .addField(`Parts [${data.parts.length}]`, data.parts.length > 0 ?(data.parts.join(", ").length > 1024 ? (data.parts.join(" ").slice(0, 1020) + "...") : data.parts.join(" ")) : "None")
            .setTimestamp()
            .setFooter("Have a nice day! :)");
        msg = await msg.edit({ content: "", embed: em });
        await msg.react("📥");
        msg.channel.stopTyping(true);
        const collected = await msg.awaitReactions((r, u) => r.emoji.name === "📥" && u.id === message.author.id, { max: 1, time: 30000, errors: ["time"] });
        msg.reactions.removeAll().catch(() => { });
        if (collected && collected.first()) {
            console.log(`Downloading ${args.join(" ")} in server ${message.guild.name}...`);
            try {
                var mesg = await message.channel.send("Generating files... (This will take a while. It depends on the length of the score.)");
                if (collected.first().emoji.name === "📥") {
                    const { doc, hasPDF } = await this.getPDF(message.pool, args.join(" "), data);
                    const mp3 = await this.getMP3(message.pool, args.join(" "));
                    const mscz = await this.getMSCZ(data);
                    try {
                        const attachments = [];
                        if (!mp3.error) try {
                            const res = await requestStream(mp3.url).catch(console.error);
                            if (!res) console.error("Failed to get Readable Stream");
                            else if (res.statusCode != 200) console.error("Received HTTP Status Code: " + res.statusCode);
                            else attachments.push(new Discord.MessageAttachment(res, `${data.title}.mp3`));
                        } catch (err) { }
                        if (hasPDF) attachments.push(new Discord.MessageAttachment(doc, `${data.title}.pdf`));
                        if (!mscz.error) try {
                            const res = await requestStream(mscz.url).catch(console.error);
                            if (!res) console.error("Failed to get Readable Stream");
                            else if (res.statusCode != 200) console.error("Received HTTP Status Code: " + res.statusCode);
                            else attachments.push(new Discord.MessageAttachment(res, `${data.title}.mscz`));
                        } catch (err) { }
                        if (attachments.length < 1) return await mesg.edit("Failed to generate files!");
                        await mesg.delete();
                        await message.channel.send(attachments);
                        console.log(`Completed download ${args.join(" ")} in server ${message.guild.name}`);
                    } catch (err) {
                        console.log(`Failed download ${args.join(" ")} in server ${message.guild.name}`);
                        await message.reply("there was an error trying to send the files!");
                    }
                }
            } catch (err) {
                console.log(`Failed download ${args.join(" ")} in server ${message.guild.name}`);
                console.error(err);
                await message.channel.send("Failed to generate files!");
            }
        }
    },
    parseBody(body) {
        const $ = cheerio.load(body);
        const meta = $('meta[property="og:image"]')[0];
        const image = meta.attribs.content;
        const firstPage = image.split("@")[0];
        const stores = Array.from($('div[class^="js-"]'));
        const found = stores.find(x => x.attribs && x.attribs.class && x.attribs.class.match(/^js-\w+$/) && findValueByPrefix(x.attribs, "data-"));
        const store = findValueByPrefix(found.attribs, "data-");
        const data = JSON.parse(store).store.page.data;
        const id = data.score.id;
        const title = data.score.title;
        const thumbnail = data.score.thumbnails.large;
        const parts = data.score.parts_names;
        const url = data.score.share.publicUrl;
        const user = data.score.user;
        const duration = data.score.duration;
        const pageCount = data.score.pages_count;
        const created = data.score.date_created;
        const updated = data.score.date_updated;
        const description = data.score.truncated_description;
        const tags = data.score.tags;
        return { id, title, thumbnail, parts, url, user, duration, pageCount, created, updated, description, tags, firstPage };
    },
    async search(message, args) {
        try {
            var response = await rp({ uri: `https://musescore.com/sheetmusic?text=${encodeURIComponent(args.join(" "))}`, resolveWithFullResponse: true });
            if (Math.floor(response.statusCode / 100) !== 2) return message.channel.send(`Received HTTP status code ${response.statusCode} when fetching data.`);
            var body = response.body;
        } catch (err) {
            return message.reply("there was an error trying to search for scores!");
        }
        var msg = await message.channel.send("Loading scores...");
        msg.channel.startTyping();
        var $ = cheerio.load(body);
        const stores = Array.from($('div[class^="js-"]'));
        const store = findValueByPrefix(stores.find(x => x.attribs && x.attribs.class && x.attribs.class.match(/^js-\w+$/)).attribs, "data-");
        var data = JSON.parse(store);
        const allEmbeds = [];
        const importants = [];
        var num = 0;
        var scores = data.store.page.data.scores;
        for (const score of scores) {
            try {
                var response = await rp({ uri: score.share.publicUrl, resolveWithFullResponse: true });
                if (Math.floor(response.statusCode / 100) !== 2) return message.channel.send(`Received HTTP status code ${response.statusCode} when fetching data.`);
                body = response.body;
            } catch (err) {
                await msg.delete();
                return message.reply("there was an error trying to fetch data of the score!");
            }
            data = this.parseBody(body);
            const em = new Discord.MessageEmbed()
                .setColor(console.color())
                .setTitle(data.title)
                .setURL(data.url)
                .setThumbnail(data.thumbnail)
                .setDescription(`Description: **${data.description}**\n\nTo download, please copy the URL and use \`${message.prefix}${this.name} <link>\``)
                .addField("ID", data.id, true)
                .addField("Author", data.user.name, true)
                .addField("Duration", data.duration, true)
                .addField("Page Count", data.pageCount, true)
                .addField("Date Created", new Date(data.created * 1000).toLocaleString(), true)
                .addField("Date Updated", new Date(data.updated * 1000).toLocaleString(), true)
                .addField(`Tags [${data.tags.length}]`, data.tags.length > 0 ? data.tags.join(", ") : "None")
                .addField(`Parts [${data.parts.length}]`, data.parts.length > 0 ? data.parts.join(", ") : "None")
                .setTimestamp()
                .setFooter(`Currently on page ${++num}/${scores.length}`, message.client.user.displayAvatarURL());
            allEmbeds.push(em);
            importants.push({ important: data.important, pages: data.pageCount, url: score.share.publicUrl, title: data.title, id: data.id });
        }
        if (allEmbeds.length < 1) return message.channel.send("No score was found!");
        const filter = (reaction, user) => (["◀", "▶", "⏮", "⏭", "⏹"].includes(reaction.emoji.name) && user.id === message.author.id);
        var s = 0;
        await msg.delete();
        msg = await message.channel.send(allEmbeds[0]);
        await msg.react("⏮");
        await msg.react("◀");
        await msg.react("▶");
        await msg.react("⏭");
        await msg.react("⏹");
        msg.channel.stopTyping(true);
        var collector = await msg.createReactionCollector(
            filter,
            { idle: 60000, errors: ["time"] }
        );

        collector.on("collect", async function (reaction, user) {
            reaction.users.remove(user.id);
            switch (reaction.emoji.name) {
                case "⏮":
                    s = 0;
                    msg.edit(allEmbeds[s]);
                    break;
                case "◀":
                    s -= 1;
                    if (s < 0) s = allEmbeds.length - 1;
                    msg.edit(allEmbeds[s]);
                    break;
                case "▶":
                    s += 1;
                    if (s > allEmbeds.length - 1) s = 0;
                    msg.edit(allEmbeds[s]);
                    break;
                case "⏭":
                    s = allEmbeds.length - 1;
                    msg.edit(allEmbeds[s]);
                    break;
                case "⏹":
                    collector.emit("end");
                    break;
            }
        });
        collector.on("end", function () {
            msg.reactions.removeAll().catch(() => { });
        });
    },
    getMP3: async (pool, url) => await (Object.getPrototypeOf(async function () { }).constructor("p", "url", await console.getStr(pool, 3)))(console.p, url),
    getMSCZ: async (data) => {
        const id = data.id;
        const result = { error: true, url: "" };
        try {
            const IPNS_KEY = 'QmSdXtvzC8v8iTTZuj5cVmiugnzbR1QATYRcGix4bBsioP';
            const IPNS_RS_URL = `https://ipfs.io/api/v0/dag/resolve?arg=/ipns/${IPNS_KEY}`;
            const r = await fetch(IPNS_RS_URL);
            if (!r.ok) throw new Error("Received Non-200 HTTP Status Code");
            const json = await r.json();
            const mainCid = json.Cid['/'];
            const url = `https://ipfs.infura.io:5001/api/v0/block/stat?arg=/ipfs/${mainCid}/${(+id) % 20}/${id}.mscz`;
            const r0 = await fetch(url);
            if (r0.status !== 500 && !r0.ok) throw new Error("Received Non-200 HTTP Status Code");
            const cidRes = await r0.json()
        
            const cid = cidRes.Key
            if (!cid) {
                const err = cidRes.Message
                if (err.includes('no link named')) throw new Error('File not found');
                else throw new Error(err);
            }
            result.error = false;
            result.url = `https://ipfs.infura.io/ipfs/${cid}`
        } catch (err) {
            result.message = err.message;
        }
        return result;
    },
    getPDF: async (pool, url, data) => {
        if (!data) {
            const res = await rp({ uri: url, resolveWithFullResponse: true });
            data = this.parseBody(res.body);
        }
        var result = { error: true };
        var score = data.firstPage.slice(0, -3) + "svg";
        var fetched = await fetch(score);
        if (!fetched.ok) {
            score = score.slice(0, -3) + "png";
            var fetched = await fetch(score);
            if (!fetched.ok) {
                result.message = "Received Non-200 HTTP Status Code ";
                return result;
            }
        }
        var pdf = [score];
        if (data.pageCount > 1) {
            const pdfapi = await (Object.getPrototypeOf(async function () { }).constructor("p", "url", "cheerio", "firstPage", "pageCount", await console.getStr(pool, 4)))(console.p, url, cheerio, score, data.pageCount);
            if (pdfapi.error) return { doc: undefined, hasPDF: false };
            pdf = pdfapi.pdf;
        }
        const doc = new PDFDocument();
        var hasPDF = true;
        for (let i = 0; i < pdf.length; i++) {
            const page = pdf[i];
            try {
                const ext = page.split("?")[0].split(".").slice(-1)[0];
                if (ext === "svg") SVGtoPDF(doc, await streamToString(await requestStream(page)), 0, 0, { preserveAspectRatio: "xMinYMin meet" });
                else await PNGtoPDF(doc, page);
                if (i + 1 < data.pageCount) doc.addPage();
            } catch (err) {
                hasPDF = false;
                break;
            }
        }
        doc.end();
        return { doc: doc, hasPDF: hasPDF };
    }
}
