import type * as TelegramBot from "node-telegram-bot-api"
import { runnerList } from "../bot";
import { AbortError } from "../errors/AbortError";
import type { SessionContext } from "../interfaces";

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

    const runners = runnerList.map(i => ({
        text: i.type,
        value: i.type
    }))

    const language = await ctx.options(msg.chat.id, "Select a language for the example program", runners)

    const exampleCode = await ctx.question(
        msg.chat.id,
        "Please enter the example code"
    )

    const samples: {
        input: string,
        output: string
    }[] = []

    do {
        const input = await ctx.question(
            msg.chat.id,
            "Please enter the Quest input\nThe leading and trailing space will be removed,\nand line will end with \\n"
        )

        const output = await ctx.question(
            msg.chat.id,
            "Please enter the Quest output\nThe leading and trailing space will be removed,\nand line will end with \\n"
        )

        samples.push({
            input: input.text ?? '',
            output: output.text ?? ''
        })
    } while (
        samples.length < 5 &&
        await ctx.options(
            msg.chat.id,
            'Add more?',
            [
                {
                    text: 'yes',
                    value: 'y' as const
                },
                {
                    text: 'no',
                    value: 'n' as const
                }
            ]
        ) === 'y'
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

    const mapInputs = (items: typeof samples) => {
        let str = ''
        for (let [k, v] of items.entries()) {
            str += `Input ${k}:\n`
            str += `<pre>${encode(v.input)}</pre>\n`
            str += `Output ${k}:\n`
            str += `<pre>${encode(v.output)}</pre>\n`
        }
        return str
    }

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
Example Language: <code>${language}</code>
Example Code:
<pre>${encode(exampleCode.text ?? '')}</pre>
${mapInputs(samples)}Everything looks correct?`,
        [
            { text: "Create", value: "ok" as const},
            { text: "Cancel", value: "cancel" as const }
        ],
        {
            parse_mode: 'HTML'
        }
    )

    if (result !== 'ok') {
        throw new AbortError('user cancelled')
    }

    return {
        title: title.text ?? '',
        description: description.text ?? '',
        exampleInput: exampleInput.text ?? '',
        exampleOutput: exampleOutput.text ?? '',
        language,
        exampleCode: exampleCode.text ?? '',
        samples
    }
}