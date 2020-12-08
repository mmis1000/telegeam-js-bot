import TelegramBot = require("node-telegram-bot-api");
import { SessionContext } from "../interfaces";

export const sessionCreateQuest = async (
    ctx: SessionContext,
    msg: TelegramBot.Message
) => {
    var title = await ctx.question(
        msg.chat.id,
        "Please enter the Quest name"
    )

    var description = await ctx.question(
        msg.chat.id,
        "Please enter the Quest description"
    )

    var exampleInput = await ctx.question(
        msg.chat.id,
        "Please enter the Quest example input\nThe leading and trailing space will be removed,\nand line will end with \\n"
    )

    var exampleOutput = await ctx.question(
        msg.chat.id,
        "Please enter the Quest example output\nThe leading and trailing space will be removed,\nand line will end with \\n"
    )

    var input = await ctx.question(
        msg.chat.id,
        "Please enter the Quest input\nThe leading and trailing space will be removed,\nand line will end with \\n"
    )

    var output = await ctx.question(
        msg.chat.id,
        "Please enter the Quest output\nThe leading and trailing space will be removed,\nand line will end with \\n"
    )

    const encode = (str: string) => str.replace(/<|>|&/g, function (hit) {
        if (hit === '&') {
            return '&amp;'
        }
        if (hit === '<') {
            return '&lt;'
        }

        if (hit === '>'){
            return '&gt;'
        }

        return hit
    })

    const result = await ctx.options(
        msg.chat.id,
`Title:
<pre>${encode(title.text ?? '')}</pre>
Description
<pre>${encode(description.text ?? '')}</pre>
Example input:
<pre>${encode(exampleInput.text ?? '')}</pre>
Example output:
<pre>${encode(exampleOutput.text ?? '')}</pre>
Input:
<pre>${encode(input.text ?? '')}</pre>
Output:
<pre>${encode(output.text ?? '')}</pre>
Everything looks correct?`,
        [
            { text: "Create", value: "ok" as const},
            { text: "Cancel", value: "cancel" as const }
        ],
        {
            parse_mode: 'HTML'
        }
    )

    if (result === 'ok') {
        await ctx.sendMessage(msg.chat.id, 'Quest created')
    } else {
        await ctx.sendMessage(msg.chat.id, 'Cancelled')
    }
}