import * as TelegramBot from "node-telegram-bot-api";
import { catchHandle, managerEngine, repositoryQuest } from "../bot";
import type { IRepositoryQuest, OnlyPrimitiveProp, Quest } from "../interfaces";
import { sleep } from "../utils/promise-utils";

export const CREATE_QUEST_START_IDENTIFIER = 'create-quest'
export const ANSWER_QUEST_START_IDENTIFIER = 'answer-quest'

export const CALLBACK_QUERY_ANSWER_START_IDENTIFIER = 'answer-quest-callback'
export const CALLBACK_QUERY_SHARE_START_IDENTIFIER = 'share-quest-callback'

export const INLINE_QUERY_SHARE_START_IDENTIFIER = 'share-quest-inline'

export const INLINE_QUEST_QUERY_RESULT_IDENTIFIER = 'select-quest:'

const compareNormalized = (str1: string, str2: string) => {
    return str1.replace(/\r\n/g, '\n').replace(/\n+$/, '') === str2.replace(/\r\n/g, '\n').replace(/\n+$/, '')
}

function escapeHtml(unsafe: string) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}
export class ManagerQuest {
    constructor (
        private api: TelegramBot,
        private questRepo: IRepositoryQuest,
    ) {}

    getQuestMessage (quest: Quest) {
        let text = `<b>Title:</b>
<pre>${escapeHtml(quest.title)}</pre>
<b>Description:</b>
<pre>${escapeHtml(quest.description)}</pre>
<b>Example Input:</b>
<pre>${escapeHtml(quest.exampleInput.trim())}</pre>
<b>Example Output:</b>
<pre>${escapeHtml(quest.exampleOutput.trim())}</pre>`
        if (quest.users.length > 0) {
            const userList = quest.users.slice(0, 10).map(
                (user, index) => escapeHtml(`${index + 1}. ${user.first_name ?? ''} ${user.last_name ?? ''}`)
            ).join('\n')
            text += '\n<b>Passed users:</b>\n' + userList

            if (quest.users.length > 10) {
                text += `\nAnd other ${quest.users.length - 10} users.`
            }
        }

        return text
    }

    createQuestList (message: TelegramBot.InlineQuery): Promise<TelegramBot.InlineQueryResult[]> {
        return this.createQuestListRaw({ author: message.from.id })
    }
    createQuestListFromId (id: Quest['id']): Promise<TelegramBot.InlineQueryResult[]> {
        return this.createQuestListRaw({ id })
    }

    async createQuestListRaw (query: Partial<OnlyPrimitiveProp<Quest>>): Promise<TelegramBot.InlineQueryResult[]> {
        const results: TelegramBot.InlineQueryResult[] = []

        const quests = await this.questRepo.find(query)
        
        for (let quest of quests) {
            results.push({
                id: INLINE_QUEST_QUERY_RESULT_IDENTIFIER + quest.id,
                type: 'article',
                title: quest.title + ' - ' + quest.description.replace(/\r?\n/g, ' ').slice(0, 50),
                input_message_content: {
                    message_text: this.getQuestMessage(quest),
                    parse_mode: 'HTML',
                    disable_web_page_preview: true
                },
                reply_markup: {
                    inline_keyboard: [
                        [{
                            text: 'Answer the quest',
                            callback_data: CALLBACK_QUERY_ANSWER_START_IDENTIFIER + ':' + quest.id
                        }],
                        [{
                            text: 'Share the quest',
                            switch_inline_query: INLINE_QUERY_SHARE_START_IDENTIFIER + ':' + quest.id
                        }]
                    ]
                }
            })
        }

        return results
    }

    async handleChosenInlineResult (chosen: TelegramBot.ChosenInlineResult) {
        const questId = chosen.result_id.replace(INLINE_QUEST_QUERY_RESULT_IDENTIFIER, '')
        const draft = await this.questRepo.get(questId)
        const quest: Quest = {
            ...draft,
            message_id: [...draft.message_id, chosen.inline_message_id!],
        }
        await this.questRepo.set(quest)
    }

    async handleAnswer (questId: string, message: TelegramBot.Message ,language: string, code: string) {
        let quest
        try {
            quest = await repositoryQuest.get(questId)
        } catch (err) {
            await this.api.sendMessage(message.from!.id, 'Sorry, the quest no longer exists')
            return
        }
        
        const exampleResult = await managerEngine.executeCodeHeadless(language, code, quest.exampleInput)

        if (exampleResult.timeout) {
            this.api.sendMessage(message.from!.id, `
<b>Failed, the example program has timeouted.</b>
`, {
                reply_to_message_id: message.message_id,
                parse_mode: 'HTML'
            })
            return
        }
        if (!compareNormalized(exampleResult.stdout, quest.exampleOutput)) {
            this.api.sendMessage(message.from!.id, `
<b>Failed, the example output didn\'t match.</b>
<b>Input:</b>
<pre>${escapeHtml(quest.exampleInput.trim())}</pre>
<b>Expect:</b>
<pre>${escapeHtml(quest.exampleOutput.trim())}</pre>
<b>Actual:</b>
<pre>${escapeHtml(exampleResult.stdout.trim())}</pre>
`, {
                reply_to_message_id: message.message_id,
                parse_mode: 'HTML'
            })
            return
        }

        const results: ("OK" | "ERROR" | "TIMEOUT")[] = []

        for (const sample of quest.samples) {
            const sampleResult = await managerEngine.executeCodeHeadless(language, code, sample.input)

            if (sampleResult.timeout) {
                results.push("TIMEOUT")
            }

            results.push(compareNormalized(sampleResult.stdout, sample.output) ? "OK" : "ERROR")
        }

        if (results.some(it => it != "OK")) {
            this.api.sendMessage(message.from!.id, `
<b>Failed, some samples didn\'t match.</b>
${results.map((it, index) => {
    return 'Sample ' + (index + 1) + ': ' + (it === 'OK' ? 'Success' : it === 'ERROR' ? 'Failed' : 'Timeout')
}).join('\n')}
`, {
                reply_to_message_id: message.message_id,
                parse_mode: 'HTML'
            })
            return
        }

        await this.questRepo.update(quest.id, (old) => {
            return {
                ...old,
                users: [
                    ...old.users,
                    message.from!
                ]
            }
        })

        const currentQuest = await this.questRepo.get(quest.id)

        await this.api.sendMessage(message.from!.id, `
<b>Congratulation</b>
You passed the quest
        `, {
            reply_to_message_id: message.message_id,
            parse_mode: 'HTML',
        }).catch(catchHandle)

        const text = this.getQuestMessage(currentQuest)

        const idToRemove: string[] = []

        for (const id of quest.message_id) {
            try {
                await this.api.editMessageText(text, {
                    inline_message_id: id,
                    parse_mode: 'HTML',
                    disable_web_page_preview: true,
                    reply_markup: {
                        inline_keyboard: [
                            [{
                                text: 'Answer the quest',
                                callback_data: CALLBACK_QUERY_ANSWER_START_IDENTIFIER + ':' + quest.id
                            }],
                            [{
                                text: 'Share the quest',
                                switch_inline_query: INLINE_QUERY_SHARE_START_IDENTIFIER + ':' + quest.id
                            }]
                        ]
                    }
                })
                await sleep(1000)
            } catch (err) {
                // force a cooldown
                if (err instanceof (TelegramBot as any).errors.TelegramError) {
                    const response: import('http').IncomingMessage = err.response

                    // wait a while and do next
                    if (response.statusCode === 429) {
                        await sleep(20000)
                    }
                } else {
                    idToRemove.push(id)
                    await sleep(1000)
                }
            }
        }

        this.questRepo.update(quest.id, (old) => {
            return {
                ...old,
                message_id: old.message_id.filter(i => !idToRemove.includes(i))
            }
        }).catch(catchHandle)
    }
}