import type * as TelegramBot from "node-telegram-bot-api";
import { catchHandle, repositoryQuest } from "../../bot";
import type { Await } from "../../interfaces";
import type { ManagerEngine } from "../../manager/engine";
import type { sessionCreateQuest } from "../create-quest";

const compareNormalized = (str1: string, str2: string) => {
    return str1.replace(/\r\n/g, '\n').replace(/\n+$/, '') === str2.replace(/\r\n/g, '\n').replace(/\n+$/, '')
}

const abort = (errorMsg: string, api: TelegramBot, message: TelegramBot.Message) => {
    api.sendMessage(message.chat.id, errorMsg, {
        reply_to_message_id: message.message_id,
    }).catch(catchHandle)
}

export const sessionPostCreateQuest = async (
    message: TelegramBot.Message,
    result: Await<ReturnType<typeof sessionCreateQuest>>,
    manager: ManagerEngine,
    api: TelegramBot
) => {
    const runResult = await manager.executeCodeHeadless(result.language, result.exampleCode, result.exampleInput)

    if (!compareNormalized(runResult.stdout, result.exampleOutput)) {
        return abort(`Error: example failed the validate
Expect: ${result.exampleOutput}
Actually: ${runResult.stdout}`, api, message)
    }

    for (const [k, v] of result.samples.entries()) {
        const runResult = await manager.executeCodeHeadless(result.language, result.exampleCode, v.input)

        if (!compareNormalized(runResult.stdout, v.output)) {
            return abort(`Error: sample ${k + 1} failed the validate
Expect: ${v.output}
Actually: ${runResult.stdout}`, api, message)
        }
    }

    const questId = Math.random().toString(16).slice(2);

    await repositoryQuest.set({
        ...result,
        id: questId,
        users: []
    })

    api.sendMessage(message.chat.id, 'Quest created', {
        reply_to_message_id: message.message_id,
    }).catch(catchHandle)
}