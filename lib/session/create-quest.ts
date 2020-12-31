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
        "<b>Please enter the Quest name</b>",
        {
            parse_mode: 'HTML'
        }
    )

    var description = await ctx.question(
        msg.chat.id,
        "<b>Please enter the Quest description</b>",
        {
            parse_mode: 'HTML'
        }
    )

    var exampleInput = await ctx.question(
        msg.chat.id,
        "<b>Please enter the Quest example input</b>\nThe leading and trailing space will be removed,\nand line will end with \\n",
        {
            parse_mode: 'HTML'
        }
    )

    var exampleOutput = await ctx.question(
        msg.chat.id,
        "<b>Please enter the Quest example output</b>\nThe leading and trailing space will be removed,\nand line will end with \\n",
        {
            parse_mode: 'HTML'
        }
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
            "<b>Please enter the Quest input</b>\nThe leading and trailing space will be removed,\nand line will end with \\n",
            {
                parse_mode: 'HTML'
            }
        )

        const output = await ctx.question(
            msg.chat.id,
            "<b>Please enter the Quest output</b>\nThe leading and trailing space will be removed,\nand line will end with \\n",
            {
                parse_mode: 'HTML'
            }
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
            str += `<b>Input ${k + 1}:</b>\n`
            str += `<pre>${encode(v.input)}</pre>\n`
            str += `<b>Output ${k + 1}:</b>\n`
            str += `<pre>${encode(v.output)}</pre>\n`
        }
        return str
    }

    const result = await ctx.options(
        msg.chat.id,
`<b>Title:</b>
<pre>${encode(title.text ?? '')}</pre>
<b>Description</b>
<pre>${encode(description.text ?? '')}</pre>
<b>Example input:</b>
<pre>${encode(exampleInput.text ?? '')}</pre>
<b>Example output:</b>
<pre>${encode(exampleOutput.text ?? '')}</pre>
<b>Example Language:</b>
<pre>${language}</pre>
<b>Example Code:</b>
<pre>${encode(exampleCode.text ?? '')}</pre>
${mapInputs(samples)}<b>Everything looks correct?</b>`,
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