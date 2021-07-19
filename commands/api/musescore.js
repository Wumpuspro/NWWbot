const rp = require("request-promise-native");
const fetch = require("fetch-retry")(require("node-fetch"), { retries: 5, retryDelay: attempt => Math.pow(2, attempt) * 1000 });
const cheerio = require("cheerio");
const { run } = require("../../helpers/puppeteer");
const Discord = require("discord.js");
const ytdl = require("ytdl-core");
const sanitize = require("sanitize-filename");
const muse = require("musescore-metadata");
const { NorthClient } = require("../../classes/NorthClient.js");
const requestYTDLStream = (url, opts) => {
    const timeoutMS = opts.timeout && !isNaN(parseInt(opts.timeout)) ? parseInt(opts.timeout) : 30000;
    const timeout = new Promise((_resolve, reject) => setTimeout(() => reject(new Error(`YTDL video download timeout after ${timeoutMS}ms`)), timeoutMS));
    const getStream = new Promise((resolve, reject) => {
        const stream = ytdl(url, opts);
        stream.on("finish", () => resolve(stream)).on("error", err => reject(err));
    });
    return Promise.race([timeout, getStream]);
};
const { validMSURL, findValueByPrefix, streamToString, requestStream, color } = require("../../function.js");
const PDFDocument = require('pdfkit');
const SVGtoPDF = require('svg-to-pdfkit');
const { ApplicationCommand, ApplicationCommandOption, ApplicationCommandOptionType, InteractionResponse } = require("../../classes/Slash.js");
const PNGtoPDF = (doc, url) => new Promise(async (resolve, reject) => {
    const res = await fetch(url).then(res => res.body);
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

module.exports = {
    name: "musescore",
    description: "Get information of a MuseScore link, or search the site, and download if requested.",
    usage: "<link | keywords>",
    category: 7,
    aliases: ["muse"],
    args: 1,
    slashInit: true,
    register: () => ApplicationCommand.createBasic(module.exports).setOptions([
        new ApplicationCommandOption(ApplicationCommandOptionType.STRING.valueOf(), "score", "The link or name of the score.").setRequired(true)
    ]),
    async slash() {
        return InteractionResponse.sendMessage("Fetching score metadata...");
    },
    async postSlash(client, interaction, args) {
        InteractionResponse.deleteMessage(client, interaction).catch(() => { });
        args = args?.map(x => x?.value).filter(x => !!x);
        const message = await InteractionResponse.createFakeMessage(client, interaction);
        await this.execute(message, args);
    },
    async execute(message, args) {
        if (!validMSURL(args.join(" "))) return await this.search(message, args);
        var msg = await message.channel.send("Loading score...");
        try {
            var data = await muse(args.join(" "));
        } catch (err) {
            console.error(err);
            return message.reply("there was an error trying to fetch data of the score!");
        }
        const em = new Discord.MessageEmbed()
            .setColor(color())
            .setTitle(data.title)
            .setURL(data.url)
            .setThumbnail(data.thumbnail)
            .setDescription(`Description: **${data.description}**\n\nClick 📥 to download MIDI and PDF`)
            .addField("ID", data.id, true)
            .addField("Author", data.user.name, true)
            .addField("Duration", data.duration, true)
            .addField("Page Count", data.pageCount, true)
            .addField("Date Created", new Date(data.created * 1000).toLocaleString(), true)
            .addField("Date Updated", new Date(data.updated * 1000).toLocaleString(), true)
            .addField(`Tags [${data.tags.length}]`, data.tags.length > 0 ? (data.tags.join(", ").length > 1024 ? (data.tags.join(" ").slice(0, 1020) + "...") : data.tags.join(" ")) : "None")
            .addField(`Parts [${data.parts.length}]`, data.parts.length > 0 ? (data.parts.join(", ").length > 1024 ? (data.parts.join(" ").slice(0, 1020) + "...") : data.parts.join(" ")) : "None")
            .setTimestamp()
            .setFooter("Have a nice day! :)", message.client.user.displayAvatarURL());
        msg = await msg.edit({ content: "", embed: em });
        await msg.react("📥");
        const collected = await msg.awaitReactions((r, u) => r.emoji.name === "📥" && u.id === message.author.id, { max: 1, time: 30000 });
        await msg.reactions.removeAll().catch(() => { });
        if (collected && collected.first()) {
            try {
                try {
                    var mesg = await message.channel.send("Generating MP3...");
                    const mp3 = await this.getMP3(args.join(" "));
                    try {
                        if (mp3.error) throw new Error(mp3.message);
                        if (mp3.url.startsWith("https://www.youtube.com/embed/")) {
                            const ytid = mp3.url.split("/").slice(-1)[0].split("?")[0];
                            var res = await requestYTDLStream(`https://www.youtube.com/watch?v=${ytid}`, { highWaterMark: 1 << 25, filter: "audioonly", dlChunkSize: 0 });
                        } else var res = await requestStream(mp3.url);
                        const att = new Discord.MessageAttachment(res, sanitize(`${data.title}.mp3`));
                        if (!res) throw new Error("Failed to get Readable Stream");
                        else if (res.statusCode && res.statusCode != 200) throw new Error("Received HTTP Status Code: " + res.statusCode);
                        else await message.channel.send(att);
                        await mesg.delete();
                    } catch (err) {
                        await mesg.edit(`Failed to generate MP3! \`${err.message}\``);
                    }
                    mesg = await message.channel.send("Generating PDF...");
                    const { doc, hasPDF, err } = await this.getPDF(args.join(" "), data);
                    try {
                        if (!hasPDF) throw new Error(err ? err : "No PDF available");
                        const att = new Discord.MessageAttachment(doc, sanitize(`${data.title}.pdf`));
                        await message.channel.send(att);
                        await mesg.delete();
                    } catch (err) {
                        await mesg.edit(`Failed to generate PDF! \`${err.message}\``);
                    }
                    mesg = await message.channel.send("Generating MIDI...");
                    const midi = await this.getMIDI(args.join(" "));
                    try {
                        if (midi.error) throw new Error(midi.message);
                        var res = await requestStream(midi.url);
                        const att = new Discord.MessageAttachment(res, sanitize(`${data.title}.mid`));
                        if (!res) throw new Error("Failed to get Readable Stream");
                        else if (res.statusCode && res.statusCode != 200) throw new Error("Received HTTP Status Code: " + res.statusCode);
                        else await message.channel.send(att);
                        await mesg.delete();
                    } catch (err) {
                        await mesg.edit(`Failed to generate MIDI! \`${err.message}\``);
                        mesg = await message.channel.send("Falling back to MSCZ...");
                        const mscz = await this.getMSCZ(data);
                        try {
                            if (mscz.error) throw new Error(mscz.err);
                            const res = await requestStream(mscz.url);
                            const att = new Discord.MessageAttachment(res, sanitize(`${data.title}.mscz`));
                            if (!res) throw new Error("Failed to get Readable Stream");
                            else if (res.statusCode && res.statusCode != 200) throw new Error("Received HTTP Status Code: " + res.statusCode);
                            else await message.channel.send(att);
                            await mesg.delete();
                        } catch (err) {
                            await mesg.edit(`Failed to generate MSCZ! \`${err.message}\``);
                            if (err.message === "Score not in dataset")
                                await message.channel.send(`The score is not in the dataset. Consider reporting this to #dataset-bug in https://discord.gg/3Jx5TZArAF`);
                        }
                    }
                } catch (err) {
                    NorthClient.storage.error(err);
                    await message.reply("there was an error trying to send the files!");
                }
            } catch (err) {
                NorthClient.storage.log(`Failed download ${args.join(" ")} ${message.guild ? `in server ${message.guild.name}` : `for user ${message.author.name}`}`);
                NorthClient.storage.error(err);
                await message.channel.send("Failed to generate files!");
            }
        }
    },
    async search(message, args) {
        try {
            const response = await rp({ uri: `https://musescore.com/sheetmusic?text=${encodeURIComponent(args.join(" "))}`, resolveWithFullResponse: true });
            if (Math.floor(response.statusCode / 100) !== 2) return message.channel.send(`Received HTTP status code ${response.statusCode} when fetching data.`);
            var body = response.body;
        } catch (err) {
            return message.reply("there was an error trying to search for scores!");
        }
        var msg = await message.channel.send("Loading scores...");
        var $ = cheerio.load(body);
        const stores = Array.from($('div[class^="js-"]'));
        const store = findValueByPrefix(stores.find(x => x.attribs && x.attribs.class && x.attribs.class.match(/^js-\w+$/)).attribs, "data-");
        var data = JSON.parse(store);
        console.log(data);
        const allEmbeds = [];
        const importants = [];
        var num = 0;
        var scores = data.store.page.data.scores;
        for (const score of scores) {
            data = muse(score.share.publicUrl);
            const em = new Discord.MessageEmbed()
                .setColor(color())
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
        var collector = await msg.createReactionCollector(
            filter,
            { idle: 60000 }
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
    getMP3: async(url) => await run(async (page) => {
        var result = { error: true };
        const start = Date.now();
        try {
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36');
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                if (["image", "font", "stylesheet", "media"].includes(req.resourceType())) req.abort();
                else req.continue();
            });
            await page.goto(url, { waitUntil: "domcontentloaded" });
            await page.waitForSelector("button[title='Toggle Play']").then(el => el.click());
            const mp3 = await page.waitForRequest(req => req.url().startsWith("https://s3.ultimate-guitar.com/") || req.url().startsWith("https://www.youtube.com/embed/"));
            result.url = mp3.url();
            result.error = false;
        } catch (err) {
            result.message = err.message;
        } finally {
            result.timeTaken = Date.now() - start;
            return result;
        }
    }),
    getMIDI: async(url) => await run(async (page) => {
        var result = { error: true };
        const start = Date.now();
        try {
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36');
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                if (["image", "font", "stylesheet", "media"].includes(req.resourceType())) req.abort();
                else req.continue();
            });
            await page.goto(url, { waitUntil: "domcontentloaded" });
            await page.waitForSelector("button[hasaccess]").then(el => el.click());
            const midi = await page.waitForResponse(res => {
                const url = res.url();
                return url.startsWith("https://musescore.com/api/jmuse") && url.includes("type=midi");
            });
            result.url = (await midi.json())?.info?.url;
            result.error = false;
        } catch (err) {
            result.message = err.message;
        } finally {
            result.timeTaken = Date.now() - start;
            return result;
        }
    }),
    getPDF: async (url, data) => {
        if (!data) data = muse(url);
        var result = { doc: null, hasPDF: false };
        var score = data.firstPage.replace(/png$/, "svg");
        var fetched = await fetch(score);
        if (!fetched.ok) {
            score = data.firstPage;
            var fetched = await fetch(score);
            if (!fetched.ok) {
                result.err = "Received Non-200 HTTP Status Code";
                return result;
            }
        }
        var pdf = [score];
        if (data.pageCount > 1) {
            const pdfapi = await run(async (page) => {
                var result = { error: true };
                const start = Date.now();
                const pageCount = data.pageCount;
                try {
                    const pattern = /^(https?:\/\/)?s3\.ultimate-guitar\.com\/musescore\.scoredata\/g\/\w+\/score\_\d+\.svg/;
                    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36');
                    await page.setRequestInterception(true);
                    const pages = result.pdf ? result.pdf : [];
                    await page.setViewport({
                        width: 1280,
                        height: 720
                    });
                    page.on('request', (req) => {
                        req.continue();
                        if (req.url().match(pattern)) pages.push(req.url());
                    });
                    await page.goto(url, { waitUntil: "domcontentloaded" });
                    const thumb = await page.waitForSelector("meta[property='og:image']");
                    var png = (await (await thumb.getProperty("content")).jsonValue()).split("@")[0];
                    var svg = png.split(".").slice(0, -1).join(".") + ".svg";
                    var el;
                    try {
                        el = await page.waitForSelector(`img[src^="${svg}"]`, { timeout: 10000 });
                        pages.push(svg);
                    } catch (err) {
                        el = await page.waitForSelector(`img[src^="${png}"]`, { timeout: 10000 });
                        pages.push(png);
                    }
                    const height = (await el.boxModel()).height;
                    await el.hover();
                    var scrolled = 0;
                    while (pages.length < pageCount && scrolled <= pageCount) {
                        await page.mouse.wheel({ deltaY: height });
                        await page.waitForRequest(req => req.url().match(pattern));
                        scrolled++;
                    }
                    result.pdf = pages;
                    result.error = false;
                } catch (err) {
                    result.message = err.message;
                } finally {
                    result.timeTaken = Date.now() - start;
                    return result;
                }
            });
            if (pdfapi.error) return { doc: undefined, hasPDF: false };
            pdf = pdfapi.pdf;
        }
        const doc = new PDFDocument();
        var hasPDF = true;
        for (let i = 0; i < pdf.length; i++) {
            const page = pdf[i];
            try {
                const ext = page.split("?")[0].split(".").slice(-1)[0];
                if (ext === "svg") try {
                    SVGtoPDF(doc, await streamToString(await requestStream(page)), 0, 0, { preserveAspectRatio: "xMinYMin meet" });
                } catch (err) {
                    SVGtoPDF(doc, await fetch(page).then(res => res.text()), 0, 0, { preserveAspectRatio: "xMinYMin meet" });
                }
                else await PNGtoPDF(doc, page);
                if (i + 1 < data.pageCount) doc.addPage();
            } catch (err) {
                result.err = err.message;
                hasPDF = false;
                break;
            }
        }
        doc.end();
        return { doc: doc, hasPDF: hasPDF, pages: pdf };
    },
    getMSCZ: async (data) => {
        // Thank you to Xmader/musescore-downloader!
        const IPNS_KEY = 'QmSdXtvzC8v8iTTZuj5cVmiugnzbR1QATYRcGix4bBsioP';
        const IPNS_RS_URL = `https://ipfs.io/api/v0/dag/resolve?arg=/ipns/${IPNS_KEY}`;
        const r = await fetch(IPNS_RS_URL);
        if (!r.ok) return { error: true, err: "Received HTTP Status Code: " + r.status };
        const json = await r.json();
        const mainCid = json.Cid['/'];

        const url = `https://ipfs.infura.io:5001/api/v0/block/stat?arg=/ipfs/${mainCid}/${data.id % 20}/${data.id}.mscz`;
        const r0 = await fetch(url);
        if (!r0.ok) return { error: true, err: "Received HTTP Status Code: " + r.status };
        const cidRes = await r0.json();
        const cid = cidRes.Key
        if (!cid) {
            const err = cidRes.Message
            if (err.includes('no link named')) return { error: true, err: "Score not in dataset" };
            else return { error: true, err: err };
        }
        const msczUrl = `https://ipfs.infura.io/ipfs/${cid}`;
        const r1 = await fetch(msczUrl);
        if (!r1.ok) return { error: true, err: "Received HTTP Status Code: " + r.status };
        return { error: false, url: msczUrl };
    }
}
