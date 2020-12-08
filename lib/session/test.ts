import TelegramBot = require("node-telegram-bot-api");
import { SessionContext } from "../interfaces";

export const sessionTest = async (
    ctx: SessionContext,
    msg: TelegramBot.Message
) => {
    await ctx.sendMessage(msg.chat.id, "Hello")

    const result = await ctx.options(msg.chat.id, "Select A item", [
        { text: "Apple", value: "apple" as const},
        { text: "Google", value: "google" as const }
    ])

    await ctx.sendMessage(msg.chat.id, "Your answer is: " + result)

    var list: string[] = []

    while (true) {
        var text = await ctx.question(msg.chat.id, "send me a text or `exit`")

        if (text.text !== 'exit') {
            await ctx.sendMessage(msg.chat.id, "Your answer is: " + text.text) 
            list.push(text.text!)
        } else {
            break
        }
    }

    await ctx.sendMessage(msg.chat.id, "All you send are: " + list.join(', ')) 
    await ctx.sendMessage(msg.chat.id, 'Good Bye', {
        reply_to_message_id: msg.message_id
    })
}