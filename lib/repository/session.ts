import { IRepositorySession, Session } from "../interfaces";
import { promises as fs } from 'fs'
import * as path from 'path'
import { TSON } from "../tson";

type op = {
    session: string,
    type: string,
    fn: (...args: any[]) => Promise<any>,
    resolveCallbacks: ((arg: any)=>void)[],
    rejectCallbacks: ((arg: any)=>void)[]
}

export class RepositorySession implements IRepositorySession {
    private running: boolean = false
    private pendingOps: op[] = []

    constructor(private directory: string) {
        this.execute('', 'prepare', async () => {
            try {
                const stat = await fs.stat(directory)
            } catch (err) {
                await fs.mkdir(directory)
            }
        })
    }

    private async startRun () {
        this.running = true
        let currentTask: op | undefined
        while (currentTask = this.pendingOps.shift()) {
            if (currentTask != null) {
                try {
                    const res = await currentTask.fn()
                    currentTask.resolveCallbacks.forEach(it => it(res))
                } catch (err) {
                    currentTask.rejectCallbacks.forEach(it => it(err))
                }
            }
        }
        this.running = false
    }

    private execute<U> (session: string, type: string, fn: (...args: any[]) => Promise<any>): Promise<U> {
        const oldTask = this.pendingOps.find(it => it.session === session && it.type === type)
        const currentTask: op = oldTask ?? {
            session,
            type,
            fn,
            resolveCallbacks: [],
            rejectCallbacks: []
        }

        if (oldTask == null) {
            this.pendingOps.push(currentTask)
        }

        return new Promise((resolve, reject) => {
            currentTask.resolveCallbacks.push(resolve)
            currentTask.rejectCallbacks.push(reject)
            if (!this.running) {
                this.startRun()
            }
        })
    }

    list(): Promise<Session[]> {
        return this.execute('', 'list', async () => {
            const files = await fs.readdir(this.directory)
            const results: Session[] = []
            for (let filename of files) {
                if (!/\.json$/.test(filename)) {
                    continue
                }

                const fullPath = path.resolve(this.directory, filename)

                const fileState = await fs.stat(fullPath)

                if (!fileState.isFile()) {
                    continue
                }

                const session: Session = TSON.parse(await fs.readFile(fullPath, { encoding: 'utf-8' }))
                results.push(session)
            }
            return results
        })
    }

    get(id: string): Promise<Session> {
        return this.execute(id, 'get', async () => {
            const fullPath = path.resolve(this.directory, id + '.json')
            return TSON.parse(await fs.readFile(fullPath, { encoding: 'utf-8' }))
        })
    }

    set(session: Session): Promise<void> {
        const serialized = TSON.stringify(session, undefined, 4)

        return this.execute(session.id, 'set', async () => {
            const fullPath = path.resolve(this.directory, session.id + '.json')
            return await fs.writeFile(fullPath, serialized)
        })
    }

    delete(id: string): Promise<void> {
        return this.execute(id, 'delete', async () => {
            const fullPath = path.resolve(this.directory, id + '.json')
            return await fs.unlink(fullPath)
        })
    }
}