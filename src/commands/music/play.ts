import * as Discord from "discord.js";
import { getFetch, validURL, validYTURL, validSPURL, validGDURL, validGDFolderURL, validYTPlaylistURL, validSCURL, validMSURL, isEquivalent, requestStream, moveArray, color, validGDDLURL, bufferToStream, msgOrRes } from "../../function.js";
import { getMP3 } from "../api/musescore.js";
import scdl from "soundcloud-downloader";
import * as mm from "music-metadata";
import { migrate as music } from "./migrate.js";
import ytdl, { downloadOptions } from "ytdl-core";
import { NorthClient, NorthInteraction, NorthMessage, SlashCommand, SoundTrack } from "../../classes/NorthClient.js";
import { getQueues, updateQueue, setQueue } from "../../helpers/music.js";
import WebMscore from "webmscore";
import { FfmpegCommand } from "fluent-ffmpeg";
import moment from "moment";
import { addYTPlaylist, addYTURL, addSPURL, addSCURL, addGDFolderURL, addGDURL, addMSURL, addURL, addAttachment, search } from "../../helpers/addTrack.js";
import * as Stream from 'stream';
import { globalClient as client } from "../../common.js";
import { InputFileFormat } from "webmscore/schemas";
import { AudioPlayerStatus, createAudioPlayer, createAudioResource, demuxProbe, DiscordGatewayAdapterCreator, getVoiceConnection, joinVoiceChannel } from "@discordjs/voice";
const fetch = getFetch();

function createPlayer(guild: Discord.Guild) {
  var serverQueue = getQueues().get(guild.id);
  var track: SoundTrack;
  var needResource = true;
  return serverQueue.player.on(AudioPlayerStatus.Playing, async (_oldState, newState) => {
    track = serverQueue.songs[0];
    if (needResource) {
      serverQueue.resource = newState.resource;
      serverQueue.resource.volume.setVolumeLogarithmic(track && track.volume ? serverQueue.volume * track.volume : serverQueue.volume);
      needResource = false;
    }
    serverQueue.streamTime = newState.playbackDuration;
    await updateQueue(guild.id, serverQueue, false);
  }).on(AudioPlayerStatus.Idle, async () => {
    serverQueue = getQueues().get(guild.id);
    if (serverQueue.looping) serverQueue.songs.push(track);
    if (!serverQueue.repeating) serverQueue.songs.shift();
    await updateQueue(guild.id, serverQueue);
    needResource = true;
    if (!serverQueue.random) await play(guild, serverQueue.songs[0]);
    else {
      const int = Math.floor(Math.random() * serverQueue.songs.length);
      const pending = serverQueue.songs[int];
      serverQueue.songs = moveArray(serverQueue.songs, int);
      await updateQueue(guild.id, serverQueue);
      await play(guild, pending);
    }
  }).on("error", async error => {
    NorthClient.storage.error(error);
    serverQueue.textChannel.send("There was an error trying to play the soundtrack!");
    serverQueue.destroy();
  });
}

async function probeAndCreateResource(readableStream: Stream.Readable) {
	const { stream, type } = await demuxProbe(readableStream);
	return createAudioResource(stream, { inputType: type });
}

export function createEmbed(songs: SoundTrack[]) {
  const Embed = new Discord.MessageEmbed()
    .setColor(color())
    .setTitle("New track added:")
    .setThumbnail(songs[0].thumbnail)
    .setDescription(`**[${songs[0].title}](${songs[0].url})**\nLength: **${songs[0].time}**`)
    .setTimestamp()
    .setFooter("Have a nice day! :)", client.user.displayAvatarURL());
  if (songs.length > 1) Embed.setDescription(`**${songs.length}** tracks were added.`).setThumbnail(undefined);
  return Embed;
}

export async function play(guild: Discord.Guild, song: SoundTrack, seek: number = 0) {
  const queue = getQueues();
  const serverQueue = queue.get(guild.id);
  if (!serverQueue.voiceChannel && guild.me.voice?.channel) serverQueue.voiceChannel = guild.me.voice.channel;
  serverQueue.playing = true;
  if (!song && serverQueue.songs.length > 0) {
    const filtered = serverQueue.songs.filter(song => !!song);
    if (serverQueue.songs.length !== filtered.length) {
      serverQueue.songs = filtered;
      await updateQueue(guild.id, serverQueue);
      if (serverQueue.songs[0]) song = serverQueue.songs[0];
    }
  }
  if (!song || !serverQueue.voiceChannel) {
    serverQueue.playing = false;
    if (guild.me.voice?.channel) serverQueue.connection.destroy();
    return await updateQueue(guild.id, serverQueue);
  }
  if (!serverQueue.player) {
    serverQueue.player = createPlayer(guild);
    serverQueue.connection?.subscribe(serverQueue.player);
  }
  if (!serverQueue.connection) try {
    serverQueue.connection = joinVoiceChannel({ channelId: serverQueue.voiceChannel.id, guildId: guild.id, adapterCreator: <DiscordGatewayAdapterCreator> <unknown> guild.voiceAdapterCreator })
    serverQueue.connection.subscribe(serverQueue.player);
    if (!guild.me.voice.selfDeaf) await guild.me.voice.setDeaf(true);
  } catch (err) {
    serverQueue.destroy();
    if (serverQueue.textChannel) return await serverQueue.textChannel.send("An error occured while trying to connect to the channel! Disconnecting the bot...").then(msg => setTimeout(msg.delete, 30000));
  }
  if (serverQueue.connection) serverQueue.startTime = serverQueue.streamTime - seek * 1000;
  else serverQueue.startTime = -seek * 1000;
  try {
    var stream: Stream.Readable;
    switch (song.type) {
      case 2:
      case 4:
        const a = <Stream.Readable>(await requestStream(song.url)).data;
        if (!song.time) {
          const metadata = await mm.parseStream(a, {}, { duration: true });
          const i = serverQueue.songs.indexOf(song);
          song.time = moment.duration(metadata.format.duration, "seconds").format();
          if (i != -1) serverQueue.songs[i] = song;
        }
        stream = a;
        break;
      case 3:
        stream = await scdl.download(song.url);
        break;
      case 5:
        const c = await getMP3(song.url);
        if (c.error) throw new Error(c.message);
        stream = <Stream.Readable> (await requestStream(c.url)).data;
        break;
      case 7:
        const h = await fetch(song.url);
        if (!h.ok) throw new Error("Received HTTP Status Code: " + h.status);
        console.log("Fetched Musescore file");
        await WebMscore.ready;
        console.log("WebMscore ready");
        const i = await WebMscore.load(<InputFileFormat> song.url.split(".").slice(-1)[0], (await h.buffer()));
        console.log("Loaded Musescore file");
        const sf3 = await fetch("https://www.dropbox.com/s/2pphk3a9llfiree/MuseScore_General.sf3?dl=1").then(res => res.arrayBuffer());
        console.log("Fetched Musescore SoundFont");
        await i.setSoundFont(new Uint8Array(sf3));
        console.log("Set SoundFont");
        const j = bufferToStream(Buffer.from((await i.saveAudio("wav")).buffer));
        console.log("Exported to WAV");
        i.destroy();
        console.log("Destroyed WebMscore");
        stream = j;
        break;
      default:
        if (song?.isLive) {
          const k = await addYTURL(song.url, song.type);
          if (k.error) throw "Failed to find video";
          if (!isEquivalent(k.songs[0], song)) {
            song = k.songs[0];
            serverQueue.songs[serverQueue.songs.indexOf(song)] = song;
            await updateQueue(guild.id, serverQueue);
          }
        }
        if (!song?.isLive && !song?.isPastLive) stream = ytdl(song.url, <downloadOptions> { filter: "audioonly", dlChunkSize: 0, highWaterMark: 1 << 25 });
        else if (song.isPastLive) stream = ytdl(song.url, { highWaterMark: 1 << 25 });
        else stream = ytdl(song.url, { highWaterMark: 1 << 25 });
        break;
    }
    if (seek) {
      const command = new FfmpegCommand(stream);
      const transform = new Stream.Transform();
      command.seekInput(seek).output(transform);
      serverQueue.player.play(await probeAndCreateResource(transform));
    } else serverQueue.player.play(await probeAndCreateResource(stream));
  } catch (err) {
    NorthClient.storage.error(err);
  }
  if (serverQueue.textChannel) {
    const Embed = new Discord.MessageEmbed()
      .setColor(color())
      .setTitle("Now playing:")
      .setThumbnail(song.thumbnail)
      .setDescription(`**[${song.title}](${song.type === 1 ? song.spot : song.url})**\nLength: **${song.time}**${seek > 0 ? ` | Starts From: **${moment.duration(seek, "seconds").format()}**` : ""}`)
      .setTimestamp()
      .setFooter("Have a nice day! :)", guild.client.user.displayAvatarURL());
    serverQueue.textChannel.send({embeds: [Embed]}).then(msg => setTimeout(msg.delete, 30000));
  }
}

class PlayCommand implements SlashCommand {
  name = "play"
  description = "Play music with the link or keywords provided. Only support YouTube videos currently."
  aliases = ["p"]
  usage = "[link | keywords | attachment]"
  category = 8
  options = [{
    name: "link",
    description: "The link of the soundtrack or keywords to search.",
    required: false,
    type: "STRING"
  }]

  async execute(interaction: NorthInteraction) {
    if (!interaction.guild) return await interaction.reply("This command only works on server.");
    await this.logic(interaction, interaction.options.getString("link"));
  }

  async run(message: NorthMessage, args: string[]) {
    await this.logic(message, args.join(" "));
  }

  async logic(message: Discord.Message | NorthInteraction, str: string) {
    var serverQueue = getQueues().get(message.guild.id);
    const voiceChannel = (<Discord.GuildMember> message.member).voice.channel;
    if (!voiceChannel) return await msgOrRes(message, "You need to be in a voice channel to play music!");
    if (!voiceChannel.permissionsFor(message.guild.me).has(BigInt(3145728))) return await msgOrRes(message, "I can't play in your voice channel!");
    if (!str && message instanceof Discord.Message && message.attachments.size < 1) {
      if (!serverQueue || !serverQueue.songs || !Array.isArray(serverQueue.songs)) serverQueue = setQueue(message.guild.id, [], false, false);
      if (serverQueue.songs.length < 1) return await msgOrRes(message, "The queue is empty for this server! Please provide a link or keywords to get a music played!");
      if (serverQueue.playing || NorthClient.storage.migrating.find(x => x === message.guild.id)) return await music(message);
      try {
        if (message.guild.me.voice?.channelId === voiceChannel.id) serverQueue.connection = getVoiceConnection(message.guild.id);
        else {
          serverQueue.destroy();
          serverQueue.connection = joinVoiceChannel({ channelId: voiceChannel.id, guildId: message.guild.id, adapterCreator: <DiscordGatewayAdapterCreator> <unknown> message.guild.voiceAdapterCreator });
        }
        if (message.guild.me.voice && !message.guild.me.voice.selfDeaf) message.guild.me.voice.setDeaf(true);
      } catch (err) {
        await msgOrRes(message, "There was an error trying to connect to the voice channel!");
        if (err.message) await message.channel.send(err.message);
        NorthClient.storage.error(err);
        return serverQueue.destroy();
      }
      serverQueue.voiceChannel = voiceChannel;
      serverQueue.playing = true;
      serverQueue.textChannel = <Discord.TextChannel>message.channel;
      if (!serverQueue.player) serverQueue.player = createAudioPlayer();
      await updateQueue(message.guild.id, serverQueue);
      if (!serverQueue.random) play(message.guild, serverQueue.songs[0]);
      else {
        const int = Math.floor(Math.random() * serverQueue.songs.length);
        const pending = serverQueue.songs[int];
        serverQueue.songs = moveArray(serverQueue.songs, int);
        await updateQueue(message.guild.id, serverQueue);
        await play(message.guild, pending);
      }
      return;
    }
    try {
      var songs = [];
      var result = { error: true, songs: [], msg: null, message: null };
      if (validYTPlaylistURL(str)) result = await addYTPlaylist(str);
      else if (validYTURL(str)) result = await addYTURL(str);
      else if (validSPURL(str)) result = await addSPURL(message, str);
      else if (validSCURL(str)) result = await addSCURL(str);
      else if (validGDFolderURL(str)) {
        const msg = await msgOrRes(message, "Processing track: (Initializing)");
        result = await addGDFolderURL(str, async (i, l) => await msg.edit(`Processing track: **${i}/${l}**`));
        await msg.delete();
      } else if (validGDURL(str) || validGDDLURL(str)) result = await addGDURL(str);
      else if (validMSURL(str)) result = await addMSURL(str);
      else if (validURL(str)) result = await addURL(str);
      else if (message instanceof Discord.Message && message.attachments.size > 0) result = await addAttachment(message);
      else result = await search(message, str);
      if (result.error) return await msgOrRes(message, result.message || "Failed to add soundtracks");
      songs = result.songs;
      if (!songs || songs.length < 1) return await msgOrRes(message, "There was an error trying to add the soundtrack!");
      const Embed = createEmbed(songs);
      if (!serverQueue || !serverQueue.songs || !Array.isArray(serverQueue.songs)) serverQueue = setQueue(message.guild.id, songs, false, false);
      else serverQueue.songs = ((!message.guild.me.voice.channel || !serverQueue.playing) ? songs : serverQueue.songs).concat((!message.guild.me.voice.channel || !serverQueue.playing) ? serverQueue.songs : songs);
      var msg: Discord.Message;
      if (result.msg) await result.msg.edit({ content: "", embed: Embed });
      else await msgOrRes(message, Embed);
      setTimeout(async() => { try { await msg.edit({ embeds: null, content: `**[Added Track: ${songs.length > 1 ? songs.length + " in total" : songs[0]?.title}]**` }) } catch (err) { } }, 30000);
      await updateQueue(message.guild.id, serverQueue);
      if (!serverQueue.player) serverQueue.player = createPlayer(message.guild);
      serverQueue.voiceChannel = voiceChannel;
      serverQueue.connection = joinVoiceChannel({ channelId: voiceChannel.id, guildId: message.guild.id, adapterCreator: <DiscordGatewayAdapterCreator> <unknown> message.guild.voiceAdapterCreator });
      serverQueue.textChannel = <Discord.TextChannel>message.channel;
      await message.guild.me.voice?.setDeaf(true);
      serverQueue.connection.subscribe(serverQueue.player);
      await updateQueue(message.guild.id, serverQueue, false);
      if (!serverQueue.playing) {
        if (!serverQueue.random) await play(message.guild, serverQueue.songs[0]);
        else {
          const int = Math.floor(Math.random() * serverQueue.songs.length);
          const pending = serverQueue.songs[int];
          serverQueue.songs = moveArray(serverQueue.songs, int);
          await updateQueue(message.guild.id, serverQueue);
          await play(message.guild, pending);
        }
      }
    } catch (err) {
      await msgOrRes(message, "There was an error trying to connect to the voice channel!");
      if (err.message) await message.channel.send(err.message);
      serverQueue.destroy();
      NorthClient.storage.error(err);
    }
  }
}

const cmd = new PlayCommand();
export default cmd;