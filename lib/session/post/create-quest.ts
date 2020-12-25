import TelegramBot = require("node-telegram-bot-api");
import { catchHandle } from "../../bot";
import { ManagerEngine } from "../../manager/engine";
import { sessionCreateQuest } from "../create-quest";

export const sessionPostCreateQuest = (
    message: TelegramBot.Message,
    result: ReturnType<typeof sessionCreateQuest>,
    manager: ManagerEngine,
    api: TelegramBot
) => {
    api.sendMessage(message.chat.id, JSON.stringify(result, undefined, 4), {
        reply_to_message_id: message.message_id,
    }).catch(catchHandle)
}