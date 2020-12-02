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