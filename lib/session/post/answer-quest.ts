import type * as TelegramBot from "node-telegram-bot-api";
import { managerQuest } from "../../bot";
import type { Await } from "../../interfaces";
import type { sessionAnswerQuest } from "../answer-quest";

export const sessionPostAnswerQuest = async (
    message: TelegramBot.Message,
    result: Await<ReturnType<typeof sessionAnswerQuest>>,
    api: TelegramBot
) => {
    managerQuest.handleAnswer(result.questId, result.codeMessage, result.language, result.code)
}