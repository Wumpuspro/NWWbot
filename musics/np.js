const Discord = require("discord.js");

module.exports = {
  name: "np",
  description: "Display the music being played.",
  aliases: ["nowplaying"],
  usage: " ",
  music(message, serverQueue) {
    if (!serverQueue) return message.channel.send("There is nothing playing.");
  var embed = new Discord.MessageEmbed()
    .setColor(Math.floor(Math.random() * 16777214) + 1)
    .setTitle("Now playing:")
    .setDescription(
      `[**${serverQueue.songs[0].title}**](${serverQueue.songs[0].url})`
    )
    .setTimestamp()
    .setThumbnail(`https://img.youtube.com/vi/${serverQueue.songs[0].id}/maxresdefault.jpg`)
    .setTimestamp()
    .setFooter("Have a nice day! :)", message.client.user.displayAvatarURL());
    if(serverQueue.songs[0].type === 1) embed.setDescription(`[**${serverQueue.songs[0].title}**](${serverQueue.songs[0].spot})`).setThumbnail(serverQueue.songs[0].thumbnail);
  return message.channel.send(embed);
  }
}