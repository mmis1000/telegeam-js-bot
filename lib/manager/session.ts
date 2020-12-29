import type * as TelegramBot from "node-telegram-bot-api"
import type { Session, Await } from "../interfaces";
import type { RepositorySession } from "../repository/session";
import { createContinuableContext, createStaticContext } from "../session-context";
import { runContinuable } from "../utils/continuable";
import { catchHandle } from "../bot"
import type { ManagerEngine } from "./engine";
import { AbortError } from "../errors/AbortError";

type SessionDeclaration = {
    run: (...args: any[]) => Promise<any>
    success: (
        message: TelegramBot.Message,
        response: any,
        manager: ManagerEngine,
        api: TelegramBot
    ) => any
    error: (
        message: TelegramBot.Message,
        error: any,
        manager: ManagerEngine,
        api: TelegramBot
    ) => any
}

export const sessionPostDefault= () => {}

export const sessionErrorDefault= (
    message: TelegramBot.Message,
    error: any,
    manager: ManagerEngine,
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
        private sessionRepo: RepositorySession,
        private engineManager: ManagerEngine
    ) {}

    registerHandler<T extends (...args: any[]) => Promise<any>> (
        name: string,
        run: T,
        success: ((
            message: TelegramBot.Message,
            response: Await<ReturnType<typeof run>>,
            manager: ManagerEngine,
            api: TelegramBot
        ) => any) = sessionPostDefault,
        error: ((
            message: TelegramBot.Message,
            error: any,
            manager: ManagerEngine,
            api: TelegramBot
        ) => any) = sessionErrorDefault
    ) {
        this.sessionHandlers.set(name, {
            run,
            success,
            error
        })
    }

    async start(type: string, message: TelegramBot.Message) {
        const sessionId = Math.random().toString(16).slice(2);
        const handler = this.sessionHandlers.get(type)
        if (handler == null) {
            return console.error(`Unknown handler type ${type}`)
        }

        try {
            const res = await (runContinuable(
                handler.run,
                createStaticContext(this.api),
                createContinuableContext(this.api),
                null,
                (s) => this.sessionRepo.set({ id: sessionId, state: s, type: type, args: [message] }),
                message
            ) as any)

            await handler.success(message, res, this.engineManager, this.api)
        } catch (err) {
            await handler.error(message, err, this.engineManager, this.api)
        } finally {
            await this.sessionRepo.delete(sessionId).catch(catchHandle)
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

            await handler.success(message, res, this.engineManager, this.api)
        } catch (err) {
            await handler.error(message, err, this.engineManager, this.api)
        } finally {
            await this.sessionRepo.delete(session.id).catch(catchHandle)
        }
    }
}