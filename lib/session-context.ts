
import type * as TelegramBot from 'node-telegram-bot-api'
import type { ContinuableContinuableExtension, BaseContinuableContext, ContinuableFixedExtension } from './interfaces'

const assertStaticExtension = <T extends ContinuableFixedExtension>(arg: T) => arg

type ExcludeNonFunction<T> = Pick<T, {
    [K in keyof T]: T[K] extends (...args: any[]) => any ? K : never
}[keyof T]>
export const createStaticContext = (api: TelegramBot) => {
    return assertStaticExtension(api as ExcludeNonFunction<TelegramBot>)
}

const assertContinuableExtension = <T extends ContinuableContinuableExtension>(arg: T) => arg
export const createContinuableContext = (api: TelegramBot) => {
    return assertContinuableExtension({
        async question(
                ctx,
                chatId: TelegramBot.Chat['id'],
                question: string,
                options: Partial<TelegramBot.SendMessageOptions> = {}
            ) {
            const msg = await ctx.run(() => api.sendMessage(chatId, question, {
                ...options,
                reply_markup: {
                    force_reply: true,
                    selective: true
                }
            }))

            return ctx.run(() => new Promise<TelegramBot.Message>(resolve => {
                const listener = (ev: TelegramBot.Message) => {
                    if (
                        ev.reply_to_message != null &&
                        ev.reply_to_message.chat.id === msg.chat.id &&
                        ev.reply_to_message.message_id === msg.message_id
                    ) {
                        api.removeListener('text', listener)
                        resolve(ev)
                    }
                }

                api.addListener('text', listener)
            }))
        },
        async options<U extends {text: string, value: string }[]>(
            ctx: BaseContinuableContext,
            chatId: TelegramBot.Chat['id'],
            question: string,
            answers: U,
            options: Partial<TelegramBot.SendMessageOptions> = {}
        ): Promise<U[number]['value']> {
            const keyboard: TelegramBot.InlineKeyboardMarkup = {
                inline_keyboard: []
            }

            const tag = ctx.run(() => 'reply_' + Math.random().toString(16).slice(2) + ':')

            const dataToItemMap = new Map<string, U[number]['value']>()

            for (let [k, item] of answers.entries()) {
                if (k % 2 === 0) {
                    keyboard.inline_keyboard.push([])
                }

                const data = tag + k
                dataToItemMap.set(data, item.value)

                keyboard.inline_keyboard[keyboard.inline_keyboard.length - 1].push({
                    text: item.text,
                    callback_data: data
                })
            }

            await ctx.run(() => api.sendMessage(chatId, question, {
                ...options,
                reply_markup: keyboard
            }))

            return ctx.run(() => new Promise<U[number]['value']>(resolve => {
                const listener = (ev: TelegramBot.CallbackQuery) => {
                    if (dataToItemMap.has(ev.data!)) {
                        api.removeListener('callback_query', listener)
                        api.answerCallbackQuery(ev.id)
                        resolve(dataToItemMap.get(ev.data!)!)
                    }
                }

                api.addListener('callback_query', listener)
            }))
        },
        log (ctx, ...args: any[]) {
            console.log(...args)
        }
    })
}