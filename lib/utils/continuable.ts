import {
    ContinuableState,
    ContinuableFunction,
    ContinuableUpdateHook,
    ContinuableFixedExtension,
    ContinuableContinuableExtension,
    ContinuableContext,
    BaseContinuableContext,
    ContinuableStateResult,
    UnwrapContinuableExtension
} from '../interfaces'

import * as Typeson from 'typeson-registry/dist/all.js';
const {presets: {structuredCloningThrowing}} = Typeson;
const tson = new Typeson().register([
    structuredCloningThrowing
]);

const makeState: () => ContinuableState = (): ContinuableState => ({
    results: [],
    data: {}
})

export const runContinuable = <
    T extends ContinuableFixedExtension,
    U extends ContinuableContinuableExtension,
    V extends any[],
    W
>(
    asyncFn: ContinuableFunction<T, U, V, W>,
    extension: T,
    continuableExtension: U,
    oldState: ContinuableState | null,
    updateHook: ContinuableUpdateHook | null,
    ...args: V
): W => {
    const state: ContinuableState = oldState == null ? makeState() : tson.parse(tson.stringify(oldState))

    const oldResults: ContinuableState['results'] = [...state.results]

    const emitUpdate = () => {
        if (updateHook != null) {
            updateHook(state)
        }
    }

    const bareContext: BaseContinuableContext = {
        wrap (fn) {
            return ((...args: any[]) => {
                if (oldResults.length > 0) {
                    const result: ContinuableStateResult = oldResults.shift()!

                    if (result.success) {
                        if (result.async) {
                            return Promise.resolve(result.result)
                        } else {
                            return result.result
                        }
                    } else {
                        if (result.async) {
                            return Promise.reject(result.error)
                        } else {
                            throw result.error
                        }
                    }
                }

                try {
                    const result = fn(...args)
                    if (result != null && typeof result === 'object' && typeof result.then === 'function') {
                        return result
                        .then((result: any) => {
                            state.results.push({
                                success: true,
                                async: true,
                                result
                            })
                            emitUpdate()
                            return result
                        })
                        .catch((error: any) => {
                            state.results.push({
                                success: false,
                                async: true,
                                error
                            })
                            emitUpdate()
                            throw error
                        })

                    } else {
                        state.results.push({
                            success: true,
                            async: false,
                            result
                        })
                        emitUpdate()
                        return result
                    }
                    
                } catch (error) {
                    state.results.push({
                        success: false,
                        async: false,
                        error
                    })
                    emitUpdate()
                    throw error
                }
            }) as any
        },
        run (fn) {
            return bareContext.wrap(fn)()
        },
        get data () {
            return state.data
        }
    }

    const wrappedCtx: T = new Proxy(extension, {
        get(target, k) {
            if (typeof k === 'string' && typeof extension[k] === 'function') {
                return bareContext.wrap((...args: any[]) => {
                    return extension[k](...args)
                }) as any
            } else {
                return extension[k as any]
            }
        }
    })

    const wrappedContinuableCtx: UnwrapContinuableExtension<U> = new Proxy(continuableExtension, {
        get(target, k) {
            if (typeof k === 'string' && typeof continuableExtension[k] === 'function') {
                return ((...args: any[]) => {
                    return continuableExtension[k](bareContext, ...args)
                }) as any
            } else {
                return continuableExtension[k as any]
            }
        }
    }) as any

    const mergedContext: ContinuableContext<T, U> = new Proxy({}, {
        get(target, k) {
            if (typeof k !== 'string') {
                return (target as any)[k]
            }

            return wrappedContinuableCtx[k] || wrappedCtx[k]
        }
    }) as any

    return asyncFn(mergedContext, ...args)
}