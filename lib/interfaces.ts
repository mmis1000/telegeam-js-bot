export type Engine = import('events').EventEmitter & {
    name: string,
    _docker: import('child_process').ChildProcess,
    destroyed: boolean,
    destroy(): void,
    run (conf: Program): EngineRunner
}

export type RunnerStreamData = {
    type: string,
    text: string,
    language: string,
    id?: string
}

export type EngineRunnerParsedExitData = {
    code: number | null,
    signal: string | number | null,
    time?: [string, string][]
}


export type EngineRunner = import('events').EventEmitter & {
    id: string,
    write (arg: any): void,
    kill (signal: number | string): void

    on (event: 'stdout', cb: (data: RunnerStreamData) => void): EngineRunner
    on (event: 'stderr', cb: (data: RunnerStreamData) => void): EngineRunner
    on (event: 'throw', cb: (data: RunnerStreamData) => void): EngineRunner
    on (event: 'error', cb: (data: RunnerStreamData) => void): EngineRunner
    on (event: 'log', cb: (data: RunnerStreamData) => void): EngineRunner
    on (event: 'exit', cb: (data: RunnerStreamData) => void): EngineRunner
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
export type ContinuableFunction<
    T extends ContinuableFixedExtension,
    U extends ContinuableContinuableExtension,
    V extends any[],
    W
> = (context: ContinuableContext<T, U>, message: TelegramBot.Message,...args: V) => W

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
    type: string
    args: [TelegramBot.Message, ...any[]],
    state: ContinuableState
}

export type OnlyPrimitiveKeys<T> = {
    [K in keyof T]: T[K] extends (string|number|boolean) ? K : never
}[keyof T]

export type OnlyPrimitiveProp<T> = {
    [K in OnlyPrimitiveKeys<T>]: T[K]
}

export interface IRepository<T extends { id: string }> {
    list(): Promise<T[]>
    get(id: string): Promise<T>
    set(session: T): Promise<void>
    delete(id: string): Promise<void>
    update(id: string, cb: (old: T) => T): Promise<void>
    find(query: Partial<OnlyPrimitiveProp<T>>): Promise<T[]>
}

export interface IRepositorySession extends IRepository<Session> {}

export type Await<T> = T extends {
    then(onfulfilled?: (value: infer U) => unknown): unknown;
} ? U : T;

export type QuestSpec = {
    title: string,
    description: string,
    exampleInput: string,
    exampleOutput: string,
    language: string,
    exampleCode: string,
    samples: {
        input: string,
        output: string
    }[]
}

export type QuestDraft = QuestSpec & {
    id: string
    author: number
}

export type Quest = QuestDraft & {
    users: TelegramBot.User[],
    message_id: NonNullable<TelegramBot.ChosenInlineResult['inline_message_id']>
}

export interface IRepositoryQuestDraft extends IRepository<QuestDraft> {}
export interface IRepositoryQuest extends IRepository<Quest> {}