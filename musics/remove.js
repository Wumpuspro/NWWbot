const { play, updateQueue } = require("./play.js");

module.exports = {
  name: "remove",
  description: "Remove soundtrack(s) from the song queue.",
  usage: "<index | starting index> [delete count]",
  category: 8,
  args: 1,
  async music(message, serverQueue, queue) {
    const args = message.content.slice(message.prefix.length).split(/ +/);
    if(args[2] && !isNaN(parseInt(args[2])) && parseInt(args[2]) < 1) return message.channel.send("The delete count must be larger than 0!");
    if ((message.member.voice.channelID !== message.guild.me.voice.channelID) && serverQueue.playing) return message.channel.send("You have to be in a voice channel to alter the queue when the bot is playing!");
    var queueIndex = parseInt(args[1]);
    if (isNaN(queueIndex))
      return message.channel.send("The query provided is not a number.");
    if (!serverQueue) return message.channel.send("There is nothing playing.");
    var deleteIndex = queueIndex < 0 ? serverQueue.songs.length + queueIndex : queueIndex - 1;
    if (deleteIndex > serverQueue.songs.length - 1 || queueIndex === 0)
      return message.channel.send(
        `You cannot remove a soundtrack that doesn't exist.`
      );
    var song = serverQueue.songs[deleteIndex];
    var oldSong = serverQueue.songs[0];
    var title = song.title;
    var removed = await serverQueue.songs.splice(deleteIndex, args[2] && !isNaN(parseInt(args[2])) ? parseInt(args[2]) : 1);
    updateQueue(message, serverQueue, queue);
    message.channel.send(
      `${removed.length > 1 ? `**${removed.length} tracks** have` : `**${title}** has`} been removed from the queue.`
    );
    if (oldSong != serverQueue.songs[0] && serverQueue.playing) {
      if (serverQueue.connection && serverQueue.connection.dispatcher) {
        serverQueue.connection.dispatcher.destroy();
      }
      play(message.guild, serverQueue.songs[0], queue);
    }
  }
}