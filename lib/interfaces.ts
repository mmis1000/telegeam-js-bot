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