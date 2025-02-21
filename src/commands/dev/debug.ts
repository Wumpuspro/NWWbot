
import { NorthClient, NorthInteraction, NorthMessage, SlashCommand } from "../../classes/NorthClient";
import * as functions from "../../function";
import * as Discord from "discord.js";

class DebugCommand implements SlashCommand {
    name = "debug"
    description = "Developer debugging command."
    category = 10
    args = 1
    options = [{
        name: "function",
        description: "The stringified function.",
        required: true,
        type: "STRING"
    }];

    async execute(interaction: NorthInteraction) {
        NorthClient.storage.log(await (Object.getPrototypeOf(async function () { }).constructor("message", "args", "functions", "Discord", interaction.options.getString("function")))(interaction, functions, Discord));
    }

    async run(message: NorthMessage, args: string[]) {
        NorthClient.storage.log(await (Object.getPrototypeOf(async function () { }).constructor("message", "functions", "Discord", args.join(" ")))(message, functions, Discord));
    }
}

const cmd = new DebugCommand();
export default cmd;