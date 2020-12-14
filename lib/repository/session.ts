import { IRepositorySession, Session } from "../interfaces";
import { promises as fs } from 'fs'
import * as path from 'path'
import { TSON } from "../utils/tson";
import { findOrCreate } from "../utils/array-util";
import { Runnable } from '../utils/runnable'

type op = {
    session: string,
    type: string,
    resolveCallbacks: ((arg: any)=>void)[],
    rejectCallbacks: ((arg: any)=>void)[],
    fn: (...args: any[]) => Promise<any>
}

export class RepositorySession implements IRepositorySession {
    constructor(private directory: string) {
        this.execute('', 'prepare', async () => {
            try {
                const stat = await fs.stat(directory)
            } catch (err) {
                await fs.mkdir(directory)
            }
        })
    }

    private runner = new Runnable<op>(async currentTask => {
        try {
            const res = await currentTask.fn()
            currentTask.resolveCallbacks.forEach(it => it(res))
        } catch (err) {
            currentTask.rejectCallbacks.forEach(it => it(err))
        }
    })

    private execute<U> (session: string, type: string, fn: (...args: any[]) => Promise<any>): Promise<U> {
        return this.runner.updateQueue(ops => {
            const currentTask: op = findOrCreate(
                ops,
                it => it.session === session && it.type === type,
                () => ({
                    session,
                    type,
                    fn,
                    resolveCallbacks: [],
                    rejectCallbacks: []
                })
            )

            return new Promise<U>((resolve, reject) => {
                // just replace old task
                currentTask.fn = fn
                currentTask.resolveCallbacks.push(resolve)
                currentTask.rejectCallbacks.push(reject)
            })
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