import type * as TelegramBot from "node-telegram-bot-api"
import type { Session, Await, IRepositorySession } from "../interfaces";
import { createContinuableContext, createStaticContext } from "../session-context";
import { runContinuable } from "../utils/continuable";
import { catchHandle } from "../bot"
import { AbortError } from "../errors/AbortError";

type SessionDeclaration = {
    run: (...args: any[]) => Promise<any>
    success: (
        message: TelegramBot.Message,
        response: any,
        api: TelegramBot
    ) => any
    error: (
        message: TelegramBot.Message,
        error: any,
        api: TelegramBot
    ) => any
}

export const sessionPostDefault= () => {}

export const sessionErrorDefault= (
    message: TelegramBot.Message,
    error: any,
    api: TelegramBot
) => {
    if (error instanceof AbortError) {
        return
    }

    catchHandle(error)
    api.sendMessage(message.chat.id, "Session destroyed due to internal error, Please contact the bot owner", {
        reply_to_message_id: message.message_id,
    }).catch(catchHandle)
}

export class ManagerSession {
    private sessionHandlers = new Map<string, SessionDeclaration>()

    constructor (
        private api: TelegramBot,
        private sessionRepo: IRepositorySession,
    ) {}

    registerHandler<T extends (...args: any[]) => Promise<any>> (
        name: string,
        run: T,
        success: ((
            message: TelegramBot.Message,
            response: Await<ReturnType<typeof run>>,
            api: TelegramBot
        ) => any) = sessionPostDefault,
        error: ((
            message: TelegramBot.Message,
            error: any,
            api: TelegramBot
        ) => any) = sessionErrorDefault
    ) {
        this.sessionHandlers.set(name, {
            run,
            success,
            error
        })
    }

    async start(type: string, message: TelegramBot.Message, ...args: any[]) {
        const sessionId = Math.random().toString(16).slice(2);
        const handler = this.sessionHandlers.get(type)
        if (handler == null) {
            return console.error(`Unknown handler type ${type}`)
        }

        let ended = false

        try {
            const res = await (runContinuable(
                handler.run,
                createStaticContext(this.api),
                createContinuableContext(this.api),
                null,
                (s) => {
                    if (!ended) {
                        this.sessionRepo.set({ id: sessionId, state: s, type: type, args: [message, ...args] })
                    }
                },
                message,
                ...args
            ) as any)

            await handler.success(message, res, this.api)
        } catch (err) {
            await handler.error(message, err, this.api)
        } finally {
            ended = true
            // This can actually fail because it can happen before the first time it was wrote
            try {
                await this.sessionRepo.delete(sessionId)
            } catch (err) {}
        }
    }

    async load () {
        // Initialize sessions
        const sessions = await this.sessionRepo.list()

        for (let session of sessions) {
            this.continue(session)
                .catch(catchHandle)
        }
    }

    async continue (session: Session) {
        const type = session.type
        const handler = this.sessionHandlers.get(type)!
        const [message, args] = session.args

        if (handler == null) {
            console.error(`Unknown handler type ${type}`)
            return this.sessionRepo.delete(session.id).catch(catchHandle)
        }

        try {
            const res = await runContinuable(
                handler.run,
                createStaticContext(this.api),
                createContinuableContext(this.api),
                session.state,
                (s) => this.sessionRepo.set({ ...session, state: s }),
                message,
                args
            )

            await handler.success(message, res, this.api)
        } catch (err) {
            await handler.error(message, err, this.api)
        } finally {
            await this.sessionRepo.delete(session.id).catch(catchHandle)
        }
    }
}