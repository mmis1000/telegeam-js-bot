export type Engine = import('events').EventEmitter & {
    name: string,
    _docker: import('child_process').ChildProcess,
    destroyed: boolean,
    destroy(): void,
    run (conf: Program): EngineRunner
}

export type EngineRunner = import('events').EventEmitter & {
    id: string,
    write (arg: any): void,
    kill (signal: number | string): void
}

export type Program = {
    id?: string,
    user?: string,
    type: string,
    program: string
}

export type DockerBaseLogger = import('events').EventEmitter & {
    stdout(info: any): void
    stderr(info: any): void
    log(info: any): void
    error(info: any): void
    throw(info: any): void
    status(info: any): void
    exit(info: any): void
}

export type DockerLogger = DockerBaseLogger & {
    createNamedLogger(language?: string, id?: string): DockerBaseLogger
}

export type DockerLanguageDef = {
    setup (work_dir: string, file_content: string, cb: (path: string) => void, con: DockerBaseLogger): void
    getExecuteArgs (file_path: string): {
        path: string,
        args: string[],
        opts: import('child_process').SpawnOptionsWithoutStdio
    }
}

export type ContinuableStateResult = {
    success: true
    async: boolean
    result: any
} | {
    success: false
    async: boolean
    error: any
}

export type ContinuableState = {
    results: ContinuableStateResult[]
    data: Record<string, any>
}

export type ContinuableFixedExtension = {
    [key: string]: (...args: any[]) => any
}
export type ContinuableContinuableExtension = {
    [key: string]: (ctx: BaseContinuableContext, ...args: any[]) => any
}

export type UnwrapContinuableExtension<T extends ContinuableContinuableExtension> = {
    [K in keyof T]: T[K] extends
        (ctx: BaseContinuableContext, ...args: infer A) => any ? (...args: A) => ReturnType<T[K]> : 
        never
}

export type ContinuableContext<T extends ContinuableFixedExtension, U extends ContinuableContinuableExtension> = {
    wrap<V extends (...args: any[])=>any>(fn: V): V
    run<V extends (...args: any[])=>any>(fn: V): ReturnType<V>
    data: Record<string, any>
} & T & UnwrapContinuableExtension<U>

export type BaseContinuableContext = ContinuableContext<{}, {}>
export type ContinuableFunction<T extends ContinuableFixedExtension, U extends ContinuableContinuableExtension, V extends any[], W> = (context: ContinuableContext<T, U>, ...args: V) => W

export type ContinuableUpdateHook = (state: ContinuableState) => void


import type { createStaticContext, createContinuableContext } from "./session-context";

import type * as TelegramBot from 'node-telegram-bot-api'
export type SessionContext =
    Omit<ContinuableContext<ReturnType<typeof createStaticContext>, ReturnType<typeof createContinuableContext>>, 'options'> &
    // The generic was lost after the pick, so we fix it
    {
        options<U extends {text: string, value: string }[]>(
            chatId: TelegramBot.Chat['id'],
            question: string,
            answers: U,
            options?: Partial<TelegramBot.SendMessageOptions>
        ): Promise<U[number]['value']>
    }

export type Session = {
    id: string
    args: any[],
    state: ContinuableState
}

export interface IRepositorySession {
    list(): Promise<Session[]>
    get(id: string): Promise<Session>
    set(session: Session): Promise<void>
    delete(id: string): Promise<void>
}