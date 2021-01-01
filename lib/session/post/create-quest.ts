import type * as TelegramBot from "node-telegram-bot-api";
import { catchHandle, managerEngine, repositoryQuestDraft } from "../../bot";
import type { Await } from "../../interfaces";
import type { sessionCreateQuest } from "../create-quest";

const compareNormalized = (str1: string, str2: string) => {
    return str1.replace(/\r\n/g, '\n').replace(/\n+$/, '') === str2.replace(/\r\n/g, '\n').replace(/\n+$/, '')
}

const abort = (errorMsg: string, api: TelegramBot, message: TelegramBot.Message) => {
    api.sendMessage(message.chat.id, errorMsg, {
        reply_to_message_id: message.message_id,
        disable_web_page_preview: true
    }).catch(catchHandle)
}

export const sessionPostCreateQuest = async (
    message: TelegramBot.Message,
    result: Await<ReturnType<typeof sessionCreateQuest>>,
    api: TelegramBot
) => {
    const manager = managerEngine
    const runResult = await manager.executeCodeHeadless(result.language, result.exampleCode, result.exampleInput)

    if (!compareNormalized(runResult.stdout, result.exampleOutput)) {
        return abort(`Error: example failed the validate
Expect:
${result.exampleOutput.trim()}
Actually:
${runResult.stdout.trim()}`, api, message)
    }

    for (const [k, v] of result.samples.entries()) {
        const runResult = await manager.executeCodeHeadless(result.language, result.exampleCode, v.input)

        if (!compareNormalized(runResult.stdout, v.output)) {
            return abort(`Error: sample ${k + 1} failed the validate
Expect:
${v.output.trim()}
Actually:
${runResult.stdout.trim()}`, api, message)
        }
    }

    const questId = Math.random().toString(16).slice(2);

    await repositoryQuestDraft.set({
        ...result,
        id: questId,
        author: message.from!.id
    })

    api.sendMessage(message.chat.id, 'Quest created', {
        reply_to_message_id: message.message_id,
    }).catch(catchHandle)
}