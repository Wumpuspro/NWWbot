module.exports = {
  name: "stop",
  description: "Stop the music and disconnect the bot from the voice channel.",
  aliases: ["end", "disconnect"],
  usage: " ",
  music(message, serverQueue, looping, queue, pool) {
    const guild = message.guild;
    if (!message.member.voice.channel)
    return message.channel.send(
      "You have to be in a voice channel to stop the music!"
    );
    if(!serverQueue) {
      return message.channel.send("There is nothing playing.")
    }

  serverQueue.songs = [];
    if(serverQueue.connection.dispatcher)
  serverQueue.connection.dispatcher.destroy();
  message.guild.me.voice.channel.leave();
  queue.delete(message.guild.id);
    pool.getConnection(function(err, con) {
        con.query(
          "UPDATE servers SET queue = NULL WHERE id = " + guild.id,
          function(err, result) {
            if (err) return message.reply("there was an error trying to execute that command!");
            console.log("Updated song queue of " + guild.name);
          }
        );
        con.release();
      });
  message.channel.send(":wave:");
  }
}