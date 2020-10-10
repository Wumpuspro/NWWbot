module.exports = {
  name: "stop",
  description: "Stop the music and disconnect the bot from the voice channel.",
  aliases: ["end", "disconnect", "dis"],
  usage: " ",
  category: 8,
  async music(message, serverQueue) {
    if ((message.member.voice.channelID !== message.guild.me.voice.channelID) && serverQueue.playing) return message.channel.send("You have to be in a voice channel to stop the music when the bot is playing!");
    if (!serverQueue) {
      return message.channel.send("There is nothing playing.")
    }

    if (serverQueue.connection != null && serverQueue.connection.dispatcher)
      serverQueue.connection.dispatcher.destroy();
    serverQueue.playing = false;
    serverQueue.connection = null;
    serverQueue.voiceChannel = null;
    serverQueue.textChannel = null;
    if (message.guild.me.voice.channel) {
      await message.guild.me.voice.channel.leave();
      message.channel.send(":wave:");
    } else {
      message.channel.send("Re-stopped");
    }
  }
}