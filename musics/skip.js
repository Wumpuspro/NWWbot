const { play } = require("./play.js");
const { prefix } = require("../config.json");

module.exports = {
  name: "skip",
  description: "Skip a music in the song queue.",
  usage: "[amount]",
  music(message, serverQueue, looping, queue, pool, repeat) {
  const args = message.content.slice(prefix.length).split(/ +/);
    var skipped = 1;
    const guild = message.guild;
  if (!message.member.voice.channel)
    return message.channel.send(
      "You have to be in a voice channel to skip the music!"
    );
  if (!serverQueue)
    return message.channel.send("There is no song that I could skip!");
  const guildLoopStatus = looping.get(message.guild.id);
    const guildRepeatStatus = repeat.get(message.guild.id);
    if(serverQueue.playing === false) return message.channel.send("No music is being played.")
  serverQueue.connection.dispatcher.destroy();
    if(guildRepeatStatus === true) {
    skipped = 0;
       } else if(guildLoopStatus === true) {
      if(args[1]) {
      if(isNaN(parseInt(args[1]))) {
        message.channel.send(`**${args[1]}** is not a integer. Will skip 1 song instead.`);
        var song = serverQueue.songs[0];
        serverQueue.songs.push(song);
        serverQueue.songs.shift();
      } else {
        skipped = parseInt(args[1]);
        for(var i = 0; i < parseInt(args[1]); i++) {
          var song = serverQueue.songs[0];
        serverQueue.songs.push(song);
          serverQueue.songs.shift();
        }
      }
    } else {
        var song = serverQueue.songs[0];
        serverQueue.songs.push(song);
        serverQueue.songs.shift();
    }
    } else {
      if(args[1]) {
      if(isNaN(parseInt(args[1]))) {
        message.channel.send(`**${args[1]}** is not a integer. Will skip 1 song instead.`);
        serverQueue.songs.shift();
      } else {
        skipped = parseInt(args[1]);
        for(var i = 0; i < parseInt(args[1]); i++) {
          serverQueue.songs.shift();
        }
      }
    } else {
        serverQueue.songs.shift();
    }
    }
        pool.getConnection(function(err, con) {
            con.query(
              "UPDATE servers SET queue = '" +
                escape(JSON.stringify(serverQueue.songs)) +
                "' WHERE id = " +
                guild.id,
              function(err, result) {
                if (err) return message.reply("there was an error trying to execute that command!");
                console.log("Updated song queue of " + guild.name);
              }
            );
            con.release();
          });
    message.channel.send(`Skipped **${skipped}** track${skipped > 1 ? "s" : ""}!`);
    play(guild, serverQueue.songs[0], looping, queue, pool, repeat);
      
  }
}