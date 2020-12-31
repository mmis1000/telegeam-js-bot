import type * as TelegramBot from "node-telegram-bot-api";
import { managerQuest, repositoryQuest, runnerList } from "../bot";
import { AbortError } from "../errors/AbortError";
import type { SessionContext } from "../interfaces";

export const sessionAnswerQuest = async (
    ctx: SessionContext,
    msg: TelegramBot.Message,
    questId: string
) => {   
    const quest = await repositoryQuest.get(questId)

    if (quest.users.find(it => it.id === msg.from!.id)) {
        ctx.sendMessage(msg.chat.id, "Sorry, you have finished the quest.")
        throw new AbortError('user answered')
    }

    const runners = runnerList.map(i => ({
        text: i.type,
        value: i.type
    }))

    const questText = managerQuest.getQuestMessage(quest)

    const language = await ctx.options(
        msg.chat.id,
        questText + "\n\n<b>Select a language to answer the quest</b>\nInput comes from standard input",
        runners,
        {
            parse_mode: 'HTML'
        }
    )

    const code = await ctx.question(
        msg.chat.id,
        "Type the code here"
    )

    return {
        questId,
        language,
        codeMessage: code,
        code: code.text ?? ''
    }
}