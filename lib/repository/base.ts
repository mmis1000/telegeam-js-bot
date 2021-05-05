import type { IRepository, OnlyPrimitiveProp } from "../interfaces";
import { promises as fs } from 'fs'
import * as path from 'path'
import { TSON } from "../utils/tson";
import { findOrCreate } from "../utils/array-util";
import { Runnable } from '../utils/runnable'
import * as mkdirp from 'mkdirp'

type op = {
    id: string,
    type: string,
    resolveCallbacks: ((arg: any) => void)[],
    rejectCallbacks: ((arg: any) => void)[],
    barrierAfter: string[],
    noMerge: boolean,
    fn: (...args: any[]) => Promise<any>
}

export class BaseRepository<T extends { id: string }> implements IRepository<T> {
    constructor(private directory: string) {
        this.execute('', 'prepare', async () => {
            await mkdirp(directory)
        })
    }
    async find(query: Partial<OnlyPrimitiveProp<T>>): Promise<T[]> {
        const items = await this.list()
        return items.filter(item => {
            for (let key in query) {
                if ((query as any)[key] !== (item as any)[key]) {
                    return false
                }
            }

            return true
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

    protected execute<U>(
        id: string,
        type: string,
        fn: (...args: any[]) => Promise<any>,
        barrierAfter: string[] = [],
        noMerge: boolean = false
    ): Promise<U> {
        return this.runner.updateQueue(ops => {
            const matchOrBarrier = ops.filter(it => {
                return it.id === id &&
                    (it.type === type || it.barrierAfter.includes(type))
            })

            const forcePush =
                noMerge ||
                (matchOrBarrier.length > 0
                    ? matchOrBarrier[matchOrBarrier.length - 1]!.type !== type
                    : false)

            let currentTask: op

            if (forcePush) {
                currentTask = {
                    id,
                    type,
                    fn,
                    resolveCallbacks: [],
                    rejectCallbacks: [],
                    noMerge,
                    barrierAfter
                }
                ops.push(currentTask)
            } else {
                currentTask = findOrCreate(
                    ops,
                    it => it.id === id && it.type === type,
                    () => ({
                        id,
                        type,
                        fn,
                        resolveCallbacks: [],
                        rejectCallbacks: [],
                        noMerge,
                        barrierAfter
                    })
                )
            }

            return new Promise<U>((resolve, reject) => {
                // just replace old task
                currentTask.fn = fn
                currentTask.resolveCallbacks.push(resolve)
                currentTask.rejectCallbacks.push(reject)
            })
        })
    }

    list(): Promise<T[]> {
        return this.execute('', 'list', async () => {
            const files = await fs.readdir(this.directory)
            const results: T[] = []
            for (let filename of files) {
                if (!/\.json$/.test(filename)) {
                    continue
                }

                const fullPath = path.resolve(this.directory, filename)

                const fileState = await fs.stat(fullPath)

                if (!fileState.isFile()) {
                    continue
                }

                const session: T = TSON.parse(await fs.readFile(fullPath, { encoding: 'utf-8' }))
                results.push(session)
            }
            return results
        })
    }

    get(id: string): Promise<T> {
        return this.execute(id, 'get', async () => {
            const fullPath = path.resolve(this.directory, id + '.json')
            return TSON.parse(await fs.readFile(fullPath, { encoding: 'utf-8' }))
        })
    }

    set(session: T): Promise<void> {
        const serialized = TSON.stringify(session, undefined, 4)

        return this.execute(session.id, 'set', async () => {
            const fullPath = path.resolve(this.directory, session.id + '.json')
            return await fs.writeFile(fullPath, serialized)
        }, ['get', 'delete'])
    }

    update(id: string, reducer: (old: T) => T): Promise<void> {
        return this.execute(id, 'update', async () => {
            const fullPath = path.resolve(this.directory, id + '.json')
            const old = TSON.parse(await fs.readFile(fullPath, { encoding: 'utf-8' }))
            const newData = reducer(old)
            const serialized = TSON.stringify(newData, undefined, 4)
            return await fs.writeFile(fullPath, serialized)
        }, ['get', 'set', 'delete'], true)
    }

    delete(id: string): Promise<void> {
        return this.execute(id, 'delete', async () => {
            const fullPath = path.resolve(this.directory, id + '.json')
            return await fs.unlink(fullPath)
        })
    }
}