import type * as TelegramBot from "node-telegram-bot-api";
import { managerEngine, repositoryQuest } from "../bot";
import type { IRepositoryQuest, IRepositoryQuestDraft, Quest, QuestDraft } from "../interfaces";

export const ANSWER_QUEST_START_IDENTIFIER = 'answer-quest'
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
        private self: TelegramBot.User,
        private questDraftRepo: IRepositoryQuestDraft,
        private questRepo: IRepositoryQuest
    ) {}

    getQuestMessage (questDraft: QuestDraft) {
        return `Title:
<pre>${escapeHtml(questDraft.title)}</pre>
Description:
<pre>${escapeHtml(questDraft.description)}</pre>
Example Input:
<pre>${escapeHtml(questDraft.exampleInput)}</pre>
Example Output:
<pre>${escapeHtml(questDraft.exampleOutput)}</pre>`
    }

    async createQuestList (message: TelegramBot.InlineQuery): Promise<TelegramBot.InlineQueryResult[]> {
        const results: TelegramBot.InlineQueryResult[] = []

        const questDrafts = await this.questDraftRepo.find({ author: message.from.id })

        const newQuestId = Math.random().toString(16).slice(2)
        
        for (let questDraft of questDrafts) {
            results.push({
                id: INLINE_QUEST_QUERY_RESULT_IDENTIFIER + questDraft.id + '/' + newQuestId,
                type: 'article',
                title: questDraft.title + ' - ' + questDraft.description.replace(/\r?\n/g, ' ').slice(0, 50),
                input_message_content: {
                    message_text: this.getQuestMessage(questDraft),
                    parse_mode: 'HTML',
                    disable_web_page_preview: true
                },
                reply_markup: {
                    inline_keyboard: [[{
                        text: 'Answer the question',
                        url: `https://t.me/${this.self.username!}?start=${ANSWER_QUEST_START_IDENTIFIER}_${newQuestId}`
                    }]]
                }
            })
        }

        return results
    }

    async handleChosenInlineResult (chosen: TelegramBot.ChosenInlineResult) {
        const [draftId, questId] = chosen.result_id.replace(INLINE_QUEST_QUERY_RESULT_IDENTIFIER, '').split('/')
        const draft = await this.questDraftRepo.get(draftId)
        const quest: Quest = {
            ...draft,
            id: questId,
            message_id: chosen.inline_message_id!,
            users: []
        }
        await this.questRepo.set(quest)
    }

    async handleAnswer (questId: string, message: TelegramBot.Message ,language: string, code: string) {
        const quest = await repositoryQuest.get(questId)
        
        const exampleResult = await managerEngine.executeCodeHeadless(language, code, quest.exampleInput)

        if (!compareNormalized(exampleResult.stdout, quest.exampleOutput)) {
            this.api.sendMessage(message.from!.id, `
<b>Failed, the example output didn\'t match.</b>
Input:
<pre>${escapeHtml(quest.exampleInput)}</pre>
Expect:
<pre>${escapeHtml(quest.exampleOutput)}</pre>
Actual:
<pre>${escapeHtml(exampleResult.stdout)}</pre>
`, {
                reply_to_message_id: message.message_id,
                parse_mode: 'HTML'
            })
            return
        }

        const results: boolean[] = []

        for (const sample of quest.samples) {
            const sampleResult = await managerEngine.executeCodeHeadless(language, code, sample.input)
            results.push(compareNormalized(sampleResult.stdout, sample.output))
        }

        if (results.some(it => !it)) {
            this.api.sendMessage(message.from!.id, `
<b>Failed, some samples didn\'t match.</b>
${results.map((it, index) => 'Sample ' + (index + 1) + ': ' + (it ? 'Success' : 'Failed') + '\n')}
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

        const newQuest = await this.questRepo.get(quest.id)

        const header = this.getQuestMessage(quest)
        const userList = newQuest.users.map(
            (user, index) => escapeHtml(`${index + 1}. ${user.first_name ?? ''} ${user.last_name ?? ''}`)
        ).join('\n')

        await this.api.editMessageText(header + '\n<b>Passed users:</b>\n' + userList, {
            inline_message_id: quest.message_id,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: {
                inline_keyboard: [[{
                    text: 'Answer the question',
                    url: `https://t.me/${this.self.username!}?start=${ANSWER_QUEST_START_IDENTIFIER}_${quest.id}`
                }]]
            }
        })

        
        await this.api.sendMessage(message.from!.id, `
<b>Congratulation</b>
You passed the quest
        `, {
            reply_to_message_id: message.message_id,
            parse_mode: 'HTML',
        })
    }
}