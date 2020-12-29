import type {
    BaseContinuableContext,
    ContinuableContext
} from '../lib/interfaces'

import { runContinuable } from '../lib/utils/continuable'

const a = {
    async sendMessage(msg: string) {
        return {
            success: true
        }
    }
}

const b = {
    async question(ctx: BaseContinuableContext, question: string, opts: string[]) {
        const method = ctx.wrap(() => {
            console.log('DEBUG: send message here')
            return 1
        })
        const method2 = ctx.wrap(async () => {
            console.log('DEBUG: poll message here')
            return 1
        })
        method()
        return method2()
    }
}

type Context = ContinuableContext<typeof a, typeof b>

const program = async (ctx: Context, msg: any, A: string) => {
    const b = await ctx.sendMessage('')
    const c = await ctx.question('aaa', ['1', '2'])
    return [A, b, c]
}

const log = (c: any) => {
    console.log('==== update start ====')
    console.log(c)
    console.log('==== update end   ====')
}

const case1 = async () => {
    return runContinuable(program, a, b, null, log, null as never, '1')
}

const case2 = async () => {
    return runContinuable(program, a, b, {
        results: [
            {
                success: true,
                async: true,
                result: {
                    success: true
                }
            },
            {
                success: true,
                async: false,
                result: 1
            }
        ],
        data: {}
    }, log, null as never, '1')
}

async function main () {
    console.log('==== case 1        ====')
    console.log(await case1())
    console.log('==== case 2        ====')
    console.log(await case2())
}

main()
